import { searchBookKnowledge } from "../../utils/retrieval";

/**
 * GET /api/tests/retrieval
 * 
 * Simple test to verify the retrieval utility structure.
 * Note: This will attempt actual API calls if config is present.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const q = (query.q as string) || "What is artificial intelligence?";
  const bookId = (query.bookId as string) || "test-book";

  try {
    const results = await searchBookKnowledge(q, [bookId], 1);
    
    return {
      status: "success",
      query: q,
      bookIds: [bookId],
      resultsCount: results.length
    };
  } catch (error: unknown) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error)
    };
  }
});
