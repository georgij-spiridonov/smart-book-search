import { Ratelimit } from "@upstash/ratelimit";
import { getRedisClient } from "./redis";

/** 
 * Конфигурация ограничений частоты запросов (Rate Limits).
 * Экспортируется для возможности чтения лимитов в документации OpenAPI.
 */
export const RATE_LIMITS = {
  /** Стандартный лимит для легких GET-запросов */
  default: { tokens: 20, window: "10 s" as const },
  /** Лимит для чата, сбалансированный для скорости человеческого общения */
  chat: { tokens: 12, window: "60 s" as const },
  /** Строгий лимит для тяжелых POST-запросов (загрузка, векторизация) */
  strict: { tokens: 5, window: "60 s" as const },
} as const;

/** Кэшированные экземпляры ограничителей (Singleton) */
let cachedDefaultLimiter: Ratelimit | null = null;
let cachedChatLimiter: Ratelimit | null = null;
let cachedStrictLimiter: Ratelimit | null = null;

/**
 * Возвращает стандартный ограничитель: 20 запросов за 10 секунд (скользящее окно).
 * Используется для большинства информационных эндпоинтов.
 * 
 * @returns {Ratelimit} Экземпляр Ratelimit.
 */
export function getDefaultLimiter(): Ratelimit {
  if (!cachedDefaultLimiter) {
    cachedDefaultLimiter = new Ratelimit({
      redis: getRedisClient(),
      limiter: Ratelimit.slidingWindow(
        RATE_LIMITS.default.tokens,
        RATE_LIMITS.default.window,
      ),
      analytics: true,
      prefix: "smart-book-search:ratelimit:default",
    });
  }
  return cachedDefaultLimiter;
}

/**
 * Возвращает ограничитель для чата: 12 запросов за 60 секунд (скользящее окно).
 * Защищает ресурсы LLM от чрезмерного использования.
 * 
 * @returns {Ratelimit} Экземпляр Ratelimit.
 */
export function getChatLimiter(): Ratelimit {
  if (!cachedChatLimiter) {
    cachedChatLimiter = new Ratelimit({
      redis: getRedisClient(),
      limiter: Ratelimit.slidingWindow(
        RATE_LIMITS.chat.tokens,
        RATE_LIMITS.chat.window,
      ),
      analytics: true,
      prefix: "smart-book-search:ratelimit:chat",
    });
  }
  return cachedChatLimiter;
}

/**
 * Возвращает строгий ограничитель: 5 запросов за 60 секунд (скользящее окно).
 * Используется для ресурсоемких операций, таких как загрузка файлов.
 * 
 * @returns {Ratelimit} Экземпляр Ratelimit.
 */
export function getStrictLimiter(): Ratelimit {
  if (!cachedStrictLimiter) {
    cachedStrictLimiter = new Ratelimit({
      redis: getRedisClient(),
      limiter: Ratelimit.slidingWindow(
        RATE_LIMITS.strict.tokens,
        RATE_LIMITS.strict.window,
      ),
      analytics: true,
      prefix: "smart-book-search:ratelimit:strict",
    });
  }
  return cachedStrictLimiter;
}
