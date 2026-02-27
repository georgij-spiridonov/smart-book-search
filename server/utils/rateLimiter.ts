import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

let _defaultLimiter: Ratelimit | null = null;
let _strictLimiter: Ratelimit | null = null;

/**
 * Returns a Redis client configured from Nuxt runtimeConfig.
 * Falls back to UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN env vars.
 */
function getRedis(): Redis {
  const config = useRuntimeConfig();
  return new Redis({
    url: config.upstashRedisUrl,
    token: config.upstashRedisToken,
  });
}

/**
 * Default rate limiter: 20 requests per 10 seconds (sliding window).
 * Used for lightweight GET endpoints.
 */
export function getDefaultLimiter(): Ratelimit {
  if (!_defaultLimiter) {
    _defaultLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(20, "10 s"),
      analytics: true,
      prefix: "smart-book-search:ratelimit:default",
    });
  }
  return _defaultLimiter;
}

/**
 * Strict rate limiter: 5 requests per 60 seconds (sliding window).
 * Used for heavy POST endpoints like upload and vectorize.
 */
export function getStrictLimiter(): Ratelimit {
  if (!_strictLimiter) {
    _strictLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(5, "60 s"),
      analytics: true,
      prefix: "smart-book-search:ratelimit:strict",
    });
  }
  return _strictLimiter;
}

/**
 * Expose a raw Redis client for health-check / test endpoints.
 */
export function getRedisClient(): Redis {
  return getRedis();
}
