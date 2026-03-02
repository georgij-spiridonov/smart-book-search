import { getAllBooks } from "../../utils/bookStore";
import { getUserJobs, type JobState } from "../../utils/jobStore";
import { log } from "../../utils/logger";

/**
 * GET /api/books
 *
 * Returns a list of all uploaded books with their metadata:
 * title, author, coverUrl, blobUrl, filename, fileSize,
 * uploadedAt, and vectorized status.
 *
 * Books are sorted by upload date (newest first).
 */
export default defineEventHandler(async (event) => {
  try {
    const session = await getUserSession(event);
    const userId = session.user?.id || session.id;

    const books = await getAllBooks();
    
    // Fetch jobs: admins see jobs for all books, regular users only their own.
    let jobs: JobState[] = [];
    if (session.user?.isAdmin) {
      const uniqueUserIds = [...new Set(books.map((b) => b.userId))];
      const jobResults = await Promise.all(uniqueUserIds.map((id) => getUserJobs(id)));
      jobs = jobResults.flat();
    } else if (userId) {
      jobs = await getUserJobs(userId);
    }

    log.info("books-api", "Fetched books list", {
      count: books.length,
      jobsCount: jobs.length,
      isAdmin: !!session.user?.isAdmin,
    });

    return {
      status: "success",
      count: books.length,
      currentUserId: userId,
      isAdmin: !!session.user?.isAdmin,
      books: books.map((book) => {
        // Find active job for this book
        const job = jobs.find(
          (j) =>
            j.bookId === book.id &&
            (j.status === "processing" || j.status === "pending"),
        );

        return {
          id: book.id,
          userId: book.userId,
          title: book.title,
          author: book.author,
          coverUrl: book.coverUrl,
          blobUrl: book.blobUrl,
          filename: book.filename,
          fileSize: book.fileSize,
          uploadedAt: new Date(book.uploadedAt).toISOString(),
          vectorized: book.vectorized,
          job: job
            ? {
                id: job.id,
                status: job.status,
                progress: job.progress,
              }
            : null,
        };
      }),
    };
  } catch (error: unknown) {
    log.error("books-api", "Failed to fetch books list", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch books list",
      data: { error: error instanceof Error ? error.message : String(error) },
    });
  }
});
