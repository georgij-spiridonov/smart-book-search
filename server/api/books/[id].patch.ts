import { getBook, updateBook } from "../../utils/bookStore";
import { logger } from "../../utils/logger";
import { publishEvent } from "../../utils/events";
import { UpdateBookRequestSchema } from "../../utils/openapi/schemas";

/**
 * PATCH /api/books/[id]
 *
 * Обновляет метаданные книги (название, автор).
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = session.user?.id || session.id;

  if (!userId) {
    throw createError({ statusCode: 401, message: "Не авторизован" });
  }

  const rawBookId = getRouterParam(event, "id");
  const bookId = rawBookId ? decodeURIComponent(rawBookId) : undefined;

  if (!bookId) {
    throw createError({
      statusCode: 400,
      message: "Требуется ID книги",
    });
  }

  const requestBody = await readBody(event);
  const validationResult = UpdateBookRequestSchema.safeParse(requestBody);

  if (!validationResult.success) {
    throw createError({
      statusCode: 400,
      message: "Неверное тело запроса",
      data: validationResult.error.format(),
    });
  }

  const { title: newTitle, author: newAuthor, coverUrl: newCoverUrl } = validationResult.data;

  const existingBook = await getBook(bookId);
  if (!existingBook) {
    throw createError({
      statusCode: 404,
      message: "Книга не найдена",
    });
  }

  // Проверка прав владения: только загрузчик или администратор может редактировать книгу
  if (!session.user?.isAdmin && existingBook.userId !== userId) {
    logger.warn("update-book-api", "Unauthorized update attempt", {
      bookId,
      attemptBy: userId,
      ownedBy: existingBook.userId,
    });
    throw createError({
      statusCode: 403,
      message: "Отказано в доступе: Вы можете редактировать только загруженные вами книги.",
    });
  }

  try {
    await updateBook(bookId, {
      title: newTitle,
      author: newAuthor,
      coverUrl: newCoverUrl,
    });

    // Уведомляем изначального владельца об обновлении книги
    const originalOwnerId = existingBook.userId;
    if (originalOwnerId) {
      await publishEvent(originalOwnerId, "book:updated", {
        bookId,
        status: "updated",
        title: newTitle,
        author: newAuthor,
        coverUrl: newCoverUrl,
      });
    }

    logger.info("update-book-api", "Updated book metadata", {
      bookId,
      title: newTitle,
      author: newAuthor,
      coverUrl: newCoverUrl,
    });

    return {
      status: "success",
      message: `Метаданные книги обновлены.`,
    };
  } catch (updateError: unknown) {
    logger.error("update-book-api", "Failed to update book metadata", {
      error: updateError instanceof Error ? updateError.message : String(updateError),
    });
    throw createError({
      statusCode: 500,
      message: "Не удалось обновить метаданные книги",
      data: { error: updateError instanceof Error ? updateError.message : String(updateError) },
    });
  }
});
