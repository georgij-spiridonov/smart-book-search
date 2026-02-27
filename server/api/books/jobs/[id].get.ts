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

  const job = await getJob(id);

  if (!job) {
    log.warn("jobs-api", "Requested job not found", { jobId: id });
    throw createError({
      statusCode: 404,
      statusMessage: `Job "${id}" not found.`,
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
