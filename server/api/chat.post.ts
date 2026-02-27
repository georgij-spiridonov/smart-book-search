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

  // --- Verify that all requested books exist and are vectorized ---
  const books = await Promise.all(bookIds.map((id) => getBook(id)));

  const missingIndex = books.findIndex((b) => b === null);
  if (missingIndex !== -1) {
    const missingId = bookIds[missingIndex];
    log.warn("chat-api", "Requested book not found", { missingId });
    throw createError({
      statusCode: 404,
      statusMessage: "Not Found",
      message: `Book with ID '${missingId}' not found.`,
    });
  }

  // Collect IDs of books that haven't been vectorized yet
  const notVectorized = books
    .filter((b) => b !== null && !b.vectorized)
    .map((b) => b!.id);

  if (notVectorized.length > 0) {
    log.warn("chat-api", "Some requested books are not vectorized", {
      notVectorized,
    });
  }

  // If ALL requested books are un-vectorized, return early — no data to search
  if (notVectorized.length === bookIds.length) {
    log.info(
      "chat-api",
      "All requested books are un-vectorized, skipping pipeline",
      { bookIds },
    );

    return createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute({ writer }) {
          writer.write({
            type: "data-meta",
            data: {
              queryType: "question_answer",
              bookIds,
              hasContext: false,
              notVectorized,
            },
          });

          writer.write({
            type: "data-chunks",
            data: [],
          });
        },
      }),
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

  const hasContext = chunks.length > 0;

  // --- Short-circuit: no relevant context found → skip LLM entirely ---
  if (!hasContext) {
    log.info("chat-api", "No relevant chunks found, skipping LLM call", {
      queryType,
      bookIds,
    });

    return createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute({ writer }) {
          writer.write({
            type: "data-meta",
            data: { queryType, bookIds, hasContext: false, notVectorized },
          });

          writer.write({
            type: "data-chunks",
            data: [],
          });
        },
      }),
    });
  }

  // --- Streaming response (has relevant context) ---
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute({ writer }) {
        // 1. Send metadata instantly via custom data parts
        writer.write({
          type: "data-meta",
          data: { queryType, bookIds, hasContext: true, notVectorized },
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
