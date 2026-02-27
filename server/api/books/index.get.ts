import { getAllBooks } from "../../utils/bookStore";

/**
 * GET /api/books
 *
 * Returns a list of all uploaded books with their metadata:
 * title, author, coverUrl, blobUrl, filename, fileSize,
 * uploadedAt, and vectorized status.
 *
 * Books are sorted by upload date (newest first).
 */
export default defineEventHandler(async () => {
  try {
    const books = await getAllBooks();

    return {
      status: "success",
      count: books.length,
      books: books.map((book) => ({
        id: book.id,
        title: book.title,
        author: book.author,
        coverUrl: book.coverUrl,
        blobUrl: book.blobUrl,
        filename: book.filename,
        fileSize: book.fileSize,
        uploadedAt: new Date(book.uploadedAt).toISOString(),
        vectorized: book.vectorized,
      })),
    };
  } catch (error: unknown) {
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch books list",
      data: { error: error instanceof Error ? error.message : String(error) },
    });
  }
});
