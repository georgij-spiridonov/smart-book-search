import { getJob } from "../../../utils/jobStore";
import { logger } from "../../../utils/logger";

/**
 * GET /api/books/jobs/:id
 *
 * Возвращает текущий статус и прогресс задачи векторизации.
 */
export default defineEventHandler(async (event) => {
  const jobId = getRouterParam(event, "id");

  if (!jobId) {
    logger.warn("jobs-api", "Job status requested without ID");
    throw createError({
      statusCode: 400,
      message: "Отсутствует ID задачи.",
    });
  }

  const session = await getUserSession(event);
  const userId = session.user?.id || session.id;

  if (!userId) {
    throw createError({ statusCode: 401, message: "Не авторизован" });
  }

  const vectorizationJob = await getJob(jobId);

  if (!vectorizationJob) {
    logger.warn("jobs-api", "Requested job not found", { jobId });
    throw createError({
      statusCode: 404,
      message: `Задача "${jobId}" не найдена.`,
    });
  }

  // Проверка прав владения: только пользователь, запустивший задачу, может видеть её статус
  if (vectorizationJob.userId !== userId) {
    logger.warn("jobs-api", "Unauthorized job status request", {
      jobId,
      attemptBy: userId,
      ownedBy: vectorizationJob.userId,
    });
    throw createError({
      statusCode: 403,
      message: "Отказано в доступе: Вы можете просматривать статус только своих задач.",
    });
  }

  logger.info("jobs-api", "Job status fetched", { jobId, status: vectorizationJob.status });

  return {
    id: vectorizationJob.id,
    bookName: vectorizationJob.bookName,
    status: vectorizationJob.status,
    progress: vectorizationJob.progress,
    result: vectorizationJob.result,
    error: vectorizationJob.error,
    createdAt: new Date(vectorizationJob.createdAt).toISOString(),
    updatedAt: new Date(vectorizationJob.updatedAt).toISOString(),
  };
});
