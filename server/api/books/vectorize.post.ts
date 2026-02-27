import { Pinecone } from "@pinecone-database/pinecone";
import { embedMany } from "ai";
import { extractText } from "../../utils/textParser";
import { splitPages, type TextChunk } from "../../utils/textSplitter";
import {
  getFileHash,
  isFileVectorized,
  markFileAsVectorized,
} from "../../utils/hashStore";
import { createJob, updateJob, generateJobId } from "../../utils/jobStore";
import { markBookVectorized, getBookByBlobUrl } from "../../utils/bookStore";

const EMBED_BATCH_SIZE = 100;
const MAX_PARALLEL_BATCHES = 3;
const PINECONE_BATCH_SIZE = 100;
const VERCEL_BODY_LIMIT_BYTES = 4.5 * 1024 * 1024;

/**
 * POST /api/books/vectorize
 *
 * Accepts a JSON body with:
 *   - blobUrl: string   — URL of the uploaded file in Vercel Blob
 *   - bookName: string  — human-readable book title
 *   - bookId?: string   — unique ID of the book in the store
 *   - resume?: boolean  — if true, skip already-vectorized chunks (default: false)
 *
 * Returns 202 Accepted immediately with a jobId.
 * The actual processing runs in the background via event.waitUntil().
 * Poll GET /api/books/jobs/:id for progress.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();

  // --- Validate input ---
  const body = await readBody(event);
  const { blobUrl, bookName, bookId: providedBookId, resume, author } = body ?? {};

  if (!blobUrl || typeof blobUrl !== "string") {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing or invalid 'blobUrl' in request body.",
    });
  }
  if (!bookName || typeof bookName !== "string") {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing or invalid 'bookName' in request body.",
    });
  }

  // Resolve bookId if not provided
  let bookId = providedBookId;
  if (!bookId) {
    const book = await getBookByBlobUrl(blobUrl);
    bookId = book?.id;
  }

  if (!bookId) {
    throw createError({
      statusCode: 404,
      statusMessage: "Book not found in store for the provided blobUrl.",
    });
  }

  // Create job and start background processing
  const jobId = generateJobId();
  await createJob(jobId, bookName);

  const backgroundWork = processBook({
    jobId,
    bookId,
    blobUrl,
    bookName,
    author: typeof author === "string" ? author.trim() : undefined,
    resume: !!resume,
    pineconeApiKey: config.pineconeApiKey,
    pineconeIndex: config.pineconeIndex,
  });

  // Use waitUntil if available (Vercel/Nitro), otherwise fire-and-forget
  if (typeof event.waitUntil === "function") {
    event.waitUntil(backgroundWork);
  } else {
    // Local dev: fire-and-forget (catch errors to avoid unhandled rejections)
    backgroundWork.catch(() => {});
  }

  // Return 202 immediately
  setResponseStatus(event, 202);
  return {
    status: "accepted",
    jobId,
    message: `Vectorization job started for "${bookName}".`,
    statusUrl: `/api/books/jobs/${jobId}`,
  };
});

// ---- Background processing pipeline ----

interface ProcessBookParams {
  jobId: string;
  bookId: string;
  blobUrl: string;
  bookName: string;
  author?: string;
  resume: boolean;
  pineconeApiKey: string;
  pineconeIndex: string;
}

async function processBook(params: ProcessBookParams): Promise<void> {
  const {
    jobId,
    bookId,
    blobUrl,
    bookName,
    author,
    resume,
    pineconeApiKey,
    pineconeIndex,
  } = params;

  try {
    await updateJob(jobId, { status: "processing" });

    // --- 1. Fetch file from Blob ---
    const filename = blobUrl.split("/").pop() || "unknown.txt";
    const response = await fetch(blobUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to download file from Blob: ${response.statusText}`,
      );
    }
    
    // Check size for Vercel limits (warning only since this is background, but good to log)
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > VERCEL_BODY_LIMIT_BYTES) {
      console.warn(`File size (${contentLength} bytes) exceeds Vercel request body limit (4.5MB). Background processing might still work but check logs.`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // --- 1.5 Hash check ---
    // If exact file payload is already vectorized, skip processing to prevent abuse.
    const fileHash = getFileHash(buffer);
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
      return;
    }

    // --- 2. Extract text page-by-page ---
    const pages = await extractText(buffer, filename);
    if (!pages.length) {
      throw new Error("No text could be extracted from the file.");
    }

    const pc = new Pinecone({ apiKey: pineconeApiKey });
    const index = pc.index(pineconeIndex);

    // Pre-calculate total chunks for progress reporting
    const allChunks = splitPages(pages);
    const totalChunks = allChunks.length;

    await updateJob(jobId, {
      progress: {
        currentPage: 0,
        totalPages: pages.length,
        chunksProcessed: 0,
        totalChunks,
      },
    });

    // --- 3. Get existing IDs for resume ---
    let existingIds = new Set<string>();
    if (resume) {
      existingIds = await getExistingChunkIds(index, bookId, allChunks);
    }

    // --- 4. Stream: process page-by-page ---
    let chunksProcessed = 0;
    let skipped = 0;
    let newVectors = 0;
    let globalChunkOffset = 0;

    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      try {
        const page = pages[pageIdx]!;

        // Chunk this single page
        const pageChunks = splitPages([page]).map((c) => ({
          ...c,
          chunkIndex: globalChunkOffset + c.chunkIndex,
        }));
        globalChunkOffset += pageChunks.length;

        // Filter out already-processed chunks (resume mode)
        const newChunks = pageChunks.filter(
          (c) => !existingIds.has(`${bookId}-chunk-${c.chunkIndex}`),
        );
        skipped += pageChunks.length - newChunks.length;

        if (newChunks.length > 0) {
          // Generate embeddings for this page's chunks (parallel batches)
          const embeddings = await generateEmbeddingsParallel(newChunks);

          // Build vectors with metadata
          const vectors = newChunks.map((chunk, i) => ({
            id: `${bookId}-chunk-${chunk.chunkIndex}`,
            values: embeddings[i]!,
            metadata: {
              bookId,
              bookName,
              author: author || "Unknown",
              blobUrl,
              chunkIndex: chunk.chunkIndex,
              pageNumber: chunk.pageNumber,
              chapterTitle: chunk.title || "",
              text: chunk.text.slice(0, 1000),
            },
          }));

          // Upsert this page's vectors
          for (let i = 0; i < vectors.length; i += PINECONE_BATCH_SIZE) {
            const batch = vectors.slice(i, i + PINECONE_BATCH_SIZE);
            await index.upsert({ records: batch });
          }

          newVectors += vectors.length;
        }

        chunksProcessed += pageChunks.length;

        // Update progress after each page
        await updateJob(jobId, {
          progress: {
            currentPage: pageIdx + 1,
            totalPages: pages.length,
            chunksProcessed,
            totalChunks,
          },
        });
      } catch (pageError) {
        console.error(`Error processing page ${pageIdx + 1} of ${bookName}:`, pageError);
        // Continue to next page instead of failing entire book
      }
    }

    // --- 5. Mark complete ---
    await markFileAsVectorized(fileHash);

    // Mark book as vectorized in the persistent store
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
        newVectors,
      },
    });
  } catch (error: unknown) {
    await updateJob(jobId, {
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

// ---- Helper functions ----

async function generateEmbeddingsParallel(
  chunks: TextChunk[],
): Promise<number[][]> {
  const batches: TextChunk[][] = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    batches.push(chunks.slice(i, i + EMBED_BATCH_SIZE));
  }

  const allEmbeddings: number[][] = [];

  for (let i = 0; i < batches.length; i += MAX_PARALLEL_BATCHES) {
    const parallelBatches = batches.slice(i, i + MAX_PARALLEL_BATCHES);

    const results = await Promise.all(
      parallelBatches.map((batch) =>
        embedMany({
          model: "openai/text-embedding-3-large",
          values: batch.map((c) => c.text),
          providerOptions: {
            openai: { dimensions: 1024 },
          },
        }),
      ),
    );

    for (const result of results) {
      allEmbeddings.push(...result.embeddings);
    }
  }

  return allEmbeddings;
}

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
      // If fetch fails, assume nothing exists
    }
  }

  return existing;
}
