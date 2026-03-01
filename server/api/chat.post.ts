import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
} from "ai";
import { searchBookKnowledge } from "../utils/retrieval";
import { streamAnswer } from "../utils/generateAnswer";
import { CHAT_CONFIG, ChatRequestSchema } from "../utils/chatConfig";
import { log } from "../utils/logger";
import { getBook } from "../utils/bookStore";
import { db, schema } from "hub:db";
import { eq, asc } from "drizzle-orm";
import { publishEvent } from "../utils/events";
import type { ChatMessage } from "../utils/chatConfig";

/**
 * POST /api/chat
 *
 * Main book chat pipeline endpoint (streaming).
 *
 * Receives a user query (with book IDs and optional chat history),
 * retrieves relevant chunks from the vector store, then streams
 * the answer back to the client while sending metadata via custom
 * data parts.
 *
 * Response format (SSE / UI Message Stream):
 *   1. data-meta   — { bookIds, hasContext, notVectorized }
 *   2. data-chunks — array of retrieved text fragments
 *   3. text-start / text-delta / text-end — streamed LLM answer
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = session.user?.id || session.id;

  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }

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

  const { query, bookIds, chatId } = validation.data;

  // Fetch history from DB instead of trusting the client payload
  let history: ChatMessage[] = [];
  if (chatId) {
    const existingChat = await db.query.chats.findFirst({
      where: eq(schema.chats.id, chatId),
    });

    if (!existingChat) {
      throw createError({ statusCode: 404, statusMessage: "Chat not found" });
    }

    if (existingChat.userId !== userId) {
      throw createError({ statusCode: 403, statusMessage: "Forbidden" });
    }

    const dbMessages = await db.query.messages.findMany({
      where: () => eq(schema.messages.chatId, chatId),
      orderBy: () => [asc(schema.messages.createdAt)],
    });

    history = dbMessages.map((msg) => {
      let content = "";
      if (Array.isArray(msg.parts)) {
        content = msg.parts
          .filter(
            (p: unknown): p is { text: string } =>
              p !== null &&
              typeof p === "object" &&
              "text" in p &&
              typeof p.text === "string",
          )
          .map((p) => p.text)
          .join("");
      }
      return {
        role: msg.role as "user" | "assistant",
        content,
      };
    });
  }

  log.info("chat-api", "Processing chat query", {
    queryLength: query.length,
    bookCount: bookIds?.length || 0,
    historyLength: history.length,
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

  // --- Retrieval ---
  const chunks = await searchBookKnowledge(
    query,
    bookIds,
    CHAT_CONFIG.retrievalLimit,
  );

  log.info("chat-api", "Context retrieved", {
    chunksRetrieved: chunks.length,
    topScore: chunks[0]?.score,
  });

  const hasContext = chunks.length > 0;

  // --- Short-circuit: no relevant context found → skip LLM entirely ---
  if (!hasContext) {
    log.info("chat-api", "No relevant chunks found, skipping LLM call", {
      bookIds,
    });

    return createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute({ writer }) {
          writer.write({
            type: "data-meta",
            data: { bookIds, hasContext: false, notVectorized },
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
  const currentChatId = chatId || crypto.randomUUID();

  // If new chat, save to database
  if (!chatId) {
    await db.insert(schema.chats).values({
      id: currentChatId,
      title: "",
      userId: userId,
      bookIds,
    });

    // Notify client about new chat immediately
    await publishEvent(userId, "chat:updated", {
      chatId: currentChatId,
      status: "created",
    });
  }

  // Save user's question to the database
  await db.insert(schema.messages).values({
    chatId: currentChatId,
    role: "user",
    parts: [{ type: "text", text: query }],
  });
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute({ writer }) {
        // 1. Send metadata instantly via custom data parts
        writer.write({
          type: "data-meta",
          data: { bookIds, hasContext: true, notVectorized },
        });

        writer.write({
          type: "data-chunks",
          data: chunks.map((chunk, i) => ({
            index: i + 1,
            text: chunk.text,
            pageNumber: chunk.pageNumber,
            chapterTitle: chunk.chapterTitle,
            score: chunk.score,
            bookId: chunk.bookId,
          })),
        });

        // 2. Stream LLM answer — wrapped in try/catch so a mid-stream
        //    failure emits a structured error event instead of breaking the SSE.
        try {
          const result = streamAnswer(query, chunks, history);
          writer.merge(
            result.toUIMessageStream({
              sendStart: false,
              sendReasoning: false,
            }),
          );

          // Generate a title for the chat if it's new
          if (history.length === 0) {
            event.waitUntil(
              generateText({
                model: CHAT_CONFIG.answerModel, // Use the configured model
                system:
                  "You are a title generator for a chat. Generate a short title based on the user's message. Less than 30 characters. No punctuation, no quotes.",
                prompt: query,
              })
                .then(async ({ text: title }) => {
                  log.info("chat-api", "Generated chat title", {
                    title,
                    chatId: currentChatId,
                  });
                  await db
                    .update(schema.chats)
                    .set({ title })
                    .where(eq(schema.chats.id, currentChatId))
                    .execute();

                  // Notify client about title update
                  await publishEvent(userId, "chat:updated", {
                    chatId: currentChatId,
                    title,
                  });
                })
                .catch((error) => {
                  log.error("chat-api", "Title generation failed", {
                    error:
                      error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined,
                  });
                }),
            );
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown generation error";
          log.error("chat-api", "LLM stream failed", { error: message });

          writer.write({
            type: "data-error",
            data: {
              error:
                "Произошла ошибка при генерации ответа. Попробуйте ещё раз.",
            },
          });
        }
      },
      onFinish: async ({ messages }) => {
        // Find the assistant message in the output payload and save it
        for (const message of messages) {
          if (message.role === "assistant") {
            await db.insert(schema.messages).values({
              chatId: currentChatId,
              role: "assistant",
              parts: message.parts,
            });
          }
        }
      },
      onError(error) {
        // Prevent raw error details from leaking to the client
        log.error("chat-api", "Stream-level error", {
          error: error instanceof Error ? error.message : String(error),
        });
        return "Произошла ошибка при генерации ответа. Попробуйте ещё раз.";
      },
    }),
  });
});
