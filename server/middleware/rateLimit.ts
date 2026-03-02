import { defineEventHandler, getRequestURL, getRequestHeaders, setResponseHeaders, setResponseHeader, createError } from "h3";
import {
  getDefaultLimiter,
  getChatLimiter,
  getStrictLimiter,
} from "../utils/rateLimiter";
import { log } from "../utils/logger";

/**
 * Промежуточное ПО (Middleware) для ограничения частоты запросов к API.
 * 
 * - Применяется только к маршрутам /api/**.
 * - Использует различные лимиты в зависимости от ресурсоемкости запроса.
 * - Идентифицирует пользователей по IP-адресу.
 */
export default defineEventHandler(async (event) => {
  const { pathname: requestPath } = getRequestURL(event);

  // Обрабатываем только API-запросы
  if (!requestPath.startsWith("/api/")) return;

  // Игнорируем тестовые эндпоинты
  if (requestPath.startsWith("/api/tests/")) return;

  // --- Определение IP-адреса клиента ---
  const headers = getRequestHeaders(event);
  const xForwardedForHeader = headers["x-forwarded-for"];
  const clientIpAddress =
    (typeof xForwardedForHeader === "string" ? xForwardedForHeader.split(",")[0]?.trim() : null) ||
    headers["x-real-ip"] ||
    event.node.req.socket?.remoteAddress ||
    "unknown";

  // --- Выбор подходящего лимитера на основе типа запроса ---
  let selectedLimiter;
  let rateLimitIdentifier;

  const isHeavyOperation = event.method === "POST" && (requestPath === "/api/books/upload" || requestPath === "/api/books/vectorize");
  const isChatOperation = event.method === "POST" && requestPath === "/api/chat";

  if (isHeavyOperation) {
    selectedLimiter = getStrictLimiter();
    rateLimitIdentifier = `strict:${clientIpAddress}`;
  } else if (isChatOperation) {
    selectedLimiter = getChatLimiter();
    rateLimitIdentifier = `chat:${clientIpAddress}`;
  } else {
    selectedLimiter = getDefaultLimiter();
    rateLimitIdentifier = `default:${clientIpAddress}`;
  }

  try {
    const { success, limit, remaining, reset, pending } =
      await selectedLimiter.limit(rateLimitIdentifier);

    // Позволяем среде выполнения (напр. Vercel/Cloudflare) завершить фоновую работу
    if (typeof event.waitUntil === "function") {
      event.waitUntil(pending);
    }

    // Добавляем информационные заголовки лимитов в ответ
    setResponseHeaders(event, {
      "X-RateLimit-Limit": String(limit),
      "X-RateLimit-Remaining": String(remaining),
      "X-RateLimit-Reset": String(reset),
    });

    if (!success) {
      const retryAfterSeconds = Math.max(1, Math.ceil((reset - Date.now()) / 1000));

      log.warn("rate-limit", "Rate limit exceeded", {
        ip: clientIpAddress,
        path: requestPath,
        identifier: rateLimitIdentifier,
        limit,
        retryAfter: retryAfterSeconds,
      });

      setResponseHeader(event, "Retry-After", retryAfterSeconds);
      throw createError({
        statusCode: 429,
        statusMessage: "Too Many Requests",
        data: {
          error: "Превышен лимит запросов. Пожалуйста, попробуйте позже.",
          retryAfter: retryAfterSeconds,
        },
      });
    }
  } catch (err: unknown) {
    // Если это наша ошибка 429, пробрасываем её дальше
    if (err && typeof err === "object" && "statusCode" in err && (err as { statusCode?: number }).statusCode === 429) {
      throw err;
    }

    // В случае сбоя Redis (напр. таймаут), разрешаем запрос (fail open)
    log.error("rate-limit", "Redis error during rate limiting, failing open", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
});
