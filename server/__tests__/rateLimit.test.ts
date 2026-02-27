import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the redis module
const mockPing = vi.fn();

vi.mock("../utils/redis", () => ({
  getRedisClient: vi.fn(() => ({
    ping: mockPing,
  })),
}));

// Mock useRuntimeConfig
vi.stubGlobal("useRuntimeConfig", () => ({
  upstashRedisUrl: "https://test-redis.upstash.io",
  upstashRedisToken: "test-token",
}));

import { getRedisClient } from "../utils/redis";

describe("rateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("unit (mocked)", () => {
    it("succeeds when Redis PING returns PONG", async () => {
      mockPing.mockResolvedValueOnce("PONG");

      const redis = getRedisClient();
      const pong = await redis.ping();

      expect(pong).toBe("PONG");
      expect(mockPing).toHaveBeenCalledOnce();
    });

    it("handles Redis connection failure", async () => {
      mockPing.mockRejectedValueOnce(new Error("Connection refused"));

      const redis = getRedisClient();
      await expect(redis.ping()).rejects.toThrow("Connection refused");
    });
  });

  describe("availability", () => {
    it.skipIf(!process.env.KV_REST_API_URL)(
      "can connect to real Upstash Redis",
      async () => {
        const { Redis } =
          await vi.importActual<typeof import("@upstash/redis")>(
            "@upstash/redis",
          );

        const redis = new Redis({
          url: process.env.KV_REST_API_URL!,
          token: process.env.KV_REST_API_TOKEN!,
        });
        const pong = await redis.ping();
        expect(pong).toBe("PONG");
      },
    );
  });
});
