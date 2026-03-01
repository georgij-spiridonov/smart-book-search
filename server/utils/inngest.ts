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
import { log } from "./logger";
import { publishEvent } from "./events";

async function fetchBlobWithRetries(
  url: string,
  maxRetries = 10,
  delayMs = 2000,
): Promise<Response> {
  let response = await fetch(url);
  let retries = 0;
  while (!response.ok && response.status === 404 && retries < maxRetries) {
    log.warn("inngest", "Blob not found on GET, retrying...", {
      url,
      attempt: retries + 1,
    });
    await new Promise((r) => setTimeout(r, delayMs));
    response = await fetch(url);
    retries++;
  }
  return response;
}

// Create Inngest client
const isDev = process.env.NODE_ENV !== "production";
export const inngest = new Inngest({
  id: "smart-book-search",
  isDev,
  eventKey: isDev ? "test" : process.env.INNGEST_EVENT_KEY,
});

const PINECONE_BATCH_SIZE = 96;

/**
 * Inngest function for book vectorization.
 * Breaks the long-running process into steps to avoid Vercel timeouts.
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
      await step.run("update-job-status", async () => {
        log.info("inngest", "Starting vectorize-book step function", {
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

      // 1. Wait for blob availability
      await step.run("wait-for-blob", async () => {
        const maxRetries = 50;
        let retries = 0;

        while (retries < maxRetries) {
          try {
            const response = await fetch(blobUrl, { method: "HEAD" });
            if (response.ok) return true;
          } catch {
            // ignore
          }
          await new Promise((resolve) => setTimeout(resolve, 2000));
          retries++;
        }
        throw new Error("Blob did not become available.");
      });

      // 2. Fetch and hash check
      const { fileHash, filename } = await step.run(
        "fetch-and-hash",
        async () => {
          const response = await fetchBlobWithRetries(blobUrl);
          if (!response.ok) throw new Error("Failed to download file.");
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const fileHash = getFileHash(buffer);
          const filename = blobUrl.split("/").pop() || "unknown.txt";
          return { fileHash, filename };
        },
      );

      const alreadyVectorized = await step.run(
        "check-already-vectorized",
        async () => {
          if (!resume && (await isFileVectorized(fileHash))) {
            const result = {
              totalPages: 0,
              totalChunks: 0,
              skipped: 0,
              newVectors: 0,
            };
            await updateJob(jobId, { status: "completed", result });
            if (userId) {
              await publishEvent(userId, "job:updated", {
                jobId,
                status: "completed",
                result,
              });
            }
            return true;
          }
          return false;
        },
      );

      if (alreadyVectorized) return;

      // 3. Extract text
      const pages = await step.run("extract-text", async () => {
        const response = await fetchBlobWithRetries(blobUrl);
        if (!response.ok) throw new Error("Failed to download file.");
        const buffer = Buffer.from(await response.arrayBuffer());
        const extractedPages = await extractText(buffer, filename);
        if (!extractedPages.length) throw new Error("No text extracted.");
        return extractedPages;
      });

      const totalChunks = await step.run("calculate-total-chunks", async () => {
        const allChunks = splitPages(pages);
        const count = allChunks.length;
        const progress = {
          currentPage: 0,
          totalPages: pages.length,
          chunksProcessed: 0,
          totalChunks: count,
        };
        await updateJob(jobId, { progress });
        if (userId) {
          await publishEvent(userId, "job:updated", {
            jobId,
            status: "processing",
            progress,
          });
        }
        return count;
      });

      // 4. Process in batches
      // Dynamically adjust batch size: for small files process 1 by 1, for large up to 10
      const PAGE_BATCH_SIZE = Math.max(
        1,
        Math.min(10, Math.floor(pages.length / 10)),
      );
      let chunksProcessed = 0;
      let skipped = 0;
      let newVectorsCount = 0;
      let globalChunkOffset = 0;

      const pc = new Pinecone({ apiKey: pineconeApiKey });
      const index = pc.index(pineconeIndex);

      // Get existing IDs if resume
      let existingIds = new Set<string>();
      if (resume) {
        const idsArray = await step.run("get-existing-ids", async () => {
          const allChunks = splitPages(pages);
          const ids = await getExistingChunkIds(index, bookId, allChunks);
          return Array.from(ids);
        });
        existingIds = new Set(idsArray);
      }

      for (let i = 0; i < pages.length; i += PAGE_BATCH_SIZE) {
        const pageBatch = pages.slice(i, i + PAGE_BATCH_SIZE);

        const result = await step.run(
          `process-pages-${i}-${i + PAGE_BATCH_SIZE}`,
          async () => {
            let batchNewVectors = 0;
            let batchSkipped = 0;
            let batchChunksProcessed = 0;
            let localOffset = globalChunkOffset;

            for (const page of pageBatch) {
              const pageChunks = splitPages([page]).map((c) => ({
                ...c,
                chunkIndex: localOffset + c.chunkIndex,
              }));
              localOffset += pageChunks.length;

              const newChunks = pageChunks.filter(
                (c) =>
                  !existingIds.has(
                    `${Buffer.from(bookId).toString("base64url")}-chunk-${c.chunkIndex}`,
                  ),
              );
              batchSkipped += pageChunks.length - newChunks.length;

              if (newChunks.length > 0) {
                const records = newChunks.map((chunk) => ({
                  id: `${Buffer.from(bookId).toString("base64url")}-chunk-${chunk.chunkIndex}`,
                  text: chunk.text.slice(0, 1000),
                  bookId,
                  bookName,
                  author: author || "Unknown",
                  blobUrl,
                  chunkIndex: chunk.chunkIndex,
                  pageNumber: chunk.pageNumber,
                  chapterTitle: chunk.title || "",
                }));

                const upsertPromises = [];
                for (let j = 0; j < records.length; j += PINECONE_BATCH_SIZE) {
                  upsertPromises.push(
                    index.upsertRecords({
                      records: records.slice(j, j + PINECONE_BATCH_SIZE),
                    }),
                  );
                }
                await Promise.all(upsertPromises);
                batchNewVectors += records.length;
              }
              batchChunksProcessed += pageChunks.length;
            }

            return {
              batchNewVectors,
              batchSkipped,
              batchChunksProcessed,
              nextOffset: localOffset,
            };
          },
        );

        newVectorsCount += result.batchNewVectors;
        skipped += result.batchSkipped;
        chunksProcessed += result.batchChunksProcessed;
        globalChunkOffset = result.nextOffset;

        await step.run(`update-progress-${i}`, async () => {
          const progress = {
            currentPage: Math.min(i + PAGE_BATCH_SIZE, pages.length),
            totalPages: pages.length,
            chunksProcessed,
            totalChunks,
          };
          await updateJob(jobId, { progress });
          if (userId) {
            await publishEvent(userId, "job:updated", {
              jobId,
              status: "processing",
              progress,
            });
          }
        });
      }

      // 5. Finalize
      await step.run("finalize-job", async () => {
        await markFileAsVectorized(fileHash);
        try {
          await markBookVectorized(bookId);
        } catch {
          // ignore
        }

        const result = {
          totalPages: pages.length,
          totalChunks,
          skipped,
          newVectors: newVectorsCount,
        };

        await updateJob(jobId, { status: "completed", result });

        if (userId) {
          await publishEvent(userId, "job:updated", {
            jobId,
            status: "completed",
            result,
          });
          await publishEvent(userId, "book:updated", {
            bookId,
            vectorized: true,
          });
        }
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      await step.run("mark-failed", async () => {
        await updateJob(jobId, { status: "failed", error: errorMessage });
        if (userId) {
          await publishEvent(userId, "job:updated", {
            jobId,
            status: "failed",
            error: errorMessage,
          });
        }
      });
      throw error;
    }
  },
);

async function getExistingChunkIds(
  index: any,
  bookId: string,
  chunks: TextChunk[],
): Promise<Set<string>> {
  const candidateIds = chunks.map(
    (c) => `${Buffer.from(bookId).toString("base64url")}-chunk-${c.chunkIndex}`,
  );
  const existing = new Set<string>();
  for (let i = 0; i < candidateIds.length; i += 1000) {
    const batch = candidateIds.slice(i, i + 1000);
    const fetched = await index.fetch({ ids: batch }).catch(() => ({ records: {} }));
    if (fetched && fetched.records) {
      for (const id of Object.keys(fetched.records)) existing.add(id);
    }
  }
  return existing;
}
