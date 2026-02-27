import { Redis } from "@upstash/redis";

let _redisClient: Redis | null = null;

/**
 * Returns a Redis client configured from Nuxt runtimeConfig.
 * Falls back to KV_REST_API_URL / KV_REST_API_TOKEN env vars via config.
 * Reuses a single instance across function invocations for better performance.
 */
export function getRedisClient(): Redis {
  if (!_redisClient) {
    const config = useRuntimeConfig();
    _redisClient = new Redis({
      url: config.upstashRedisUrl,
      token: config.upstashRedisToken,
    });
  }
  return _redisClient;
}
