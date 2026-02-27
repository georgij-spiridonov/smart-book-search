import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { searchBookKnowledge } from "../utils/retrieval";
import { classifyQuery } from "../utils/classifyQuery";
import { streamAnswer } from "../utils/generateAnswer";
import { CHAT_CONFIG, ChatRequestSchema } from "../utils/chatConfig";
import { log } from "../utils/logger";
import { getBook } from "../utils/bookStore";

/**
 * POST /api/chat
 *
 * Main book chat pipeline endpoint (streaming).
 *
 * Receives a user query (with book IDs and optional chat history),
 * classifies the query type, retrieves relevant chunks, then streams
 * the answer back to the client while sending metadata via custom
 * data parts.
 *
 * Response format (SSE / UI Message Stream):
 *   1. data-meta   — { queryType, bookIds }
 *   2. data-chunks — array of retrieved text fragments
 *   3. text-start / text-delta / text-end — streamed LLM answer
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  // --- Input validation with Zod ---
  const validation = ChatRequestSchema.safeParse(body);

  if (!validation.success) {
    const errorMsg =
      validation.error.issues[0]?.message || "Invalid request body";
    log.error("chat-api", "Chat request validation failed", {
      error: errorMsg,
      issues: validation.error.issues,
    });
    throw createError({
      statusCode: 400,
      statusMessage: "Bad Request",
      message: errorMsg,
    });
  }

  const { query, bookIds, history } = validation.data;

  log.info("chat-api", "Processing chat query", {
    queryLength: query.length,
    bookCount: bookIds?.length || 0,
    historyLength: history?.length || 0,
  });

  // --- Verify that all requested books exist ---
  const booksExistResults = await Promise.all(
    bookIds.map((id) => getBook(id).then((book) => book !== null)),
  );

  const missingBookIndex = booksExistResults.findIndex((exists) => !exists);
  if (missingBookIndex !== -1) {
    const missingId = bookIds[missingBookIndex];
    log.warn("chat-api", "Requested book not found", { missingId });
    throw createError({
      statusCode: 404,
      statusMessage: "Not Found",
      message: `Book with ID '${missingId}' not found.`,
    });
  }

  // --- Pipeline: parallel classification + retrieval ---
  const [queryType, chunks] = await Promise.all([
    classifyQuery(query),
    searchBookKnowledge(query, bookIds, CHAT_CONFIG.retrievalLimit),
  ]);

  log.info("chat-api", "Query classified and context retrieved", {
    queryType,
    chunksRetrieved: chunks.length,
    topScore: chunks[0]?.score,
  });

  // --- Streaming response ---
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute({ writer }) {
        // 1. Send metadata instantly via custom data parts
        writer.write({
          type: "data-meta",
          data: { queryType, bookIds },
        });

        writer.write({
          type: "data-chunks",
          data: chunks.map((chunk) => ({
            text: chunk.text,
            pageNumber: chunk.pageNumber,
            chapterTitle: chunk.chapterTitle,
            score: chunk.score,
            bookId: chunk.bookId,
          })),
        });

        // 2. Stream LLM answer
        const result = streamAnswer(query, chunks, history);
        writer.merge(result.toUIMessageStream());
      },
    }),
  });
});
