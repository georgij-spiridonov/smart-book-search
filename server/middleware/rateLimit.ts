import { getDefaultLimiter, getStrictLimiter } from "../utils/rateLimiter";

/**
 * Nuxt server middleware — rate limiting for /api/** routes.
 *
 * - Skips non-API and test routes
 * - Uses strict limiter (5 req/60s) for heavy POST endpoints
 * - Uses default limiter (20 req/10s) for everything else
 * - Identifies clients by IP address
 * - Returns 429 with Retry-After header when exceeded
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
  const isHeavyEndpoint =
    (path === "/api/books/upload" || path === "/api/books/vectorize") &&
    event.method === "POST";

  const limiter = isHeavyEndpoint ? getStrictLimiter() : getDefaultLimiter();
  const identifier = isHeavyEndpoint ? `strict:${ip}` : `default:${ip}`;

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
  } catch (error: any) {
    // Re-throw 429 errors
    if (error.statusCode === 429) throw error;

    // If Redis is unreachable, fail open (allow the request through)
    // Log the error but don't block the user
    console.warn("[rate-limit] Redis error, failing open:", error.message);
  }
});
