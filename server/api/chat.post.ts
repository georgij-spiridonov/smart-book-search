import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
} from "ai";
import { searchBookKnowledge, generateSearchQueries } from "../utils/retrieval";
import { streamAnswer } from "../utils/generateAnswer";
import { CHAT_CONFIG, ChatRequestSchema } from "../utils/chatConfig";
import { logger } from "../utils/logger";
import { getBook } from "../utils/bookStore";
import { db, schema } from "hub:db";
import { eq, asc } from "drizzle-orm";
import { publishEvent } from "../utils/events";
import type { ChatMessage } from "../utils/chatConfig";

/**
 * POST /api/chat
 *
 * Основной эндпоинт конвейера книжного чата (потоковый).
 *
 * Получает запрос пользователя (с ID книг и опциональной историей чата),
 * извлекает релевантные фрагменты из векторного хранилища, затем транслирует
 * ответ клиенту, одновременно отправляя метаданные через пользовательские части данных.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = session.user?.id || session.id;

  if (!userId) {
    throw createError({ statusCode: 401, message: "Не авторизован" });
  }

  const requestBody = await readBody(event);

  // Валидация входных данных с помощью Zod
  const validationResult = ChatRequestSchema.safeParse(requestBody);

  if (!validationResult.success) {
    const errorMessage =
      validationResult.error.issues[0]?.message || "Неверное тело запроса";
    logger.error("chat-api", "Chat request validation failed", {
      error: errorMessage,
      issues: validationResult.error.issues,
    });
    throw createError({
      statusCode: 400,
      message: errorMessage,
    });
  }

  const { query: userQuery, bookIds, chatId } = validationResult.data;

  // Извлекаем историю из БД вместо доверия полезной нагрузке клиента
  let chatHistory: ChatMessage[] = [];
  if (chatId) {
    const existingChat = await db.query.chats.findFirst({
      where: eq(schema.chats.id, chatId),
    });

    if (!existingChat) {
      throw createError({ statusCode: 404, message: "Чат не найден" });
    }

    if (!session.user?.isAdmin && existingChat.userId !== userId) {
      throw createError({ statusCode: 403, message: "Отказано в доступе" });
    }

    const databaseMessages = await db.query.messages.findMany({
      where: () => eq(schema.messages.chatId, chatId),
      orderBy: () => [asc(schema.messages.createdAt)],
    });

    chatHistory = databaseMessages.map((message) => {
      let messageContent = "";
      if (Array.isArray(message.parts)) {
        messageContent = message.parts
          .filter(
            (part: unknown): part is { text: string } =>
              part !== null &&
              typeof part === "object" &&
              "text" in part &&
              typeof part.text === "string",
          )
          .map((part) => part.text)
          .join("");
      }
      return {
        role: message.role as "user" | "assistant",
        content: messageContent,
      };
    });
  }

  logger.info("chat-api", "Processing chat query", {
    queryLength: userQuery.length,
    bookCount: bookIds?.length || 0,
    historyLength: chatHistory.length,
  });

  // Убеждаемся, что все запрошенные книги существуют и векторизованы
  const requestedBooks = await Promise.all(bookIds.map((id) => getBook(id)));

  const missingBookIndex = requestedBooks.findIndex((book) => book === null);
  if (missingBookIndex !== -1) {
    const missingBookId = bookIds[missingBookIndex];
    logger.warn("chat-api", "Requested book not found", { missingBookId });
    throw createError({
      statusCode: 404,
      message: `Книга с ID '${missingBookId}' не найдена.`,
    });
  }

  // Собираем ID книг, которые еще не были векторизованы
  const unvectorizedBookIds = requestedBooks
    .filter((book) => book !== null && !book.vectorized)
    .map((book) => book!.id);

  if (unvectorizedBookIds.length > 0) {
    logger.warn("chat-api", "Some requested books are not vectorized", {
      unvectorizedBookIds,
    });
  }

  // Если ВСЕ запрошенные книги не векторизованы, возвращаемся досрочно — нет данных для поиска
  if (unvectorizedBookIds.length === bookIds.length) {
    logger.info(
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
              notVectorized: unvectorizedBookIds,
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

  // Конвейер поиска и ответа
  const resolvedChatId = chatId || crypto.randomUUID();

  // Если чат новый, сохраняем в базу данных
  if (!chatId) {
    await db.insert(schema.chats).values({
      id: resolvedChatId,
      title: "",
      userId: userId,
      bookIds,
    });

    // Немедленно уведомляем клиента о новом чате
    await publishEvent(userId, "chat:updated", {
      chatId: resolvedChatId,
      status: "created",
    });
  }

  // Сохраняем вопрос пользователя в базу данных
  await db.insert(schema.messages).values({
    chatId: resolvedChatId,
    role: "user",
    parts: [{ type: "text", text: userQuery }],
  });

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      async execute({ writer }) {
        // Отправляем начальные метаданные
        writer.write({
          type: "data-meta",
          data: { bookIds, hasContext: true, notVectorized: unvectorizedBookIds },
        });

        try {
          // Генерация запросов
          writer.write({
            type: "data-step",
            data: {
              text: "🔍 Формирую поисковые запросы на основе вашего вопроса...\n",
              state: "active",
            },
          });

          const bookInformation = requestedBooks
            .map((book) => (book ? `${book.title}${book.author ? ` (${book.author})` : ""}` : ""))
            .filter(Boolean)
            .join(", ");

          const generatedSearchQueries = await generateSearchQueries(
            userQuery,
            bookInformation,
            chatHistory,
          );

          writer.write({
            type: "data-step",
            data: {
              text: `✅ Сгенерировано ${generatedSearchQueries.length} поисковых запроса.\n`,
              state: "active",
            },
          });

          // Поиск и переранжирование
          writer.write({
            type: "data-step",
            data: {
              text: "📖 Ищу подходящие фрагменты в книгах и ранжирую их по релевантности...\n",
              state: "active",
            },
          });

          const foundChunks = await searchBookKnowledge(
            generatedSearchQueries,
            bookIds,
            CHAT_CONFIG.retrievalLimit,
          );

          if (foundChunks.length === 0) {
            writer.write({
              type: "data-step",
              data: {
                text: "❌ К сожалению, подходящих фрагментов не найдено.\n",
                state: "done",
              },
            });
            writer.write({
              type: "data-chunks",
              data: [],
            });
          } else {
            writer.write({
              type: "data-step",
              data: {
                text: `📚 Найдено ${foundChunks.length} релевантных фрагмента(ов). Формирую ответ...\n`,
                state: "done",
              },
            });
            writer.write({
              type: "data-chunks",
              data: foundChunks.map((chunk, index) => ({
                index: index + 1,
                text: chunk.text,
                pageNumber: chunk.pageNumber,
                chapterTitle: chunk.chapterTitle,
                score: chunk.score,
                bookId: chunk.bookId,
              })),
            });
          }

          // Генерация ответа
          const responseStreamResult = streamAnswer(userQuery, foundChunks, chatHistory);
          writer.merge(
            responseStreamResult.toUIMessageStream({
              sendStart: false,
              sendReasoning: false,
            }),
          );

          // Генерируем заголовок для чата, если он новый
          if (chatHistory.length === 0) {
            event.waitUntil(
              generateText({
                model: CHAT_CONFIG.answerModel,
                system:
                  "You are a title generator for a chat. Generate a short title based on the user's message. Less than 30 characters. No punctuation, no quotes.",
                prompt: userQuery,
              })
                .then(async ({ text: generatedTitle }) => {
                  logger.info("chat-api", "Generated chat title", {
                    generatedTitle,
                    chatId: resolvedChatId,
                  });
                  await db
                    .update(schema.chats)
                    .set({ title: generatedTitle })
                    .where(eq(schema.chats.id, resolvedChatId))
                    .execute();

                  await publishEvent(userId, "chat:updated", {
                    chatId: resolvedChatId,
                    title: generatedTitle,
                  });
                })
                .catch((error) => {
                  logger.error("chat-api", "Title generation failed", {
                    error: error instanceof Error ? error.message : String(error),
                  });
                }),
            );
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Неизвестная ошибка в конвейере";
          logger.error("chat-api", "Pipeline failed", { error: errorMessage });

          writer.write({
            type: "data-step",
            data: {
              text: `⚠️ Произошла ошибка: ${errorMessage}\n`,
              state: "done",
            },
          });

          writer.write({
            type: "data-error",
            data: {
              error: "Произошла ошибка при обработке вашего запроса.",
            },
          });
        }
      },
      onFinish: async ({ messages }) => {
        // Находим сообщение ассистента в полезной нагрузке вывода и сохраняем его
        for (const streamMessage of messages) {
          if (streamMessage.role === "assistant") {
            await db.insert(schema.messages).values({
              chatId: resolvedChatId,
              role: "assistant",
              parts: streamMessage.parts,
            });
          }
        }
      },
      onError(error) {
        logger.error("chat-api", "Stream-level error", {
          error: error instanceof Error ? error.message : String(error),
        });
        return "Произошла ошибка при генерации ответа. Попробуйте ещё раз.";
      },
    }),
  });
});
