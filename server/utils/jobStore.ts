/**
 * Redis-backed job state store for async vectorization jobs.
 *
 * Tracks job progress so clients can poll GET /api/books/jobs/:id.
 */

import { getRedisClient } from "./redis";
import { log } from "./logger";

export interface JobProgress {
  currentPage: number;
  totalPages: number;
  chunksProcessed: number;
  totalChunks: number;
}

export interface JobState {
  id: string;
  bookId: string;
  bookName: string;
  userId: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: JobProgress;
  result?: {
    totalPages: number;
    totalChunks: number;
    skipped: number;
    newVectors: number;
  };
  error?: string;
  createdAt: number;
  updatedAt: number;
}

const JOB_KEY_PREFIX = "smart-book-search:jobs:";
const USER_JOBS_PREFIX = "smart-book-search:user-jobs:";
const MAX_JOB_AGE_SECONDS = 60 * 60; // 1 hour

function getJobKey(id: string): string {
  return `${JOB_KEY_PREFIX}${id}`;
}

function getUserJobsKey(userId: string): string {
  return `${USER_JOBS_PREFIX}${userId}`;
}

export async function createJob(
  id: string,
  bookId: string,
  bookName: string,
  userId: string,
): Promise<JobState> {
  const redis = getRedisClient();
  const key = getJobKey(id);
  const userJobsKey = getUserJobsKey(userId);

  const job: JobState = {
    id,
    bookId,
    bookName,
    userId,
    status: "pending",
    progress: {
      currentPage: 0,
      totalPages: 0,
      chunksProcessed: 0,
      totalChunks: 0,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Store fields in Redis Hash
  const pipeline = redis.pipeline();
  pipeline.hset(key, {
    ...job,
    progress: JSON.stringify(job.progress),
  });
  pipeline.expire(key, MAX_JOB_AGE_SECONDS);
  pipeline.sadd(userJobsKey, id);
  pipeline.expire(userJobsKey, MAX_JOB_AGE_SECONDS);
  await pipeline.exec();

  log.info("job-store", "Created new vectorization job", {
    jobId: id,
    bookName,
  });

  return job;
}

export async function getUserJobs(userId: string): Promise<JobState[]> {
  const redis = getRedisClient();
  const userJobsKey = getUserJobsKey(userId);
  const jobIds = await redis.smembers<string[]>(userJobsKey);

  if (!jobIds || jobIds.length === 0) {
    return [];
  }

  const jobs: JobState[] = [];
  const pipeline = redis.pipeline();
  for (const id of jobIds) {
    pipeline.hgetall(getJobKey(id));
  }

  const results = await pipeline.exec<(Record<string, unknown> | null)[]>();

  for (let i = 0; i < results.length; i++) {
    const data = results[i];
    if (data && Object.keys(data).length > 0) {
      const job = data as unknown as JobState;
      if (typeof data.progress === "string") {
        job.progress = JSON.parse(data.progress);
      }
      if (typeof data.result === "string") {
        job.result = JSON.parse(data.result);
      }
      job.createdAt = Number(job.createdAt);
      job.updatedAt = Number(job.updatedAt);
      jobs.push(job);
    } else {
      // Clean up orphaned job IDs from user set
      await redis.srem(userJobsKey, jobIds[i]);
    }
  }

  return jobs;
}

export async function getJob(id: string): Promise<JobState | undefined> {
  const redis = getRedisClient();
  const key = getJobKey(id);
  const data = await redis.hgetall(key);

  if (!data || Object.keys(data).length === 0) {
    return undefined;
  }

  // Cast and parse JSON fields
  const job = data as unknown as JobState;
  if (typeof data.progress === "string") {
    job.progress = JSON.parse(data.progress);
  }
  if (typeof data.result === "string") {
    job.result = JSON.parse(data.result);
  }

  // Ensure numeric fields are numbers (Redis hgetall might return strings depending on client)
  job.createdAt = Number(job.createdAt);
  job.updatedAt = Number(job.updatedAt);

  return job;
}

export async function updateJob(
  id: string,
  update: Partial<JobState>,
): Promise<void> {
  const redis = getRedisClient();
  const key = getJobKey(id);

  const hsetUpdate: Record<string, string | number> = {};

  // Copy primitives and stringify objects
  for (const [field, value] of Object.entries(update)) {
    if (value === undefined) continue;

    if (field === "progress" || field === "result") {
      hsetUpdate[field] = JSON.stringify(value);
    } else if (typeof value === "string" || typeof value === "number") {
      hsetUpdate[field] = value;
    }
  }

  hsetUpdate.updatedAt = Date.now();

  await redis.hset(key, hsetUpdate);
  // Refresh TTL on update
  await redis.expire(key, MAX_JOB_AGE_SECONDS);

  if (update.status) {
    log.info("job-store", "Updated vectorization job status", {
      jobId: id,
      status: update.status,
    });
  }
}

export function generateJobId(): string {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
