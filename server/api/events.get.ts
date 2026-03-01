import { subscribeToEvents } from "../utils/events";
import { log } from "../utils/logger";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = session.user?.id || session.id;

  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }

  const eventStream = createEventStream(event);
  let closed = false;

  eventStream.onClosed(async () => {
    closed = true;
    log.info("events-api", "SSE connection closed", { userId });
  });

  // Use the generator to stream events from Redis
  const subscription = subscribeToEvents(userId);

  // Start the streaming loop
  (async () => {
    try {
      for await (const { id, event: appEvent } of subscription) {
        if (closed) break;

        if (appEvent) {
          await eventStream.push({
            id: id || undefined,
            event: appEvent.type,
            data: JSON.stringify(appEvent.payload),
          });
        } else {
          // Heartbeat to keep connection alive
          await eventStream.push({
            event: "ping",
            data: "heartbeat",
          });
        }
      }
    } catch (err) {
      log.error("events-api", "Stream error", {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();

  return eventStream.send();
});
