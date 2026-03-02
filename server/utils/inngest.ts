import { Inngest } from "inngest";
import { Pinecone } from "@pinecone-database/pinecone";
import { extractText } from "./textParser";
import { splitPages, type TextChunk } from "./textSplitter";
import {
  getFileHash,
  isFileVectorized,
  markFileAsVectorized,
} from "./hashStore";
import { updateJob } from "./jobStore";
import { markBookVectorized } from "./bookStore";
import { logger } from "./logger";
import { publishEvent } from "./events";

/**
 * Выполняет загрузку файла (blob) с несколькими попытками при 404 ошибке.
 * Это необходимо, так как Vercel Blob может быть доступен не мгновенно после загрузки.
 * 
 * @param {string} fileUrl URL файла.
 * @param {number} maxRetries Максимальное количество попыток.
 * @param {number} retryDelayMs Задержка между попытками в мс.
 * @returns {Promise<Response>} Ответ fetch.
 */
async function fetchBlobWithRetries(
  fileUrl: string,
  maxRetries = 10,
  retryDelayMs = 2000,
): Promise<Response> {
  let fetchResponse = await fetch(fileUrl);
  let currentRetry = 0;

  while (!fetchResponse.ok && fetchResponse.status === 404 && currentRetry < maxRetries) {
    logger.warn("inngest", "Blob not found on GET, retrying...", {
      url: fileUrl,
      attempt: currentRetry + 1,
    });
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    fetchResponse = await fetch(fileUrl);
    currentRetry++;
  }
  return fetchResponse;
}

// Создание клиента Inngest
const isDevelopment = process.env.NODE_ENV !== "production";
export const inngest = new Inngest({
  id: "smart-book-search",
  isDev: isDevelopment,
  eventKey: isDevelopment ? "test" : process.env.INNGEST_EVENT_KEY,
});

/** Размер порции данных для вставки в Pinecone */
const PINECONE_UPSERT_BATCH_SIZE = 96;

/**
 * Функция Inngest для векторизации книги.
 * Разбивает длительный процесс на шаги (steps), чтобы избежать таймаутов Vercel.
 */
