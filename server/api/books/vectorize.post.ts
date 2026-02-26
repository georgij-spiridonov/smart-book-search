import { Pinecone } from "@pinecone-database/pinecone";
import { embedMany } from "ai";
import { extractText } from "../../utils/textParser";
import { splitText, type TextChunk } from "../../utils/textSplitter";

/**
 * POST /api/books/vectorize
 *
 * Accepts a JSON body with:
 *   - blobUrl: string   — URL of the uploaded file in Vercel Blob
 *   - bookName: string  — human-readable book title
 *
 * Pipeline:
 *   1. Fetch the file from Vercel Blob
 *   2. Extract text (PDF or TXT)
 *   3. Split text into chunks
 *   4. Generate embeddings via AI SDK (openai/text-embedding-3-large, 1024 dims)
 *   5. Upsert vectors into Pinecone
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();

  // --- Validate input ---
  const body = await readBody(event);
  const { blobUrl, bookName } = body ?? {};

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

  // --- 2. Extract text ---
  const fullText = await extractText(buffer, filename);
  if (!fullText || fullText.trim().length === 0) {
    throw createError({
      statusCode: 422,
      statusMessage: "No text could be extracted from the file.",
    });
  }

  // --- 3. Chunk text ---
  const chunks = splitText(fullText);

  // --- 4. Generate embeddings (batches of 100) ---
  const BATCH_SIZE = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const { embeddings } = await embedMany({
      model: "openai/text-embedding-3-large",
      values: batch.map((c: TextChunk) => c.text),
      providerOptions: {
        openai: {
          dimensions: 1024,
        },
      },
    });
    allEmbeddings.push(...embeddings);
  }

  // --- 5. Upsert into Pinecone ---
  const pc = new Pinecone({ apiKey: config.pineconeApiKey });
  const index = pc.index(config.pineconeIndex);

  // Upsert in batches of 100 vectors
  const vectors = chunks.map((chunk: TextChunk, i: number) => ({
    id: `${slugify(bookName)}-chunk-${chunk.chunkIndex}`,
    values: allEmbeddings[i]!,
    metadata: {
      bookName,
      blobUrl,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text.slice(0, 1000), // store up to 1000 chars for context display
    },
  }));

  for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
    const batch = vectors.slice(i, i + BATCH_SIZE);
    await index.upsert({ records: batch });
  }

  return {
    status: "success",
    message: `Book "${bookName}" vectorized successfully.`,
    stats: {
      totalChunks: chunks.length,
      totalVectors: vectors.length,
    },
  };
});

/**
 * Simple slugify helper for generating deterministic vector IDs.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
