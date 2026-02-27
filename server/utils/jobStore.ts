/**
 * Redis-backed job state store for async vectorization jobs.
 *
 * Tracks job progress so clients can poll GET /api/books/jobs/:id.
 */

import { getRedisClient } from "./redis";

export interface JobProgress {
  currentPage: number;
  totalPages: number;
  chunksProcessed: number;
  totalChunks: number;
}

export interface JobState {
  id: string;
  bookName: string;
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
const MAX_JOB_AGE_SECONDS = 60 * 60; // 1 hour

function getJobKey(id: string): string {
  return `${JOB_KEY_PREFIX}${id}`;
}

export async function createJob(id: string, bookName: string): Promise<JobState> {
  const redis = getRedisClient();
  const key = getJobKey(id);
  
  const job: JobState = {
    id,
    bookName,
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
  await redis.hset(key, {
    ...job,
    progress: JSON.stringify(job.progress),
  });
  await redis.expire(key, MAX_JOB_AGE_SECONDS);
  
  return job;
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

export async function updateJob(id: string, update: Partial<JobState>): Promise<void> {
  const redis = getRedisClient();
  const key = getJobKey(id);
  
  const hsetUpdate: Record<string, any> = {
    ...update,
    updatedAt: Date.now(),
  };

  if (update.progress) {
    hsetUpdate.progress = JSON.stringify(update.progress);
  }
  if (update.result) {
    hsetUpdate.result = JSON.stringify(update.result);
  }

  await redis.hset(key, hsetUpdate);
  // Refresh TTL on update
  await redis.expire(key, MAX_JOB_AGE_SECONDS);
}

export function generateJobId(): string {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
