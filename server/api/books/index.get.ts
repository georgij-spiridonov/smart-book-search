import { getAllBooks } from "../../utils/bookStore";
import { getUserJobs, type JobState } from "../../utils/jobStore";
import { log } from "../../utils/logger";

/**
 * GET /api/books
 *
 * Возвращает список всех загруженных книг с их метаданными.
 * Книги отсортированы по дате загрузки (сначала новые).
 */
export default defineEventHandler(async (event) => {
  try {
    const session = await getUserSession(event);
    const userId = session.user?.id || session.id;

    const allBooksList = await getAllBooks();
    
    // Получаем задачи: администраторы видят задачи для всех книг, обычные пользователи - только свои.
    let userJobs: JobState[] = [];
    if (session.user?.isAdmin) {
      const uniqueUserIdentifiers = [...new Set(allBooksList.map((book) => book.userId))];
      const multipleUserJobResults = await Promise.all(
        uniqueUserIdentifiers.map((identifier) => getUserJobs(identifier))
      );
      userJobs = multipleUserJobResults.flat();
    } else if (userId) {
      userJobs = await getUserJobs(userId);
    }

    log.info("books-api", "Fetched books list", {
      count: allBooksList.length,
      jobsCount: userJobs.length,
      isAdmin: !!session.user?.isAdmin,
    });

    return {
      status: "success",
      count: allBooksList.length,
      currentUserId: userId,
      isAdmin: !!session.user?.isAdmin,
      books: allBooksList.map((currentBook) => {
        // Находим активную задачу для этой книги
        const activeJobForBook = userJobs.find(
          (jobState) =>
            jobState.bookId === currentBook.id &&
            (jobState.status === "processing" || jobState.status === "pending"),
        );

        return {
          id: currentBook.id,
          userId: currentBook.userId,
          title: currentBook.title,
          author: currentBook.author,
          coverUrl: currentBook.coverUrl,
          blobUrl: currentBook.blobUrl,
          filename: currentBook.filename,
          fileSize: currentBook.fileSize,
          uploadedAt: new Date(currentBook.uploadedAt).toISOString(),
          vectorized: currentBook.vectorized,
          job: activeJobForBook
            ? {
                id: activeJobForBook.id,
                status: activeJobForBook.status,
                progress: activeJobForBook.progress,
              }
            : null,
        };
      }),
    };
  } catch (fetchError: unknown) {
    log.error("books-api", "Failed to fetch books list", {
      error: fetchError instanceof Error ? fetchError.message : String(fetchError),
    });
    throw createError({
      statusCode: 500,
      message: "Не удалось получить список книг",
      data: { error: fetchError instanceof Error ? fetchError.message : String(fetchError) },
    });
  }
});
