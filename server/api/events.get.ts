import { subscribeToEvents } from "../utils/events";
import { logger } from "../utils/logger";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = session.user?.id || session.id;

  if (!userId) {
    throw createError({ statusCode: 401, message: "Не авторизован" });
  }

  const eventStream = createEventStream(event);
  let isConnectionClosed = false;

  eventStream.onClosed(async () => {
    isConnectionClosed = true;
    logger.info("events-api", "SSE connection closed", { userId });
  });

  // Используем генератор для потоковой передачи событий из Redis
  const eventSubscription = subscribeToEvents(userId);

  // Запускаем цикл потоковой передачи
  (async () => {
    try {
      for await (const { id, event: appEvent } of eventSubscription) {
        if (isConnectionClosed) break;

        if (appEvent) {
          await eventStream.push({
            id: id || undefined,
            event: appEvent.type,
            data: JSON.stringify(appEvent.payload),
          });
        } else {
          // Heartbeat-сообщение для поддержания соединения активным
          await eventStream.push({
            event: "ping",
            data: "heartbeat",
          });
        }
      }
    } catch (error) {
      logger.error("events-api", "Stream error", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();

  return eventStream.send();
});
