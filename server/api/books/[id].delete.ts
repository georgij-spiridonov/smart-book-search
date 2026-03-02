import { del } from "@vercel/blob";
import { Pinecone } from "@pinecone-database/pinecone";
import { getBook, deleteBook } from "../../utils/bookStore";
import { deleteHashesByBlobUrl } from "../../utils/hashStore";
import { log } from "../../utils/logger";
import { publishEvent } from "../../utils/events";

/**
 * DELETE /api/books/[id]
 *
 * Выполняет "ядерное" удаление книги:
 * 1. Удаляет векторизованные фрагменты из Pinecone.
 * 2. Удаляет исходный файл из Vercel Blob.
 * 3. Удаляет запись о книге и индексы из Upstash Redis.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = session.user?.id || session.id;

  const applicationConfig = useRuntimeConfig();
  const rawBookId = getRouterParam(event, "id");
  const bookId = rawBookId ? decodeURIComponent(rawBookId) : undefined;

  if (!bookId) {
    throw createError({
      statusCode: 400,
      message: "Требуется ID книги",
    });
  }

  const targetBook = await getBook(bookId);
  if (!targetBook) {
    throw createError({
      statusCode: 404,
      message: "Книга не найдена",
    });
  }

  // Проверка прав владения: только загрузчик или администратор может удалить книгу
  if (!session.user?.isAdmin && targetBook.userId !== userId) {
    log.warn("delete-api", "Unauthorized deletion attempt", {
      bookId,
      attemptBy: userId,
      ownedBy: targetBook.userId,
    });
    throw createError({
      statusCode: 403,
      message: "Отказано в доступе: Вы можете удалять только загруженные вами книги.",
    });
  }

  try {
    // 1. Удаление из Pinecone
    if (applicationConfig.pineconeApiKey && applicationConfig.pineconeIndex) {
      try {
        const pineconeClient = new Pinecone({ apiKey: applicationConfig.pineconeApiKey });
        const pineconeIndex = pineconeClient.index(applicationConfig.pineconeIndex);
        await pineconeIndex.deleteMany({ filter: { bookId } });
        log.info("delete-api", "Deleted vectors from Pinecone", { bookId });
      } catch (pineconeError) {
        log.error("delete-api", "Failed to delete vectors from Pinecone", {
          error: pineconeError instanceof Error ? pineconeError.message : String(pineconeError),
        });
        // Мы логируем ошибку, но продолжаем удаление из Blob и БД
      }
    }

    // 2. Удаление из Vercel Blob и хэшей
    if (targetBook.blobUrl) {
      try {
        await del(targetBook.blobUrl, { token: applicationConfig.blobToken });
        log.info("delete-api", "Deleted file from Vercel Blob", {
          blobUrl: targetBook.blobUrl,
        });

        // Удаляем известные хэши для этого URL Blob
        await deleteHashesByBlobUrl(targetBook.blobUrl);
      } catch (blobError) {
        log.error("delete-api", "Failed to delete file from Blob", {
          error: blobError instanceof Error ? blobError.message : String(blobError),
        });
        // Продолжаем удаление из БД
      }
    }

    // 3. Удаление из Redis Store
    await deleteBook(bookId);

    // Уведомляем изначального владельца об удалении книги
    const originalOwnerId = targetBook.userId;
    if (originalOwnerId) {
      await publishEvent(originalOwnerId, "book:updated", {
        bookId,
        status: "deleted",
      });
    }

    return {
      status: "success",
      message: `Книга "${targetBook.title}" была полностью удалена.`,
    };
  } catch (unexpectedError: unknown) {
    log.error("delete-api", "Nuclear deletion ran into an unexpected error", {
      error: unexpectedError instanceof Error ? unexpectedError.message : String(unexpectedError),
    });
    throw createError({
      statusCode: 500,
      message: "Не удалось полностью удалить книгу",
      data: { error: unexpectedError instanceof Error ? unexpectedError.message : String(unexpectedError) },
    });
  }
});
