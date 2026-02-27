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

// Create Inngest client
// In development:
//   - isDev: true → routes events to local Dev Server (localhost:8288) instead of Inngest Cloud
//   - eventKey: "test" → prevents SDK from auto-reading the cloud INNGEST_EVENT_KEY from .env
const isDev = process.env.NODE_ENV !== "production";
export const inngest = new Inngest({
  id: "smart-book-search",
  isDev,
  eventKey: isDev ? "test" : process.env.INNGEST_EVENT_KEY,
});

const PINECONE_BATCH_SIZE = 100;

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
      blobUrl,
      bookName,
      author,
      resume,
      pineconeApiKey,
      pineconeIndex,
    } = event.data;

    log.info("inngest", "Starting vectorize-book step function", {
      jobId,
      bookId,
      resume,
    });

    try {
      await step.run("update-job-status", async () => {
        await updateJob(jobId, { status: "processing" });
      });

      // 1. Fetch and hash check
      const { fileHash, filename } = await step.run(
        "fetch-and-hash",
        async () => {
          log.info("inngest", "Fetching blob for hash check", { blobUrl });
          const response = await fetch(blobUrl);
          if (!response.ok) {
            log.error("inngest", "Failed to download file from Blob", {
              statusText: response.statusText,
            });
            throw new Error(
              `Failed to download file from Blob: ${response.statusText}`,
            );
          }
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const fileHash = getFileHash(buffer);
          const filename = blobUrl.split("/").pop() || "unknown.txt";

          // Return only what's needed for next steps.
          // We re-fetch in extraction to avoid passing large buffers through Inngest state (4MB limit).
          return { fileHash, filename };
        },
      );

      const alreadyVectorized = await step.run(
        "check-already-vectorized",
        async () => {
          if (!resume && (await isFileVectorized(fileHash))) {
            await updateJob(jobId, {
              status: "completed",
              result: {
                totalPages: 0,
                totalChunks: 0,
                skipped: 0,
                newVectors: 0,
              },
            });
            return true;
          }
          return false;
        },
      );

      if (alreadyVectorized) return;

      // 2. Extract text
      // We re-fetch here to avoid passing large buffers through Inngest state
      const pages = await step.run("extract-text", async () => {
        log.info("inngest", "Extracting text from document", { fileHash });
        const response = await fetch(blobUrl);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const extractedPages = await extractText(buffer, filename);
        if (!extractedPages.length) {
          throw new Error("No text could be extracted from the file.");
        }
        return extractedPages;
      });

      const totalChunks = await step.run("calculate-total-chunks", async () => {
        const allChunks = splitPages(pages);
        const count = allChunks.length;
        await updateJob(jobId, {
          progress: {
            currentPage: 0,
            totalPages: pages.length,
            chunksProcessed: 0,
            totalChunks: count,
          },
        });
        return count;
      });

      // 3. Process in batches of pages to stay within step limits
      const PAGE_BATCH_SIZE = 10;
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
                (c) => !existingIds.has(`${bookId}-chunk-${c.chunkIndex}`),
              );
              batchSkipped += pageChunks.length - newChunks.length;

              if (newChunks.length > 0) {
                log.info(
                  "inngest",
                  "Upserting new chunks via integrated embedding",
                  {
                    chunkCount: newChunks.length,
                  },
                );
                const records = newChunks.map((chunk) => ({
                  id: `${bookId}-chunk-${chunk.chunkIndex}`,
                  text: chunk.text.slice(0, 1000),
                  bookId,
                  bookName,
                  author: author || "Unknown",
                  blobUrl,
                  chunkIndex: chunk.chunkIndex,
                  pageNumber: chunk.pageNumber,
                  chapterTitle: chunk.title || "",
                }));

                for (let j = 0; j < records.length; j += PINECONE_BATCH_SIZE) {
                  await index.upsertRecords({
                    records: records.slice(j, j + PINECONE_BATCH_SIZE),
                  });
                }
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
          await updateJob(jobId, {
            progress: {
              currentPage: Math.min(i + PAGE_BATCH_SIZE, pages.length),
              totalPages: pages.length,
              chunksProcessed,
              totalChunks,
            },
          });
        });
      }

      // 4. Finalize
      await step.run("finalize-job", async () => {
        log.info("inngest", "Finalizing vectorization process", {
          totalPages: pages.length,
          totalChunks,
          skipped,
          newVectors: newVectorsCount,
        });
        await markFileAsVectorized(fileHash);
        try {
          await markBookVectorized(bookId);
        } catch {
          // Book may not exist in store if uploaded before this feature
        }

        await updateJob(jobId, {
          status: "completed",
          result: {
            totalPages: pages.length,
            totalChunks,
            skipped,
            newVectors: newVectorsCount,
          },
        });
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown error during background processing";

      log.error("inngest", "Background processing failed", {
        jobId,
        bookId,
        error: errorMessage,
      });

      await step.run("mark-failed", async () => {
        await updateJob(jobId, {
          status: "failed",
          error: errorMessage,
        });
      });
      throw error; // Re-throw for Inngest retry logic
    }
  },
);

// --- Helper functions ---

async function getExistingChunkIds(
  index: ReturnType<Pinecone["index"]>,
  bookId: string,
  chunks: TextChunk[],
): Promise<Set<string>> {
  const candidateIds = chunks.map((c) => `${bookId}-chunk-${c.chunkIndex}`);
  const existing = new Set<string>();
  for (let i = 0; i < candidateIds.length; i += 1000) {
    const batch = candidateIds.slice(i, i + 1000);
    try {
      const fetched = await index.fetch({ ids: batch });
      if (fetched.records) {
        for (const id of Object.keys(fetched.records)) {
          existing.add(id);
        }
      }
    } catch {
      // If fetch fails, assume nothing exists to proceed with vectorization
    }
  }
  return existing;
}
