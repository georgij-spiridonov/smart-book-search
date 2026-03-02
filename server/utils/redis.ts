import { Redis } from "@upstash/redis";

/** Кэшированный экземпляр клиента Redis для повторного использования (Singleton) */
let cachedRedisClient: Redis | null = null;

/**
 * Возвращает клиент Redis, настроенный через Nuxt runtimeConfig или переменные окружения.
 * 
 * - Использует `useRuntimeConfig` для получения `upstashRedisUrl` и `upstashRedisToken`.
 * - В качестве запасного варианта ищет `UPSTASH_REDIS_REST_URL` или `KV_REST_API_URL`.
 * - Повторно использует один и тот же экземпляр между вызовами для повышения производительности.
 * 
 * @returns {Redis} Настроенный экземпляр клиента Redis.
 * @throws {Error} Если конфигурация Redis отсутствует.
 */
export function getRedisClient(): Redis {
  if (cachedRedisClient) {
    return cachedRedisClient;
  }

  let redisUrl: string | undefined;
  let redisToken: string | undefined;

  // Безопасно проверяем наличие useRuntimeConfig в глобальной области (Nuxt context)
  const globalObject = globalThis as Record<string, unknown>;
  
  if (typeof globalObject.useRuntimeConfig === "function") {
    try {
      const runtimeConfig = (globalObject.useRuntimeConfig as () => Record<string, string | undefined>)();
      redisUrl = runtimeConfig.upstashRedisUrl;
      redisToken = runtimeConfig.upstashRedisToken;
    } catch {
      // Игнорируем ошибки, если useRuntimeConfig недоступен или не содержит нужных полей
    }
  }

  // Запасной вариант для скриптов вне контекста Nuxt или при отсутствии конфига
  if (!redisUrl || !redisToken) {
    redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  }

  if (!redisUrl || !redisToken) {
    throw new Error(
      "Redis configuration is missing. Provide UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars.",
    );
  }

  cachedRedisClient = new Redis({
    url: redisUrl,
    token: redisToken,
  });

  return cachedRedisClient;
}
