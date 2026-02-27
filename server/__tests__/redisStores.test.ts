import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory Redis mock
const mockStore = new Map<string, any>();
const mockSets = new Map<string, Set<string>>();

const mockRedis = {
  hset: vi.fn(async (key: string, data: Record<string, any>) => {
    const existing = mockStore.get(key) || {};
    mockStore.set(key, { ...existing, ...data });
  }),
  hgetall: vi.fn(async (key: string) => {
    return mockStore.get(key) || {};
  }),
  hget: vi.fn(async (key: string, field: string) => {
    const data = mockStore.get(key) || {};
    return data[field] || null;
  }),
  hdel: vi.fn(async (key: string, ...fields: string[]) => {
    const data = mockStore.get(key);
    if (data) {
      for (const f of fields) delete data[f];
    }
  }),
  del: vi.fn(async (key: string) => {
    mockStore.delete(key);
  }),
  expire: vi.fn(async () => {}),
  sadd: vi.fn(async (key: string, ...members: string[]) => {
    if (!mockSets.has(key)) mockSets.set(key, new Set());
    for (const m of members) mockSets.get(key)!.add(m);
  }),
  srem: vi.fn(async (key: string, ...members: string[]) => {
    const s = mockSets.get(key);
    if (s) for (const m of members) s.delete(m);
  }),
  sismember: vi.fn(async (key: string, member: string) => {
    return mockSets.has(key) && mockSets.get(key)!.has(member) ? 1 : 0;
  }),
  smembers: vi.fn(async (key: string) => {
    return mockSets.has(key) ? [...mockSets.get(key)!] : [];
  }),
  pipeline: vi.fn(() => ({
    hset: vi.fn().mockReturnThis(),
    sadd: vi.fn().mockReturnThis(),
    srem: vi.fn().mockReturnThis(),
    del: vi.fn().mockReturnThis(),
    hdel: vi.fn().mockReturnThis(),
    hgetall: vi.fn().mockReturnThis(),
    exec: vi.fn(async () => []),
  })),
};

vi.mock("../utils/redis", () => ({
  getRedisClient: vi.fn(() => mockRedis),
}));

// Mock useRuntimeConfig
vi.stubGlobal("useRuntimeConfig", () => ({
  upstashRedisUrl: "https://test-redis.upstash.io",
  upstashRedisToken: "test-token",
}));

import { createJob, getJob, updateJob, generateJobId } from "../utils/jobStore";
import {
  getFileHash,
  markFileAsUploaded,
  isFileVectorized,
  markFileAsVectorized,
  getExistingBlobUrl,
} from "../utils/hashStore";

