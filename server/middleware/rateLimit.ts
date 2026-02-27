import {
  getDefaultLimiter,
  getChatLimiter,
  getStrictLimiter,
} from "../utils/rateLimiter";
import { log } from "../utils/logger";

/**
 * Nuxt server middleware — rate limiting for /api/** routes.
 *
 * - Skips non-API and test routes
 * - Uses strict limiter (5 req/60s) for heavy background jobs (upload/vectorize)
 * - Uses chat limiter (12 req/60s) for the chat pipeline
 * - Uses default limiter (20 req/10s) for everything else
 * - Identifies clients by IP address
 */
export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname;

  // Only rate-limit API routes
  if (!path.startsWith("/api/")) return;

  // Skip test endpoints
  if (path.startsWith("/api/tests/")) return;

  // --- Determine client IP ---
  const headers = getRequestHeaders(event);
  const forwarded = headers["x-forwarded-for"];
  const ip =
    (forwarded ? forwarded.split(",")[0]?.trim() : null) ||
    headers["x-real-ip"] ||
    event.node.req.socket?.remoteAddress ||
    "unknown";

  // --- Choose limiter ---
  let limiter;
  let identifier;

  if (
    event.method === "POST" &&
    (path === "/api/books/upload" || path === "/api/books/vectorize")
  ) {
    limiter = getStrictLimiter();
    identifier = `strict:${ip}`;
  } else if (event.method === "POST" && path === "/api/chat") {
    limiter = getChatLimiter();
    identifier = `chat:${ip}`;
  } else {
    limiter = getDefaultLimiter();
    identifier = `default:${ip}`;
  }

  try {
    const { success, limit, remaining, reset, pending } =
      await limiter.limit(identifier);

    // Let the serverless runtime finish async analytics/sync work
    if (typeof event.waitUntil === "function") {
      event.waitUntil(pending);
    }

    // Attach rate-limit headers to every response
    setResponseHeaders(event, {
      "X-RateLimit-Limit": String(limit),
      "X-RateLimit-Remaining": String(remaining),
      "X-RateLimit-Reset": String(reset),
    });

    if (!success) {
      const retryAfterSec = Math.max(1, Math.ceil((reset - Date.now()) / 1000));

      log.warn("rate-limit", "Rate limit exceeded", {
        ip,
        path,
        identifier,
        limit,
        retryAfter: retryAfterSec,
      });

      setResponseHeader(event, "Retry-After", retryAfterSec);
      throw createError({
        statusCode: 429,
        statusMessage: "Too Many Requests",
        data: {
          error: "Rate limit exceeded. Please try again later.",
          retryAfter: retryAfterSec,
        },
      });
    }
  } catch (error: unknown) {
    // Re-throw 429 errors
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      (error as { statusCode: number }).statusCode === 429
    )
      throw error;

    // If Redis is unreachable, fail open (allow the request through)
    // Log the error but don't block the user
    log.error("rate-limit", "Redis error during rate limiting, failing open", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
