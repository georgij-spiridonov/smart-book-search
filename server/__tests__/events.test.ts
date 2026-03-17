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

    it("должна логировать ошибку при сбое Redis (не Error объект)", async () => {
      mockRedis.xadd.mockRejectedValueOnce("Fatal Redis Error String");
      const { logger } = await import("../utils/logger");
      await publishEvent("user-1", "book:updated", {});
      expect(logger.error).toHaveBeenCalledWith("events", "Failed to publish event", expect.objectContaining({
        error: "Fatal Redis Error String"
      }));
    });

    it("должен логировать ошибку при сбое XADD (Error объект)", async () => {
      mockRedis.xadd.mockRejectedValueOnce(new Error("Redis ReadOnly"));
      const { logger } = await import("../utils/logger");

      await publishEvent("user-1", "chat:updated", { chatId: "c1" });
      expect(logger.error).toHaveBeenCalledWith("events", "Failed to publish event", expect.anything());
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

    it("должен возвращать пустой объект при пустом списке результатов", async () => {
      mockRedis.xread.mockResolvedValueOnce([]); // Пустой массив результатов
      const subscription = subscribeToEvents("user-1");
      const result = await subscription.next();
      expect(result.value).toEqual({ id: null, event: null });
    });

    it("должен пропускать сообщения без поля event или с нестроковым полем", async () => {
      mockRedis.xread.mockResolvedValueOnce([
        ["stream", [
          ["125-0", { not_event: "data" }], // Нет поля event
          ["126-0", { event: 123 }],       // Не строка
          ["127-0", { event: JSON.stringify({ type: "chat:updated", userId: "u", payload: {}, timestamp: 1 }) }]
        ]]
      ]);
      
      const subscription = subscribeToEvents("user-1");
      const result = await subscription.next();
      
      // Должен пропустить первые два и вернуть третье
      expect(result.done).toBe(false);
      expect((result.value as any).id).toBe("127-0");
    });

    it("должен возвращать пустой объект при таймауте (heartbeat)", async () => {
      mockRedis.xread.mockResolvedValueOnce(null);

      const subscription = subscribeToEvents("user-1");
      const result = await subscription.next();

      expect(result.done).toBe(false);
      expect((result.value as any).id).toBe(null);
    });

    it("должен логировать ошибку при сбое XREAD", async () => {
      mockRedis.xread.mockRejectedValueOnce(new Error("Redis Down"));
      const { logger } = await import("../utils/logger");

      const subscription = subscribeToEvents("user-1");
      // Виртуальное время для setTimeout(5000)
      vi.useFakeTimers();
      const nextPromise = subscription.next();
      await vi.runAllTimersAsync();
      await nextPromise;

      expect(logger.error).toHaveBeenCalledWith("events", "Error reading from stream", expect.anything());
      vi.useRealTimers();
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

    it("должен обрабатывать ошибки Redis (не Error объект) и продолжать работу", async () => {
      vi.useFakeTimers();
      mockRedis.xread.mockRejectedValueOnce("Critical Error");
      mockRedis.xread.mockResolvedValueOnce(null);
      
      const subscription = subscribeToEvents("user-1");
      const nextPromise = subscription.next();
      await vi.advanceTimersByTimeAsync(5001);
      
      const result = await nextPromise;
      expect(result.value).toEqual({ id: null, event: null });
      
      const { logger } = await import("../utils/logger");
      expect(logger.error).toHaveBeenCalledWith("events", "Error reading from stream", expect.objectContaining({
        error: "Critical Error"
      }));
      vi.useRealTimers();
    });
  });
});
