import { Ratelimit } from "@upstash/ratelimit";
import { getRedisClient } from "./redis";

let _defaultLimiter: Ratelimit | null = null;
let _chatLimiter: Ratelimit | null = null;
let _strictLimiter: Ratelimit | null = null;

/**
 * Default rate limiter: 20 requests per 10 seconds (sliding window).
 * Used for lightweight GET endpoints.
 */
export function getDefaultLimiter(): Ratelimit {
  if (!_defaultLimiter) {
    _defaultLimiter = new Ratelimit({
      redis: getRedisClient(),
      limiter: Ratelimit.slidingWindow(20, "10 s"),
      analytics: true,
      prefix: "smart-book-search:ratelimit:default",
    });
  }
  return _defaultLimiter;
}

/**
 * Chat rate limiter: 12 requests per 60 seconds (sliding window).
 * Balanced for human conversation speed while protecting LLM resources.
 */
export function getChatLimiter(): Ratelimit {
  if (!_chatLimiter) {
    _chatLimiter = new Ratelimit({
      redis: getRedisClient(),
      limiter: Ratelimit.slidingWindow(12, "60 s"),
      analytics: true,
      prefix: "smart-book-search:ratelimit:chat",
    });
  }
  return _chatLimiter;
}

/**
 * Strict rate limiter: 5 requests per 60 seconds (sliding window).
 * Used for heavy POST endpoints like upload and vectorize.
 */
export function getStrictLimiter(): Ratelimit {
  if (!_strictLimiter) {
    _strictLimiter = new Ratelimit({
      redis: getRedisClient(),
      limiter: Ratelimit.slidingWindow(5, "60 s"),
      analytics: true,
      prefix: "smart-book-search:ratelimit:strict",
    });
  }
  return _strictLimiter;
}
