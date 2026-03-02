import { describe, it, expect, vi, beforeEach } from "vitest";

// =======================
// Имитации (Mocks)
// =======================
const mockRedis = {
  xadd: vi.fn(),
  expire: vi.fn(),
  xread: vi.fn(),
};

vi.mock("../utils/redis", () => ({
  getRedisClient: vi.fn(() => mockRedis),
}));

vi.mock("../utils/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
  // Для обратной совместимости, если где-то еще используется импорт log
  log: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }
}));

import { publishEvent, subscribeToEvents, type AppEvent } from "../utils/events";

describe("Система событий (events)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Функция publishEvent", () => {
    it("должна успешно публиковать событие в поток Redis", async () => {
      const userId = "user-123";
      const eventType = "chat:updated";
      const payload = { chatId: "chat-456" };

      mockRedis.xadd.mockResolvedValueOnce("123-0");
      mockRedis.expire.mockResolvedValueOnce(1);

      await publishEvent(userId, eventType, payload);

      expect(mockRedis.xadd).toHaveBeenCalledWith(
        `smart-book-search:events:${userId}`,
        "*",
        expect.objectContaining({
          event: expect.any(String),
        })
      );

      const publishedEvent = JSON.parse(mockRedis.xadd.mock.calls[0]![2].event) as AppEvent;
      expect(publishedEvent.type).toBe(eventType);
      expect(publishedEvent.userId).toBe(userId);
      expect(publishedEvent.payload).toEqual(payload);

      expect(mockRedis.expire).toHaveBeenCalledWith(`smart-book-search:events:${userId}`, 3600);
    });

    it("должна логировать ошибку при сбое Redis", async () => {
      mockRedis.xadd.mockRejectedValueOnce(new Error("Redis connection lost"));
      
      const { logger } = await import("../utils/logger");
      
      await publishEvent("user-1", "book:updated", {});
      
      expect(logger.error).toHaveBeenCalledWith("events", "Failed to publish event", expect.objectContaining({
        error: "Redis connection lost"
      }));
    });
  });

  describe("Генератор subscribeToEvents", () => {
    it("должен возвращать события из потока", async () => {
      const userId = "user-789";
      const mockEvent: AppEvent = {
        type: "job:updated",
        userId,
        payload: { jobId: "job-1" },
        timestamp: Date.now(),
      };

      // Имитируем ответ xread
      mockRedis.xread.mockResolvedValueOnce([
        ["stream", [["123-0", { event: JSON.stringify(mockEvent) }]]]
      ]);

      const subscription = subscribeToEvents(userId);
      const result = await subscription.next();

      expect(result.done).toBe(false);
      expect(result.value).toEqual({
        id: "123-0",
        event: mockEvent,
      });
    });

    it("должен возвращать пустой объект при таймауте (heartbeat)", async () => {
      mockRedis.xread.mockResolvedValueOnce(null);

      const subscription = subscribeToEvents("user-1");
      const result = await subscription.next();

      expect(result.value).toEqual({ id: null, event: null });
    });

    it("должен обрабатывать ошибки парсинга JSON", async () => {
      mockRedis.xread.mockResolvedValueOnce([
        ["stream", [["124-0", { event: "invalid-json" }]]]
      ]);
      mockRedis.xread.mockResolvedValueOnce(null); // Для завершения итерации в тесте
      
      const { logger } = await import("../utils/logger");
      
      const subscription = subscribeToEvents("user-1");
      
      // Первая итерация - ошибка парсинга
      await subscription.next();
      
      expect(logger.error).toHaveBeenCalledWith("events", "Failed to parse event from stream", { id: "124-0" });
    });

    it("должен обрабатывать ошибки Redis и продолжать работу после паузы", async () => {
      vi.useFakeTimers();
      mockRedis.xread.mockRejectedValueOnce(new Error("XREAD failed"));
      mockRedis.xread.mockResolvedValueOnce(null); // После ретрая
      
      const subscription = subscribeToEvents("user-1");
      const nextPromise = subscription.next();
      
      // Проматываем время ожидания (5000ms в коде)
      await vi.advanceTimersByTimeAsync(5001);
      
      const result = await nextPromise;
      expect(result.value).toEqual({ id: null, event: null });
      
      const { logger } = await import("../utils/logger");
      expect(logger.error).toHaveBeenCalledWith("events", "Error reading from stream", expect.objectContaining({
        error: "XREAD failed"
      }));
      
      vi.useRealTimers();
    });
  });
});
