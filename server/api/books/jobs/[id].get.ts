import { getJob } from "../../../utils/jobStore";
import { log } from "../../../utils/logger";

/**
 * GET /api/books/jobs/:id
 *
 * Returns the current status and progress of a vectorization job.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");

  if (!id) {
    log.warn("jobs-api", "Job status requested without ID");
    throw createError({
      statusCode: 400,
      statusMessage: "Missing job ID.",
    });
  }

  const session = await getUserSession(event);
  const userId = session.user?.id || session.id;

  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }

  const job = await getJob(id);

  if (!job) {
    log.warn("jobs-api", "Requested job not found", { jobId: id });
    throw createError({
      statusCode: 404,
      statusMessage: `Job "${id}" not found.`,
    });
  }

  // Ownership check: only the user who started the job can see its status
  if (job.userId !== userId) {
    log.warn("jobs-api", "Unauthorized job status request", {
      jobId: id,
      attemptBy: userId,
      ownedBy: job.userId,
    });
    throw createError({
      statusCode: 403,
      statusMessage: "Forbidden: You can only see status of your own jobs.",
    });
  }

  log.info("jobs-api", "Job status fetched", { jobId: id, status: job.status });

  return {
    id: job.id,
    bookName: job.bookName,
    status: job.status,
    progress: job.progress,
    result: job.result,
    error: job.error,
    createdAt: new Date(job.createdAt).toISOString(),
    updatedAt: new Date(job.updatedAt).toISOString(),
  };
});
