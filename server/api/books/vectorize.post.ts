import { inngest } from "../../utils/inngest";
import { generateJobId, createJob } from "../../utils/jobStore";
import { getBookByBlobUrl } from "../../utils/bookStore";
import { log } from "../../utils/logger";

/**
 * POST /api/books/vectorize
 *
 * Accepts a JSON body with:
 *   - blobUrl: string   — URL of the uploaded file in Vercel Blob
 *   - bookName: string  — human-readable book title
 *   - bookId?: string   — unique ID of the book in the store
 *   - resume?: boolean  — if true, skip already-vectorized chunks (default: false)
 *
 * Returns 202 Accepted immediately with a jobId.
 * The actual processing runs in the background via Inngest.
 * Poll GET /api/books/jobs/:id for progress.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();

  // --- Validate input ---
  const body = await readBody(event);
  const {
    blobUrl,
    bookName,
    bookId: providedBookId,
    resume,
    author,
  } = body ?? {};

  if (!blobUrl || typeof blobUrl !== "string") {
    log.error("vectorize-api", "Vectorize request missing blobUrl");
    throw createError({
      statusCode: 400,
      statusMessage: "Missing or invalid 'blobUrl' in request body.",
    });
  }
  if (!bookName || typeof bookName !== "string") {
    log.error("vectorize-api", "Vectorize request missing bookName");
    throw createError({
      statusCode: 400,
      statusMessage: "Missing or invalid 'bookName' in request body.",
    });
  }

  // Resolve bookId if not provided
  let bookId = providedBookId;
  if (!bookId) {
    const book = await getBookByBlobUrl(blobUrl);
    bookId = book?.id;
  }

  if (!bookId) {
    log.error("vectorize-api", "Book not found for blobUrl", { blobUrl });
    throw createError({
      statusCode: 404,
      statusMessage: "Book not found in store for the provided blobUrl.",
    });
  }

  log.info("vectorize-api", "Starting vectorization job", {
    bookId,
    bookName,
    resume: !!resume,
  });

  // Create job tracking entry
  const jobId = generateJobId();
  await createJob(jobId, bookName);

  // Trigger background processing via Inngest
  await inngest.send({
    name: "book/vectorize",
    data: {
      jobId,
      bookId,
      blobUrl,
      bookName,
      author: typeof author === "string" ? author.trim() : undefined,
      resume: !!resume,
      pineconeApiKey: config.pineconeApiKey,
      pineconeIndex: config.pineconeIndex,
    },
  });

  log.info("vectorize-api", "Vectorization job queued successfully", { jobId });

  // Return 202 immediately
  setResponseStatus(event, 202);
  return {
    status: "accepted",
    jobId,
    message: `Vectorization job queued for "${bookName}".`,
    statusUrl: `/api/books/jobs/${jobId}`,
  };
});
