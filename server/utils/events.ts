import { getRedisClient } from "./redis";
import { logger } from "./logger";

/** Типы событий, которые могут происходить в приложении */
export interface AppEvent {
  /** Тип события */
  type:
    | "chat:updated"
    | "book:updated"
    | "job:updated";
  /** ID пользователя, которому адресовано событие */
  userId: string;
  /** Данные события */
  payload: Record<string, unknown>;
  /** Метка времени возникновения события */
  timestamp: number;
}

/** Префикс для ключей потоков событий в Redis */
const REDIS_KEY_EVENTS_STREAM_PREFIX = "smart-book-search:events:";
/** Срок жизни потока событий при бездействии (1 час) */
const EVENTS_STREAM_TTL_SECONDS = 3600;

/** Формирует ключ потока для конкретного пользователя */
function formatEventStreamKey(userId: string): string {
  return `${REDIS_KEY_EVENTS_STREAM_PREFIX}${userId}`;
}

/**
 * Публикует событие в поток событий пользователя в Redis.
 * Использует Redis Streams (XADD) для межсерверного взаимодействия.
 * 
 * @param {string} userId ID целевого пользователя.
 * @param {AppEvent["type"]} eventType Тип события.
 * @param {Record<string, unknown>} eventPayload Данные события.
 */
export async function publishEvent(
  userId: string,
  eventType: AppEvent["type"],
  eventPayload: Record<string, unknown>,
): Promise<void> {
  try {
    const redisClient = getRedisClient();
    const streamKey = formatEventStreamKey(userId);

    const newEvent: AppEvent = {
      type: eventType,
      userId,
      payload: eventPayload,
      timestamp: Date.now(),
    };

    // Добавляем событие в поток (XADD)
    await redisClient.xadd(streamKey, "*", {
      event: JSON.stringify(newEvent),
    });

    // Устанавливаем срок жизни ключа, чтобы он не висел вечно при неактивности пользователя
    await redisClient.expire(streamKey, EVENTS_STREAM_TTL_SECONDS);

    logger.info("events", "Published event", { type: eventType, userId });
  } catch (error) {
    logger.error("events", "Failed to publish event", {
      type: eventType,
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Подписывается на поток событий пользователя.
 * Это асинхронный генератор, который выдает события по мере их поступления.
 * Предназначен для использования в обработчиках Server-Sent Events (SSE).
 * 
 * @param {string} userId ID пользователя.
 * @param {string} lastEventId ID последнего полученного события (по умолчанию "$" — только новые).
 * @yields {{ id: string | null, event: AppEvent | null }} Объект с ID и данными события или null для heartbeat.
 */
export async function* subscribeToEvents(userId: string, lastEventId = "$") {
  const redisClient = getRedisClient();
  const streamKey = formatEventStreamKey(userId);

  let currentIdPointer = lastEventId;

  while (true) {
    try {
      /**
       * XREAD с блокировкой ожидания (ждем до 20 секунд).
       * Это позволяет эффективно реализовать Long Polling / SSE без лишних запросов к БД.
       */
      const readResults = (await redisClient.xread(
        streamKey,
        currentIdPointer,
        { blockMS: 20000 }
      )) as [string, [string, Record<string, string>][]][] | null;

      if (readResults && readResults.length > 0) {
        const [_, messagesList] = readResults[0]!;
        
        for (const [messageId, messageFields] of messagesList) {
          currentIdPointer = messageId;
          
          if (messageFields && typeof messageFields.event === "string") {
            try {
              const parsedEvent = JSON.parse(messageFields.event) as AppEvent;
              yield { id: messageId, event: parsedEvent };
            } catch {
              logger.error("events", "Failed to parse event from stream", { id: messageId });
            }
          }
        }
      } else {
        /**
         * Таймаут достигнут — выдаем пустой результат (heartbeat).
         * Это помогает поддерживать HTTP-соединение активным.
         */
        yield { id: null, event: null };
      }
    } catch (error) {
      logger.error("events", "Error reading from stream", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      
      // Небольшая пауза перед повторной попыткой в случае ошибки Redis
      await new Promise((resolve) => setTimeout(resolve, 5000));
      yield { id: null, event: null };
    }
  }
}
