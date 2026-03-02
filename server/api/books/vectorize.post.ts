import { inngest } from "../../utils/inngest";
import { generateJobId, createJob } from "../../utils/jobStore";
import { getBook, getBookByBlobUrl } from "../../utils/bookStore";
import { logger } from "../../utils/logger";
import { VectorizeRequestSchema } from "../../utils/openapi/schemas";

/**
 * POST /api/books/vectorize
 *
 * Принимает JSON с параметрами для векторизации книги.
 * Возвращает 202 Accepted немедленно с jobId.
 * Фактическая обработка выполняется в фоновом режиме через Inngest.
 */
export default defineEventHandler(async (event) => {
  const applicationConfig = useRuntimeConfig();
  const session = await getUserSession(event);
  const userId = session.user?.id || session.id;

  if (!userId) {
    throw createError({ statusCode: 401, message: "Не авторизован" });
  }

  // Валидация входных данных с помощью Zod
  const requestBody = await readBody(event);
  const validationResult = VectorizeRequestSchema.safeParse(requestBody);

  if (!validationResult.success) {
    const errorMessage =
      validationResult.error.issues[0]?.message || "Неверное тело запроса";
    logger.error("vectorize-api", "Vectorize request validation failed", {
      error: errorMessage,
      issues: validationResult.error.issues,
    });
    throw createError({
      statusCode: 400,
      message: errorMessage,
    });
  }

  const {
    blobUrl,
    bookName,
    bookId: explicitBookId,
    resume: shouldResume,
    author: bookAuthor,
  } = validationResult.data;

  // Разрешаем bookId, если он не предоставлен
  let resolvedBookId = explicitBookId;
  let targetBook = null;

  if (resolvedBookId) {
    targetBook = await getBook(resolvedBookId);
  } else {
    targetBook = await getBookByBlobUrl(blobUrl);
    resolvedBookId = targetBook?.id;
  }

  if (!targetBook || !resolvedBookId) {
    logger.error("vectorize-api", "Book not found", { resolvedBookId, blobUrl });
    throw createError({
      statusCode: 404,
      message: "Книга не найдена в хранилище.",
    });
  }

  // Проверка прав владения: только загрузчик или администратор может векторизовать книгу
  if (!session.user?.isAdmin && targetBook.userId !== userId) {
    logger.warn("vectorize-api", "Unauthorized vectorization attempt", {
      resolvedBookId,
      attemptBy: userId,
      ownedBy: targetBook.userId,
    });
    throw createError({
      statusCode: 403,
      message: "Отказано в доступе: Вы можете векторизовать только загруженные вами книги.",
    });
  }

  logger.info("vectorize-api", "Starting vectorization job", {
    resolvedBookId,
    bookName,
    resume: !!shouldResume,
    userId,
    isAdmin: session.user?.isAdmin,
  });

  // Создаем запись для отслеживания задачи
  const generatedJobId = generateJobId();
  const targetUserId = targetBook.userId;
  await createJob(generatedJobId, resolvedBookId, bookName, targetUserId);

  // Запускаем фоновую обработку через Inngest
  await inngest.send({
    name: "book/vectorize",
    data: {
      jobId: generatedJobId,
      bookId: resolvedBookId,
      userId: targetUserId,
      blobUrl,
      bookName,
      author: typeof bookAuthor === "string" ? bookAuthor.trim() : undefined,
      resume: !!shouldResume,
      pineconeApiKey: applicationConfig.pineconeApiKey,
      pineconeIndex: applicationConfig.pineconeIndex,
    },
  });

  logger.info("vectorize-api", "Vectorization job queued successfully", { generatedJobId });

  // Возвращаем 202 немедленно
  setResponseStatus(event, 202);
  return {
    status: "accepted",
    jobId: generatedJobId,
    message: `Задача векторизации добавлена в очередь для "${bookName}".`,
    statusUrl: `/api/books/jobs/${generatedJobId}`,
  };
});
