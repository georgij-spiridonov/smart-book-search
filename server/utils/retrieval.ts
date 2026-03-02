import { Pinecone } from "@pinecone-database/pinecone";
import { generateText } from "ai";
import { CHAT_CONFIG, type ChatMessage } from "./chatConfig";
import { log } from "./logger";

/**
 * Minimum cosine similarity score for a chunk to be considered relevant.
 */
const MIN_SCORE = 0.3;

/**
 * Generates search queries based on the user's question and context.
 */
export async function generateSearchQueries(
  query: string,
  bookInfo: string,
  history: ChatMessage[] = [],
) {
  log.info("retrieval", "Generating search queries", { query, bookInfo });

  const recentHistory = history.slice(-CHAT_CONFIG.maxHistoryMessages);
  const historyText = recentHistory
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  const prompt = [
    bookInfo ? `Context: Information about the book(s): ${bookInfo}` : "",
    historyText ? `Conversation History:\n${historyText}` : "",
    `User Question: ${query}`,
    "\nGenerate 3-5 search queries in the same language as the question.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const { text } = await generateText({
    model: CHAT_CONFIG.queryModel,
    system: CHAT_CONFIG.querySystemPrompt,
    prompt,
  });

  try {
    // Attempt to parse JSON array from the response
    const match = text.match(/\[.*\]/s);
    if (match) {
      let jsonText = match[0];
      try {
        const queries = JSON.parse(jsonText) as string[];
        if (Array.isArray(queries) && queries.length > 0) {
          log.info("retrieval", "Queries generated successfully", { queries });
          return queries;
        }
      } catch (innerError) {
        // Fallback: try replacing single quotes with double quotes if it looks like a simple array
        // This is a common failure mode for some LLMs
        const fixedJsonText = jsonText.replace(/'/g, '"');
        const queries = JSON.parse(fixedJsonText) as string[];
        if (Array.isArray(queries) && queries.length > 0) {
          log.info("retrieval", "Queries generated successfully (after fix)", { queries });
          return queries;
        }
      }
    }
  } catch (e) {
    log.error("retrieval", "Failed to parse generated queries", {
      error: e instanceof Error ? e.message : String(e),
      rawText: text,
    });
  }

  log.warn("retrieval", "Falling back to original query", { query });
  return [query];
}

/**
 * Searches the book knowledge base for fragments relevant to the queries.
 */
export async function searchBookKnowledge(
  queries: string | string[],
  bookIds: string[],
  limit = 5,
) {
  const config = useRuntimeConfig();
  const queryList = Array.isArray(queries) ? queries : [queries];

  log.info("retrieval", "Starting knowledge search", {
    queriesCount: queryList.length,
    bookIdsCount: bookIds?.length || 0,
    limit,
  });

  const pc = new Pinecone({
    apiKey: config.pineconeApiKey,
  });
  const index = pc.index(config.pineconeIndex);

  // 1. Search for each query in parallel with retry logic
  const searchPromises = queryList.map((q) => {
    const performSearch = async (attempt = 1): Promise<any> => {
      try {
        return await index.searchRecords({
          query: {
            topK: limit,
            inputs: { text: q },
            filter: {
              bookId: { $in: bookIds },
            },
          },
        });
      } catch (err: any) {
        if (attempt < 3) {
          log.warn("retrieval", "Pinecone search retry", {
            query: q,
            attempt,
            error: err.message,
          });
          await new Promise((r) => setTimeout(r, 500 * attempt));
          return performSearch(attempt + 1);
        }
        log.error("retrieval", "Pinecone search error after retries", {
          query: q,
          error: err.message,
        });
        return null;
      }
    };
    return performSearch();
  });

  const results = await Promise.all(searchPromises);

  // 2. Merge and rerank results
  const chunkMap = new Map<string, any>();

  for (const res of results) {
    if (!res?.result?.hits) continue;

    for (const hit of res.result.hits) {
      const score = hit._score ?? 0;
      if (score < MIN_SCORE) continue;

      const fields = (hit.fields ?? {}) as Record<string, unknown>;
      const text = (fields.text as string) || "";
      
      // Use text content as key for deduplication. 
      // If we see the same chunk again, keep the one with the higher score.
      if (!chunkMap.has(text) || chunkMap.get(text).score < score) {
        chunkMap.set(text, {
          text,
          pageNumber: (fields.pageNumber as number) || 0,
          chapterTitle: (fields.chapterTitle as string) || "",
          score: score,
          bookId: (fields.bookId as string) || "",
        });
      }
    }
  }

  // 3. Sort by score and limit
  const finalChunks = Array.from(chunkMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit * 2); // Allow more chunks if we have multiple queries

  log.info("retrieval", "Search and reranking completed", {
    totalUniqueMatches: chunkMap.size,
    returnedCount: finalChunks.length,
    topScore: finalChunks[0]?.score,
  });

  return finalChunks;
}
