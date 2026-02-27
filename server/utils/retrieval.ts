import { embedMany } from "ai";
import { Pinecone } from "@pinecone-database/pinecone";
import { log } from "./logger";

/**
 * Searches the book knowledge base for fragments relevant to the query.
 *
 * @param query - The search query string.
 * @param bookIds - Array of book IDs to filter by.
 * @param limit - Maximum number of fragments to return (default: 5).
 * @returns Array of fragments with their text, pageNumber, chapterTitle, and score.
 */
export async function searchBookKnowledge(
  query: string,
  bookIds: string[],
  limit = 5,
) {
  const config = useRuntimeConfig();

  log.info("retrieval", "Starting knowledge search", {
    queryLength: query.length,
    bookIdsCount: bookIds?.length || 0,
    limit,
  });

  // 1. Generate embedding for the query
  // We use embedMany with a single value to stay consistent with the project's AI SDK usage pattern
  // found in server/utils/inngest.ts and server/api/tests/vectorize-pipeline.ts.
  const { embeddings } = await embedMany({
    model: "openai/text-embedding-3-large",
    values: [query],
    providerOptions: {
      openai: { dimensions: 1024 },
    },
  });

  const queryEmbedding = embeddings[0];
  if (!queryEmbedding) {
    log.error("retrieval", "Failed to generate embedding for the query");
    throw new Error("Failed to generate embedding for the query.");
  }

  // 2. Initialize Pinecone and search the index
  const pc = new Pinecone({
    apiKey: config.pineconeApiKey,
  });
  const index = pc.index(config.pineconeIndex);

  const queryResponse = await index.query({
    vector: queryEmbedding,
    topK: limit,
    filter: {
      bookId: { $in: bookIds },
    },
    includeMetadata: true,
  });

  log.info("retrieval", "Pinecone search completed", {
    matchesFound: queryResponse.matches.length,
    topScore: queryResponse.matches[0]?.score,
  });

  // 3. Format and return the results
  return queryResponse.matches.map((match) => ({
    text: (match.metadata?.text as string) || "",
    pageNumber: (match.metadata?.pageNumber as number) || 0,
    chapterTitle: (match.metadata?.chapterTitle as string) || "",
    score: match.score || 0,
    bookId: (match.metadata?.bookId as string) || "",
  }));
}
