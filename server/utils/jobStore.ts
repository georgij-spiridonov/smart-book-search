/**
 * In-memory job state store for async vectorization jobs.
 *
 * Tracks job progress so clients can poll GET /api/books/jobs/:id.
 * For production, replace with Vercel KV or a database.
 */

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

// In-memory store (sufficient for dev / single-instance)
const jobs = new Map<string, JobState>();

// Auto-cleanup: remove jobs older than 1 hour
const MAX_JOB_AGE_MS = 60 * 60 * 1000;

function cleanup() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > MAX_JOB_AGE_MS) {
      jobs.delete(id);
    }
  }
}

export function createJob(id: string, bookName: string): JobState {
  cleanup();
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
  jobs.set(id, job);
  return job;
}

export function getJob(id: string): JobState | undefined {
  return jobs.get(id);
}

export function updateJob(id: string, update: Partial<JobState>): void {
  const job = jobs.get(id);
  if (job) {
    Object.assign(job, update, { updatedAt: Date.now() });
  }
}

export function generateJobId(): string {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
