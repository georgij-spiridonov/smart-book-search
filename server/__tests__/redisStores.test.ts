import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock environment and Nuxt globals before importing module
const { mockedGetRedisClient } = vi.hoisted(() => {
  const mockMembers = {
    hget: vi.fn(),
    hset: vi.fn(),
    sismember: vi.fn(),
    sadd: vi.fn(),
    hdel: vi.fn(),
    srem: vi.fn(),
    hgetall: vi.fn(),
  };

  return {
    mockedGetRedisClient: vi.fn(() => mockMembers),
  };
});

vi.mock("../utils/redis", () => ({
  getRedisClient: mockedGetRedisClient,
}));

vi.mock("../utils/logger", () => ({
  log: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import {
  getFileHash,
  getExistingBlobUrl,
  markFileAsUploaded,
  isFileVectorized,
  markFileAsVectorized,
  deleteHashesByBlobUrl,
} from "../utils/hashStore";

describe("hashStore", () => {
  let redisMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    redisMock = mockedGetRedisClient();
  });

  describe("getFileHash", () => {
    it("should generate a valid SHA-256 hex string", () => {
      const buffer = Buffer.from("test content");
      const hash = getFileHash(buffer);
      // SHA-256 of "test content"
      expect(hash).toBe(
        "6ae8a75555209fd6c44157c0aed8016e763ff435a19cf186f76863140143ff72",
      );
    });
  });

  describe("getExistingBlobUrl", () => {
    it("should return the blob url if it exists", async () => {
      redisMock.hget.mockResolvedValueOnce("https://blob/test");
      const url = await getExistingBlobUrl("testhash");
      expect(redisMock.hget).toHaveBeenCalledWith(
        "smart-book-search:blobs",
        "testhash",
      );
      expect(url).toBe("https://blob/test");
    });

    it("should return undefined if the hash does not exist", async () => {
      redisMock.hget.mockResolvedValueOnce(null);
      const url = await getExistingBlobUrl("unknown");
      expect(url).toBeUndefined();
    });
  });

  describe("markFileAsUploaded", () => {
    it("should store the hash and blob mapping", async () => {
      redisMock.hset.mockResolvedValueOnce(1);
      await markFileAsUploaded("newhash", "https://blob/new");
      expect(redisMock.hset).toHaveBeenCalledWith("smart-book-search:blobs", {
        newhash: "https://blob/new",
      });
    });
  });

  describe("isFileVectorized", () => {
    it("should return true if the hash is in the vectorized set", async () => {
      redisMock.sismember.mockResolvedValueOnce(1);
      const isVec = await isFileVectorized("hash-123");
      expect(redisMock.sismember).toHaveBeenCalledWith(
        "smart-book-search:vectorized",
        "hash-123",
      );
      expect(isVec).toBe(true);
    });

    it("should return false if the hash is not in the set", async () => {
      redisMock.sismember.mockResolvedValueOnce(0);
      const isVec = await isFileVectorized("hash-456");
      expect(isVec).toBe(false);
    });
  });

  describe("markFileAsVectorized", () => {
    it("should add the hash to the vectorized set", async () => {
      redisMock.sadd.mockResolvedValueOnce(1);
      await markFileAsVectorized("hash-to-vec");
      expect(redisMock.sadd).toHaveBeenCalledWith(
        "smart-book-search:vectorized",
        "hash-to-vec",
      );
    });
  });

  describe("deleteHashesByBlobUrl", () => {
    it("should find and delete hashes matching the blobUrl", async () => {
      // Mock finding one matching hash via hgetall
      redisMock.hgetall.mockResolvedValueOnce({
        hash1: "https://blob/target",
        hash2: "https://blob/other",
      });
      redisMock.hdel.mockResolvedValueOnce(1);
      redisMock.srem.mockResolvedValueOnce(1);

      await deleteHashesByBlobUrl("https://blob/target");

      // Verify that the hash mapping to this blobUrl is removed from both structures
      expect(redisMock.hdel).toHaveBeenCalledWith(
        "smart-book-search:blobs",
        "hash1",
      );
      expect(redisMock.srem).toHaveBeenCalledWith(
        "smart-book-search:vectorized",
        "hash1",
      );
    });
  });
});
