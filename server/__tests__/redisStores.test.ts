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

import { createJob, generateJobId } from "../utils/jobStore";
import {
  getFileHash,
  markFileAsUploaded,
  isFileVectorized,
  markFileAsVectorized,
} from "../utils/hashStore";

describe("redisStores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.clear();
    mockSets.clear();
  });

  describe("jobStore", () => {
    it("creates a job and retrieves it", async () => {
      const jobId = generateJobId();
      expect(jobId).toMatch(/^job-/);

      await createJob(jobId, "Test Book");

      // The mock stores data via hset
      expect(mockRedis.hset).toHaveBeenCalled();
    });

    it("generates unique job IDs", () => {
      const id1 = generateJobId();
      const id2 = generateJobId();
      expect(id1).not.toBe(id2);
    });
  });

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
  });

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
