import { getRedisClient } from "../../utils/rateLimiter";

/**
 * GET /api/tests/rate-limit
 *
 * Health-check for Upstash Redis connectivity used by rate limiting.
 */
export default defineEventHandler(async () => {
  try {
    const redis = getRedisClient();
    const pong = await redis.ping();

    return {
      status: "success",
      message: "Upstash Redis is accessible!",
      ping: pong,
    };
  } catch (error: any) {
    return {
      status: "error",
      message: "Failed to connect to Upstash Redis",
      error: error.message,
    };
  }
});
