import { getRedisClient } from "./redis";
import { log } from "./logger";

export interface AppEvent {
  type:
    | "chat:updated"
    | "book:updated"
    | "job:updated";
  userId: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

const EVENTS_STREAM_PREFIX = "smart-book-search:events:";

function getStreamKey(userId: string): string {
  return `${EVENTS_STREAM_PREFIX}${userId}`;
}

/**
 * Publish an event to the user's event stream in Redis.
 * Uses Redis Streams (XADD) for cross-instance communication.
 */
export async function publishEvent(
  userId: string,
  type: AppEvent["type"],
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const redis = getRedisClient();
    const streamKey = getStreamKey(userId);

    const event: AppEvent = {
      type,
      userId,
      payload,
      timestamp: Date.now(),
    };

    // Add to stream with max length to prevent infinite growth
    await redis.xadd(streamKey, "*", {
      event: JSON.stringify(event),
    });

    // Set expiration on the stream key so it doesn't linger forever if user is inactive
    await redis.expire(streamKey, 3600); // 1 hour

    log.info("events", "Published event", { type, userId });
  } catch (error) {
    log.error("events", "Failed to publish event", {
      type,
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Subscribe to the user's event stream.
 * This is a generator that yields events as they arrive.
 * Designed for use in SSE handlers.
 */
export async function* subscribeToEvents(userId: string, lastEventId = "$") {
  const redis = getRedisClient();
  const streamKey = getStreamKey(userId);

  let currentId = lastEventId;

  while (true) {
    try {
      // XREAD with blocking (wait for up to 20s)
      // Correct signature for @upstash/redis
      const results = (await redis.xread(
        streamKey,
        currentId,
        { blockMS: 20000 }
      )) as [string, [string, Record<string, string>][]][] | null;

      if (results && results.length > 0) {
        const [_, messages] = results[0]!;
        for (const [id, fields] of messages) {
          currentId = id;
          if (fields && typeof fields.event === "string") {
            try {
              const event = JSON.parse(fields.event) as AppEvent;
              yield { id, event };
            } catch {
              log.error("events", "Failed to parse event from stream", { id });
            }
          }
        }
      } else {
        // Timeout reached, yield heartbeat to keep connection alive
        yield { id: null, event: null };
      }
    } catch (error) {
      log.error("events", "Error reading from stream", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Wait a bit before retrying on error
      await new Promise((resolve) => setTimeout(resolve, 5000));
      yield { id: null, event: null };
    }
  }
}