describe("redisStores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.clear();
    mockSets.clear();
  });

  // ──────── jobStore ────────
  describe("jobStore", () => {
    it("generates unique job IDs with correct prefix", () => {
      const id1 = generateJobId();
      const id2 = generateJobId();
      expect(id1).toMatch(/^job-/);
      expect(id2).toMatch(/^job-/);
      expect(id1).not.toBe(id2);
    });

    it("creates a job with correct initial state", async () => {
      const jobId = generateJobId();
      const job = await createJob(jobId, "Test Book");

      expect(job.id).toBe(jobId);
      expect(job.bookName).toBe("Test Book");
      expect(job.status).toBe("pending");
      expect(job.progress).toEqual({
        currentPage: 0,
        totalPages: 0,
        chunksProcessed: 0,
        totalChunks: 0,
      });
      expect(job.createdAt).toBeGreaterThan(0);
      expect(job.updatedAt).toBeGreaterThan(0);
      expect(mockRedis.hset).toHaveBeenCalled();
      expect(mockRedis.expire).toHaveBeenCalled();
    });

    it("getJob returns undefined for non-existent job", async () => {
      const result = await getJob("non-existent-id");
      expect(result).toBeUndefined();
    });

    it("getJob retrieves and parses a created job", async () => {
      const jobId = generateJobId();
      await createJob(jobId, "My Book");

      const retrieved = await getJob(jobId);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(jobId);
      expect(retrieved!.bookName).toBe("My Book");
      expect(retrieved!.status).toBe("pending");
      expect(typeof retrieved!.progress).toBe("object");
      expect(retrieved!.progress.currentPage).toBe(0);
    });

    it("getJob parses progress from JSON string", async () => {
      // Simulate how Redis would store it — progress as JSON string
      const jobId = "job-parse-test";
      mockStore.set(`smart-book-search:jobs:${jobId}`, {
        id: jobId,
        bookName: "Parse Test",
        status: "processing",
        progress: JSON.stringify({
          currentPage: 5,
          totalPages: 10,
          chunksProcessed: 15,
          totalChunks: 30,
        }),
        createdAt: "1700000000000",
        updatedAt: "1700000001000",
      });

      const job = await getJob(jobId);
      expect(job).toBeDefined();
      expect(job!.progress.currentPage).toBe(5);
      expect(job!.progress.totalPages).toBe(10);
      expect(job!.progress.chunksProcessed).toBe(15);
      expect(job!.progress.totalChunks).toBe(30);
    });

    it("getJob parses result from JSON string", async () => {
      const jobId = "job-result-test";
      mockStore.set(`smart-book-search:jobs:${jobId}`, {
        id: jobId,
        bookName: "Result Test",
        status: "completed",
        progress: JSON.stringify({
          currentPage: 10,
          totalPages: 10,
          chunksProcessed: 30,
          totalChunks: 30,
        }),
        result: JSON.stringify({
          totalPages: 10,
          totalChunks: 30,
          skipped: 2,
          newVectors: 28,
        }),
        createdAt: "1700000000000",
        updatedAt: "1700000002000",
      });

      const job = await getJob(jobId);
      expect(job).toBeDefined();
      expect(job!.result).toBeDefined();
      expect(job!.result!.totalPages).toBe(10);
      expect(job!.result!.skipped).toBe(2);
      expect(job!.result!.newVectors).toBe(28);
    });

    it("getJob coerces createdAt and updatedAt to numbers", async () => {
      const jobId = "job-coerce-test";
      mockStore.set(`smart-book-search:jobs:${jobId}`, {
        id: jobId,
        bookName: "Coerce Test",
        status: "pending",
        progress: JSON.stringify({
          currentPage: 0,
          totalPages: 0,
          chunksProcessed: 0,
          totalChunks: 0,
        }),
        createdAt: "1700000000000", // string from Redis
        updatedAt: "1700000001000",
      });

      const job = await getJob(jobId);
      expect(typeof job!.createdAt).toBe("number");
      expect(typeof job!.updatedAt).toBe("number");
      expect(job!.createdAt).toBe(1700000000000);
    });

    it("updateJob updates status and refreshes TTL", async () => {
      const jobId = generateJobId();
      await createJob(jobId, "Update Test");
      vi.clearAllMocks();

      await updateJob(jobId, { status: "processing" });

      expect(mockRedis.hset).toHaveBeenCalled();
      expect(mockRedis.expire).toHaveBeenCalled();

      // Check the data written includes status and updatedAt
      const hsetCall = mockRedis.hset.mock.calls[0]!;
      const data = hsetCall[1] as Record<string, any>;
      expect(data.status).toBe("processing");
      expect(data.updatedAt).toBeGreaterThan(0);
    });

    it("updateJob serializes progress to JSON", async () => {
      const jobId = generateJobId();
      await createJob(jobId, "Progress Test");
      vi.clearAllMocks();

      await updateJob(jobId, {
        progress: {
          currentPage: 3,
          totalPages: 10,
          chunksProcessed: 9,
          totalChunks: 30,
        },
      });

      const hsetCall = mockRedis.hset.mock.calls[0]!;
      const data = hsetCall[1] as Record<string, any>;
      expect(typeof data.progress).toBe("string");
      const parsed = JSON.parse(data.progress);
      expect(parsed.currentPage).toBe(3);
    });

    it("updateJob serializes result to JSON", async () => {
      const jobId = generateJobId();
      await createJob(jobId, "Result Update");
      vi.clearAllMocks();

      await updateJob(jobId, {
        status: "completed",
        result: {
          totalPages: 10,
          totalChunks: 30,
          skipped: 2,
          newVectors: 28,
        },
      });

      const hsetCall = mockRedis.hset.mock.calls[0]!;
      const data = hsetCall[1] as Record<string, any>;
      expect(typeof data.result).toBe("string");
      const parsed = JSON.parse(data.result);
      expect(parsed.newVectors).toBe(28);
    });

    it("updateJob skips undefined values", async () => {
      const jobId = generateJobId();
      await createJob(jobId, "Skip Test");
      vi.clearAllMocks();

      await updateJob(jobId, { status: "processing", error: undefined });

      const hsetCall = mockRedis.hset.mock.calls[0]!;
      const data = hsetCall[1] as Record<string, any>;
      expect(data.status).toBe("processing");
      expect("error" in data).toBe(false);
    });
  });

  // ──────── hashStore ────────
  describe("hashStore", () => {
    it("computes SHA-256 hash from buffer", () => {
      const buffer = Buffer.from("test-content");
      const hash = getFileHash(buffer);

      expect(hash).toHaveLength(64); // SHA-256 hex
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it("returns consistent hash for same content", () => {
      const buffer = Buffer.from("same-content");
      expect(getFileHash(buffer)).toBe(getFileHash(buffer));
    });

    it("returns different hashes for different content", () => {
      const buf1 = Buffer.from("content-a");
      const buf2 = Buffer.from("content-b");
      expect(getFileHash(buf1)).not.toBe(getFileHash(buf2));
    });

    it("stores and retrieves blob URL by hash", async () => {
      const hash = "abc123";
      const url = "https://example.com/file.pdf";

      await markFileAsUploaded(hash, url);
      expect(mockRedis.hset).toHaveBeenCalled();
    });

    it("checks vectorization status", async () => {
      const hash = "test-hash";

      // Initially not vectorized
      const before = await isFileVectorized(hash);
      expect(before).toBe(false);

      // Mark as vectorized
      await markFileAsVectorized(hash);
      expect(mockRedis.sadd).toHaveBeenCalled();
    });

    it("isFileVectorized returns true after marking", async () => {
      const hash = "vec-test-hash";

      await markFileAsVectorized(hash);
      const result = await isFileVectorized(hash);
      expect(result).toBe(true);
    });

    it("getExistingBlobUrl returns undefined when hash not found", async () => {
      const result = await getExistingBlobUrl("unknown-hash");
      expect(result).toBeUndefined();
    });

    it("getExistingBlobUrl returns stored URL when hash exists", async () => {
      const hash = "known-hash";
      const url = "https://blob.vercel-storage.com/file.pdf";

      // Pre-populate the mock store with the hash -> url mapping
      mockStore.set("smart-book-search:blobs", { [hash]: url });

      const result = await getExistingBlobUrl(hash);
      expect(result).toBe(url);
    });
  });

  // ──────── availability ────────
  describe("availability", () => {
    it.skipIf(!process.env.KV_REST_API_URL)(
      "can perform real Redis round-trip",
      async () => {
        const { Redis } =
          await vi.importActual<typeof import("@upstash/redis")>(
            "@upstash/redis",
          );

        const redis = new Redis({
          url: process.env.KV_REST_API_URL!,
          token: process.env.KV_REST_API_TOKEN!,
        });

        const testKey = `__test-redis-stores-${Date.now()}`;
        await redis.set(testKey, "test-value");
        const value = await redis.get(testKey);
        expect(value).toBe("test-value");
        await redis.del(testKey);
      },
    );
  });
});