export const vectorizeBook = inngest.createFunction(
  { id: "vectorize-book", name: "Vectorize Book" },
  { event: "book/vectorize" },
  async ({ event, step }) => {
    const {
      jobId,
      bookId,
      userId,
      blobUrl,
      bookName,
      author,
      resume,
      pineconeApiKey,
      pineconeIndex,
    } = event.data;

    try {
      // Начальный шаг: обновление статуса задачи
      await step.run("update-job-status", async () => {
        logger.info("inngest", "Starting vectorize-book step function", {
          jobId,
          bookId,
          resume,
          userId,
        });
        await updateJob(jobId, { status: "processing" });

        if (userId) {
          await publishEvent(userId, "job:updated", {
            jobId,
            status: "processing",
          });
        }
      });

      // 1. Ожидание доступности файла (blob)
      await step.run("wait-for-blob", async () => {
        const maxCheckAttempts = 50;
        let attemptCounter = 0;

        while (attemptCounter < maxCheckAttempts) {
          try {
            const headResponse = await fetch(blobUrl, { method: "HEAD" });
            if (headResponse.ok) return true;
          } catch {
            // Игнорируем сетевые ошибки при проверке
          }
          await new Promise((resolve) => setTimeout(resolve, 2000));
          attemptCounter++;
        }
        throw new Error("Blob did not become available.");
      });

      // 2. Загрузка файла и проверка хэша
      const { fileHash, filename } = await step.run(
        "fetch-and-hash",
        async () => {
          const downloadResponse = await fetchBlobWithRetries(blobUrl);
          if (!downloadResponse.ok) throw new Error("Failed to download file.");
          
          const fileBuffer = Buffer.from(await downloadResponse.arrayBuffer());
          const generatedHash = getFileHash(fileBuffer);
          const extractedFilename = blobUrl.split("/").pop() || "unknown.txt";
          
          return { fileHash: generatedHash, filename: extractedFilename };
        },
      );

      // Проверка, не был ли этот файл уже векторизован
      const isAlreadyVectorized = await step.run(
        "check-already-vectorized",
        async () => {
          if (!resume && (await isFileVectorized(fileHash))) {
            const emptyResult = {
              totalPages: 0,
              totalChunks: 0,
              skipped: 0,
              newVectors: 0,
            };
            await updateJob(jobId, { status: "completed", result: emptyResult });
            
            if (userId) {
              await publishEvent(userId, "job:updated", {
                jobId,
                status: "completed",
                result: emptyResult,
              });
            }
            return true;
          }
          return false;
        },
      );

      if (isAlreadyVectorized) return;

      // 3. Извлечение текста из файла
      const extractedPages = await step.run("extract-text", async () => {
        const downloadResponse = await fetchBlobWithRetries(blobUrl);
        if (!downloadResponse.ok) throw new Error("Failed to download file.");
        
        const fileBuffer = Buffer.from(await downloadResponse.arrayBuffer());
        const pages = await extractText(fileBuffer, filename);
        
        if (!pages.length) throw new Error("No text extracted.");
        return pages;
      });

      // Подсчет общего количества фрагментов (чанков)
      const totalChunksCount = await step.run("calculate-total-chunks", async () => {
        const allChunks = splitPages(extractedPages);
        const count = allChunks.length;
        const initialProgress = {
          currentPage: 0,
          totalPages: extractedPages.length,
          chunksProcessed: 0,
          totalChunks: count,
        };
        
        await updateJob(jobId, { progress: initialProgress });
        
        if (userId) {
          await publishEvent(userId, "job:updated", {
            jobId,
            status: "processing",
            progress: initialProgress,
          });
        }
        return count;
      });

      // 4. Поэтапная обработка страниц
      /** 
       * Динамический размер пачки страниц: для маленьких файлов по 1, 
       * для больших — до 10 страниц за шаг Inngest.
       */
      const PAGES_PER_BATCH = Math.max(
        1,
        Math.min(10, Math.floor(extractedPages.length / 10)),
      );
      
      let totalChunksProcessed = 0;
      let totalSkippedChunks = 0;
      let totalNewVectors = 0;
      let globalChunkIndexOffset = 0;

      const pineconeClient = new Pinecone({ apiKey: pineconeApiKey });
      const vectorIndex = pineconeClient.index(pineconeIndex);

      // Получаем список уже существующих ID чанков, если это продолжение (resume)
      let existingVectorIds = new Set<string>();
      if (resume) {
        const existingIdsArray = await step.run("get-existing-ids", async () => {
          const allChunks = splitPages(extractedPages);
          const ids = await getExistingVectorIds(vectorIndex, bookId, allChunks);
          return Array.from(ids);
        });
        existingVectorIds = new Set(existingIdsArray);
      }

      // Основной цикл обработки пачек страниц
      for (let i = 0; i < extractedPages.length; i += PAGES_PER_BATCH) {
        const currentPageBatch = extractedPages.slice(i, i + PAGES_PER_BATCH);

        const batchProcessingResult = await step.run(
          `process-pages-${i}-${i + PAGES_PER_BATCH}`,
          async () => {
            let batchNewVectorsCount = 0;
            let batchSkippedCount = 0;
            let batchProcessedCount = 0;
            let currentLocalOffset = globalChunkIndexOffset;

            for (const pageData of currentPageBatch) {
              // Разбиваем страницу на фрагменты
              const pageChunks = splitPages([pageData]).map((chunk) => ({
                ...chunk,
                chunkIndex: currentLocalOffset + chunk.chunkIndex,
              }));
              currentLocalOffset += pageChunks.length;

              // Фильтруем те, что уже есть в базе
              const bookIdBase64 = Buffer.from(bookId).toString("base64url");
              const newChunks = pageChunks.filter(
                (c) => !existingVectorIds.has(`${bookIdBase64}-chunk-${c.chunkIndex}`),
              );
              batchSkippedCount += pageChunks.length - newChunks.length;

              if (newChunks.length > 0) {
                const vectorRecords = newChunks.map((chunk) => ({
                  id: `${bookIdBase64}-chunk-${chunk.chunkIndex}`,
                  text: chunk.text.slice(0, 1000), // Ограничиваем длину для безопасности
                  bookId,
                  bookName,
                  author: author || "Unknown",
                  blobUrl,
                  chunkIndex: chunk.chunkIndex,
                  pageNumber: chunk.pageNumber,
                  chapterTitle: chunk.title || "",
                }));

                // Отправляем в Pinecone порциями
                const upsertPromises = [];
                for (let j = 0; j < vectorRecords.length; j += PINECONE_UPSERT_BATCH_SIZE) {
                  upsertPromises.push(
                    vectorIndex.upsertRecords({
                      records: vectorRecords.slice(j, j + PINECONE_UPSERT_BATCH_SIZE),
                    }),
                  );
                }
                await Promise.all(upsertPromises);
                batchNewVectorsCount += vectorRecords.length;
              }
              batchProcessedCount += pageChunks.length;
            }

            return {
              newVectors: batchNewVectorsCount,
              skipped: batchSkippedCount,
              processed: batchProcessedCount,
              nextOffset: currentLocalOffset,
            };
          },
        );

        totalNewVectors += batchProcessingResult.newVectors;
        totalSkippedChunks += batchProcessingResult.skipped;
        totalChunksProcessed += batchProcessingResult.processed;
        globalChunkIndexOffset = batchProcessingResult.nextOffset;

        // Обновляем прогресс выполнения после каждой пачки
        await step.run(`update-progress-${i}`, async () => {
          const currentProgress = {
            currentPage: Math.min(i + PAGES_PER_BATCH, extractedPages.length),
            totalPages: extractedPages.length,
            chunksProcessed: totalChunksProcessed,
            totalChunks: totalChunksCount,
          };
          await updateJob(jobId, { progress: currentProgress });
          
          if (userId) {
            await publishEvent(userId, "job:updated", {
              jobId,
              status: "processing",
              progress: currentProgress,
            });
          }
        });
      }

      // 5. Завершение работы
      await step.run("finalize-job", async () => {
        // Помечаем файл и книгу как векторизованные в Redis
        await markFileAsVectorized(fileHash);
        try {
          await markBookVectorized(bookId);
        } catch {
          // Игнорируем ошибки обновления статуса книги, если запись не найдена
        }

        const finalExecutionResult = {
          totalPages: extractedPages.length,
          totalChunks: totalChunksCount,
          skipped: totalSkippedChunks,
          newVectors: totalNewVectors,
        };

        await updateJob(jobId, { status: "completed", result: finalExecutionResult });

        if (userId) {
          await publishEvent(userId, "job:updated", {
            jobId,
            status: "completed",
            result: finalExecutionResult,
          });
          await publishEvent(userId, "book:updated", {
            bookId,
            vectorized: true,
          });
        }
      });
    } catch (error: unknown) {
      // Обработка критических ошибок
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      
      await step.run("mark-failed", async () => {
        await updateJob(jobId, { status: "failed", error: errorMsg });
        
        if (userId) {
          await publishEvent(userId, "job:updated", {
            jobId,
            status: "failed",
            error: errorMsg,
          });
        }
      });
      throw error;
    }
  },
);

/**
 * Получает список ID чанков, которые уже существуют в индексе Pinecone.
 */
async function getExistingVectorIds(
  pineconeIndex: ReturnType<Pinecone["index"]>,
  bookId: string,
  allChunks: TextChunk[],
): Promise<Set<string>> {
  const bookIdBase64 = Buffer.from(bookId).toString("base64url");
  const candidateIdsList = allChunks.map(
    (chunk) => `${bookIdBase64}-chunk-${chunk.chunkIndex}`,
  );
  
  const foundIdsSet = new Set<string>();
  
  // Проверяем наличие порциями по 1000 ID
  for (let i = 0; i < candidateIdsList.length; i += 1000) {
    const currentBatch = candidateIdsList.slice(i, i + 1000);
    const fetchResponse = await pineconeIndex.fetch({ ids: currentBatch }).catch(() => ({ records: {} }));
    
    if (fetchResponse && fetchResponse.records) {
      for (const id of Object.keys(fetchResponse.records)) {
        foundIdsSet.add(id);
      }
    }
  }
  return foundIdsSet;
}
