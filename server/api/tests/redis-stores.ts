import { createJob, getJob, updateJob, generateJobId } from "../../utils/jobStore";
import {
  getFileHash,
  getExistingBlobUrl,
  markFileAsUploaded,
  isFileVectorized,
  markFileAsVectorized,
} from "../../utils/hashStore";

/**
 * GET /api/tests/redis-stores
 *
 * Integration test for jobStore and hashStore (Redis-backed).
 * Verifies that state is correctly preserved and retrieved from Redis.
 */
export default defineEventHandler(async () => {
  const results: { name: string; passed: boolean; detail: string }[] = [];

  // --- 1. Test jobStore ---
  try {
    const jobId = generateJobId();
    const bookName = "Test Redis Job";
    
    // Create
    await createJob(jobId, bookName);
    const job = await getJob(jobId);
    let passed = job?.id === jobId && job?.bookName === bookName && job?.status === "pending";
    results.push({
      name: "jobStore: createJob + getJob",
      passed,
      detail: job ? `ID: ${job.id}, Status: ${job.status}` : "Job not found",
    });

    // Update
    await updateJob(jobId, { status: "processing", progress: { currentPage: 5, totalPages: 10, chunksProcessed: 50, totalChunks: 100 } });
    const updatedJob = await getJob(jobId);
    passed = updatedJob?.status === "processing" && updatedJob?.progress.currentPage === 5;
    results.push({
      name: "jobStore: updateJob",
      passed,
      detail: updatedJob ? `Status: ${updatedJob.status}, Progress: ${updatedJob.progress.currentPage}/${updatedJob.progress.totalPages}` : "Job not found after update",
    });

    // Cleanup job
    const { getRedisClient } = await import("../../utils/redis");
    const redis = getRedisClient();
    await redis.del(`smart-book-search:jobs:${jobId}`);
  } catch (e: unknown) {
    results.push({ name: "jobStore integration", passed: false, detail: (e as Error).message });
  }

  // --- 2. Test hashStore ---
  try {
    const fakeContent = Buffer.from("fake-file-content-" + Date.now());
    const hash = getFileHash(fakeContent);
    const testUrl = "https://example.com/fake-blob.pdf";

    // markFileAsUploaded + getExistingBlobUrl
    await markFileAsUploaded(hash, testUrl);
    const existingUrl = await getExistingBlobUrl(hash);
    let passed = existingUrl === testUrl;
    results.push({
      name: "hashStore: markFileAsUploaded + getExistingBlobUrl",
      passed,
      detail: `Expected URL: ${testUrl}, Got: ${existingUrl}`,
    });

    // isFileVectorized + markFileAsVectorized
    const initialVectorized = await isFileVectorized(hash);
    await markFileAsVectorized(hash);
    const finalVectorized = await isFileVectorized(hash);
    passed = !initialVectorized && finalVectorized;
    results.push({
      name: "hashStore: isFileVectorized + markFileAsVectorized",
      passed,
      detail: `Initial: ${initialVectorized}, Final: ${finalVectorized}`,
    });

    // Cleanup hashStore entries
    const { getRedisClient } = await import("../../utils/redis");
    const redis = getRedisClient();
    await redis.hdel("smart-book-search:blobs", hash);
    await redis.srem("smart-book-search:vectorized", hash);
  } catch (e: unknown) {
    results.push({ name: "hashStore integration", passed: false, detail: (e as Error).message });
  }

  const allPassed = results.every((r) => r.passed);

  return {
    status: allPassed ? "success" : "failure",
    message: allPassed
      ? `All ${results.length} Redis store tests passed!`
      : `${results.filter((r) => !r.passed).length} of ${results.length} tests failed.`,
    tests: results,
  };
});
