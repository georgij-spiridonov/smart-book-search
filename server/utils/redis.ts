import { Redis } from "@upstash/redis";

let _redisClient: Redis | null = null;

/**
 * Returns a Redis client configured from Nuxt runtimeConfig.
 * Falls back to KV_REST_API_URL / KV_REST_API_TOKEN env vars via config.
 * Reuses a single instance across function invocations for better performance.
 */
export function getRedisClient(): Redis {
  if (!_redisClient) {
    let url: string | undefined;
    let token: string | undefined;

    // Safely check for useRuntimeConfig in global scope
    const g = globalThis as Record<string, unknown>;
    if (typeof g.useRuntimeConfig === "function") {
      try {
        const config = (g.useRuntimeConfig as () => Record<string, string | undefined>)();
        url = config.upstashRedisUrl;
        token = config.upstashRedisToken;
      } catch {
        // Fallback if useRuntimeConfig fails or doesn't have the expected fields
      }
    }

    // Fallback for scripts outside of Nuxt context or if config is missing
    if (!url || !token) {
      url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
      token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    }

    if (!url || !token) {
      throw new Error(
        "Redis configuration is missing. Provide UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars.",
      );
    }

    _redisClient = new Redis({
      url,
      token,
    });
  }
  return _redisClient;
}
