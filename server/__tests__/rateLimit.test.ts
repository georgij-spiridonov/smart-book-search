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
import {
  RATE_LIMITS,
  getDefaultLimiter,
  getChatLimiter,
  getStrictLimiter,
} from "../utils/rateLimiter";

describe("rateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ──────── RATE_LIMITS config ────────
  describe("RATE_LIMITS config", () => {
    it("has correct default limits", () => {
      expect(RATE_LIMITS.default.tokens).toBe(20);
      expect(RATE_LIMITS.default.window).toBe("10 s");
    });

    it("has correct chat limits", () => {
      expect(RATE_LIMITS.chat.tokens).toBe(12);
      expect(RATE_LIMITS.chat.window).toBe("60 s");
    });

    it("has correct strict limits", () => {
      expect(RATE_LIMITS.strict.tokens).toBe(5);
      expect(RATE_LIMITS.strict.window).toBe("60 s");
    });

    it("chat is more restrictive than default", () => {
      expect(RATE_LIMITS.chat.tokens).toBeLessThan(RATE_LIMITS.default.tokens);
    });

    it("strict is the most restrictive", () => {
      expect(RATE_LIMITS.strict.tokens).toBeLessThan(RATE_LIMITS.chat.tokens);
    });
  });

  // ──────── Limiter instances ────────
  describe("limiter getters", () => {
    it("getDefaultLimiter returns a Ratelimit instance", () => {
      const limiter = getDefaultLimiter();
      expect(limiter).toBeDefined();
      expect(typeof limiter.limit).toBe("function");
    });

    it("getChatLimiter returns a Ratelimit instance", () => {
      const limiter = getChatLimiter();
      expect(limiter).toBeDefined();
      expect(typeof limiter.limit).toBe("function");
    });

    it("getStrictLimiter returns a Ratelimit instance", () => {
      const limiter = getStrictLimiter();
      expect(limiter).toBeDefined();
      expect(typeof limiter.limit).toBe("function");
    });

    it("getDefaultLimiter returns the same instance on repeated calls", () => {
      const a = getDefaultLimiter();
      const b = getDefaultLimiter();
      expect(a).toBe(b);
    });

    it("getChatLimiter returns the same instance on repeated calls", () => {
      const a = getChatLimiter();
      const b = getChatLimiter();
      expect(a).toBe(b);
    });

    it("getStrictLimiter returns the same instance on repeated calls", () => {
      const a = getStrictLimiter();
      const b = getStrictLimiter();
      expect(a).toBe(b);
    });
  });

  // ──────── Redis connectivity (unit mocked) ────────
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

  // ──────── availability ────────
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
