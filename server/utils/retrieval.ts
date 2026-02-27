import { Pinecone } from "@pinecone-database/pinecone";
import { log } from "./logger";

/**
 * Minimum cosine similarity score for a chunk to be considered relevant.
 * Chunks below this threshold are discarded before reaching the LLM,
 * preventing hallucinated answers based on irrelevant context.
 */
const MIN_SCORE = 0.3;

/**
 * Searches the book knowledge base for fragments relevant to the query.
 *
 * Uses Pinecone's integrated embedding (multilingual-e5-large) to convert
 * the query text to a vector server-side and search the index.
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

  // 1. Initialize Pinecone and search using integrated embedding
  // Pinecone converts the query text to a vector automatically using
  // the index's configured model (multilingual-e5-large, input_type: query).
  const pc = new Pinecone({
    apiKey: config.pineconeApiKey,
  });
  const index = pc.index(config.pineconeIndex);

  const searchResponse = await index.searchRecords({
    query: {
      topK: limit,
      inputs: { text: query },
      filter: {
        bookId: { $in: bookIds },
      },
    },
  });

  const hits = searchResponse.result?.hits ?? [];

  log.info("retrieval", "Pinecone search completed", {
    matchesFound: hits.length,
    topScore: hits[0]?._score,
  });

  // 2. Filter by minimum relevance score and format results
  const relevant = hits.filter((hit) => (hit._score ?? 0) >= MIN_SCORE);

  if (relevant.length < hits.length) {
    log.info("retrieval", "Filtered low-score chunks", {
      total: hits.length,
      kept: relevant.length,
      discarded: hits.length - relevant.length,
      minScore: MIN_SCORE,
    });
  }

  return relevant.map((hit) => {
    const fields = (hit.fields ?? {}) as Record<string, unknown>;
    return {
      text: (fields.text as string) || "",
      pageNumber: (fields.pageNumber as number) || 0,
      chapterTitle: (fields.chapterTitle as string) || "",
      score: hit._score || 0,
      bookId: (fields.bookId as string) || "",
    };
  });
}
