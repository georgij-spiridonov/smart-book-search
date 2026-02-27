import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for getRedisClient singleton initialization.
 *
 * We test the actual module (not the mock) to cover lines 10-19 of redis.ts.
 * We mock `useRuntimeConfig` (Nuxt global) and the `@upstash/redis` module.
 */

// Track constructor calls manually
const constructorCalls: any[] = [];

vi.mock("@upstash/redis", () => {
  // Return a class that can be used with `new`
  return {
    Redis: class MockRedis {
      constructor(opts: any) {
        constructorCalls.push(opts);
      }
      ping() {
        return "PONG";
      }
    },
  };
});

// Provide the Nuxt global
vi.stubGlobal("useRuntimeConfig", () => ({
  upstashRedisUrl: "https://fake-redis.upstash.io",
  upstashRedisToken: "fake-token-12345",
}));

// We need to reset the module singleton between tests
let getRedisClient: typeof import("../utils/redis").getRedisClient;

describe("redis", () => {
  beforeEach(async () => {
    constructorCalls.length = 0;

    // Reset the module so _redisClient is null again
    vi.resetModules();

    // Re-setup mocks after resetModules
    vi.stubGlobal("useRuntimeConfig", () => ({
      upstashRedisUrl: "https://fake-redis.upstash.io",
      upstashRedisToken: "fake-token-12345",
    }));

    // Re-import to get a fresh module with _redisClient = null
    const redisModule = await import("../utils/redis");
    getRedisClient = redisModule.getRedisClient;
  });

  it("creates a Redis client using useRuntimeConfig on first call", () => {
    const client = getRedisClient();

    expect(client).toBeDefined();
    expect(constructorCalls).toHaveLength(1);
    expect(constructorCalls[0]).toEqual({
      url: "https://fake-redis.upstash.io",
      token: "fake-token-12345",
    });
  });

  it("returns the same instance on subsequent calls (singleton)", () => {
    const client1 = getRedisClient();
    const client2 = getRedisClient();

    expect(client1).toBe(client2);
    // Constructor should only be called once
    expect(constructorCalls).toHaveLength(1);
  });

  it("reads url and token from runtimeConfig", () => {
    getRedisClient();

    expect(constructorCalls[0]!.url).toBe("https://fake-redis.upstash.io");
    expect(constructorCalls[0]!.token).toBe("fake-token-12345");
  });
});
