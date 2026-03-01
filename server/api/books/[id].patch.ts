import { getBook, updateBook } from "../../utils/bookStore";
import { log } from "../../utils/logger";
import { publishEvent } from "../../utils/events";
import { UpdateBookRequestSchema } from "../../utils/openapi/schemas";

/**
 * PATCH /api/books/[id]
 *
 * Updates book metadata (title, author).
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = session.user?.id || session.id;

  const rawId = getRouterParam(event, "id");
  const id = rawId ? decodeURIComponent(rawId) : undefined;

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Book ID is required",
    });
  }

  const body = await readBody(event);
  const validation = UpdateBookRequestSchema.safeParse(body);

  if (!validation.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid request body",
      data: validation.error.format(),
    });
  }

  const { title, author, coverUrl } = validation.data;

  const book = await getBook(id);
  if (!book) {
    throw createError({
      statusCode: 404,
      statusMessage: "Book not found",
    });
  }

  // Ownership check: only the uploader can edit the book
  if (book.userId !== userId) {
    log.warn("update-book-api", "Unauthorized update attempt", {
      bookId: id,
      attemptBy: userId,
      ownedBy: book.userId,
    });
    throw createError({
      statusCode: 403,
      statusMessage: "Forbidden: You can only edit books you uploaded.",
    });
  }

  try {
    await updateBook(id, {
      title,
      author,
      coverUrl,
    });

    // Notify client about book update
    if (userId) {
      await publishEvent(userId, "book:updated", {
        bookId: id,
        status: "updated",
        title,
        author,
        coverUrl,
      });
    }

    log.info("update-book-api", "Updated book metadata", {
      bookId: id,
      title,
      author,
      coverUrl,
    });

    return {
      status: "success",
      message: `Book metadata updated.`,
    };
  } catch (error: unknown) {
    log.error("update-book-api", "Failed to update book metadata", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to update book metadata",
      data: { error: error instanceof Error ? error.message : String(error) },
    });
  }
});
