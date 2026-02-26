import { Pinecone } from "@pinecone-database/pinecone";
import { embedMany } from "ai";
import { extractText } from "../../utils/textParser";
import { splitPages, type TextChunk } from "../../utils/textSplitter";

const EMBED_BATCH_SIZE = 100;
const MAX_PARALLEL_BATCHES = 3;
const PINECONE_BATCH_SIZE = 100;

/**
 * POST /api/books/vectorize
 *
 * Accepts a JSON body with:
 *   - blobUrl: string   — URL of the uploaded file in Vercel Blob
 *   - bookName: string  — human-readable book title
 *   - resume?: boolean  — if true, skip already-vectorized chunks (default: false)
 *
 * Pipeline:
 *   1. Fetch the file from Vercel Blob
 *   2. Extract text page-by-page (PDF, EPUB, TXT)
 *   3. Split text into chunks with page numbers
 *   4. (Resume) Check which chunks already exist in Pinecone
 *   5. Generate embeddings in parallel batches via AI SDK
 *   6. Upsert vectors into Pinecone
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();

  // --- Validate input ---
  const body = await readBody(event);
  const { blobUrl, bookName, resume } = body ?? {};

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

  // --- 1. Fetch file from Blob ---
  const filename = blobUrl.split("/").pop() || "unknown.txt";
  const response = await fetch(blobUrl);
  if (!response.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: `Failed to download file from Blob: ${response.statusText}`,
    });
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // --- 2. Extract text (page-by-page) ---
  const pages = await extractText(buffer, filename);
  if (!pages.length) {
    throw createError({
      statusCode: 422,
      statusMessage: "No text could be extracted from the file.",
    });
  }

  // --- 3. Chunk text (preserving page numbers) ---
  let chunks = splitPages(pages);
  const bookSlug = slugify(bookName);

  // --- 4. Resume: filter out already-processed chunks ---
  const pc = new Pinecone({ apiKey: config.pineconeApiKey });
  const index = pc.index(config.pineconeIndex);

  let skippedCount = 0;
  if (resume) {
    const existingIds = await getExistingChunkIds(index, bookSlug, chunks);
    const before = chunks.length;
    chunks = chunks.filter(
      (c) => !existingIds.has(`${bookSlug}-chunk-${c.chunkIndex}`),
    );
    skippedCount = before - chunks.length;
  }

  if (chunks.length === 0) {
    return {
      status: "success",
      message: `Book "${bookName}" is already fully vectorized.`,
      stats: { totalChunks: 0, skipped: skippedCount, newVectors: 0 },
    };
  }

  // --- 5. Generate embeddings in parallel ---
  const allEmbeddings = await generateEmbeddingsParallel(chunks);

  // --- 6. Upsert into Pinecone ---
  const vectors = chunks.map((chunk: TextChunk, i: number) => ({
    id: `${bookSlug}-chunk-${chunk.chunkIndex}`,
    values: allEmbeddings[i]!,
    metadata: {
      bookName,
      blobUrl,
      chunkIndex: chunk.chunkIndex,
      pageNumber: chunk.pageNumber,
      text: chunk.text.slice(0, 1000),
    },
  }));

  for (let i = 0; i < vectors.length; i += PINECONE_BATCH_SIZE) {
    const batch = vectors.slice(i, i + PINECONE_BATCH_SIZE);
    await index.upsert({ records: batch });
  }

  return {
    status: "success",
    message: `Book "${bookName}" vectorized successfully.`,
    stats: {
      totalPages: pages.length,
      totalChunks: chunks.length + skippedCount,
      skipped: skippedCount,
      newVectors: vectors.length,
    },
  };
});

// ---- Helper functions ----

/**
 * Generate embeddings for chunks using parallel batches (up to MAX_PARALLEL_BATCHES).
 */
async function generateEmbeddingsParallel(
  chunks: TextChunk[],
): Promise<number[][]> {
  // Split into batches of EMBED_BATCH_SIZE
  const batches: TextChunk[][] = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    batches.push(chunks.slice(i, i + EMBED_BATCH_SIZE));
  }

  const allEmbeddings: number[][] = [];

  // Process MAX_PARALLEL_BATCHES at a time
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

/**
 * Query Pinecone for already-existing chunk IDs for this book.
 */
async function getExistingChunkIds(
  index: ReturnType<Pinecone["index"]>,
  bookSlug: string,
  chunks: TextChunk[],
): Promise<Set<string>> {
  const candidateIds = chunks.map((c) => `${bookSlug}-chunk-${c.chunkIndex}`);

  const existing = new Set<string>();

  // Fetch in batches of 1000 (Pinecone limit)
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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
