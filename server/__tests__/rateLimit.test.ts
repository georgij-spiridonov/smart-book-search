import { describe, it, expect, vi, beforeEach } from "vitest";

// =======================
// Имитации (Mocks)
// =======================

// Имитация модуля redis
const mockRedisPing = vi.fn();

vi.mock("../utils/redis", () => ({
  getRedisClient: vi.fn(() => ({
    ping: mockRedisPing,
  })),
}));

// Настройка конфигурации Nuxt
vi.stubGlobal("useRuntimeConfig", () => ({
  upstashRedisUrl: "https://test-redis.upstash.io",
  upstashRedisToken: "test-token",
}));

import { getRedisClient } from "../utils/redis";
import {
  RATE_LIMITS,
  getDefaultLimiter,
  getChatLimiter,
  getStrictLimiter,
} from "../utils/rateLimiter";

describe("Ограничение частоты запросов (rateLimit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ──────── Конфигурация RATE_LIMITS ────────
  describe("Конфигурация лимитов (RATE_LIMITS config)", () => {
    it("должен иметь корректные лимиты по умолчанию", () => {
      expect(RATE_LIMITS.default.tokens).toBe(20);
      expect(RATE_LIMITS.default.window).toBe("10 s");
    });

    it("должен иметь корректные лимиты для чата", () => {
      expect(RATE_LIMITS.chat.tokens).toBe(12);
      expect(RATE_LIMITS.chat.window).toBe("60 s");
    });

    it("должен иметь корректные строгие лимиты", () => {
      expect(RATE_LIMITS.strict.tokens).toBe(5);
      expect(RATE_LIMITS.strict.window).toBe("60 s");
    });

    it("лимиты чата должны быть строже, чем лимиты по умолчанию", () => {
      expect(RATE_LIMITS.chat.tokens).toBeLessThan(RATE_LIMITS.default.tokens);
    });

    it("строгие лимиты должны быть самыми жесткими", () => {
      expect(RATE_LIMITS.strict.tokens).toBeLessThan(RATE_LIMITS.chat.tokens);
    });
  });

  // ──────── Экземпляры ограничителей (Limiter instances) ────────
  describe("Получение экземпляров ограничителей (limiter getters)", () => {
    it("getDefaultLimiter должен возвращать экземпляр Ratelimit", () => {
      const limiter = getDefaultLimiter();
      expect(limiter).toBeDefined();
      expect(typeof limiter.limit).toBe("function");
    });

    it("getChatLimiter должен возвращать экземпляр Ratelimit", () => {
      const limiter = getChatLimiter();
      expect(limiter).toBeDefined();
      expect(typeof limiter.limit).toBe("function");
    });

    it("getStrictLimiter должен возвращать экземпляр Ratelimit", () => {
      const limiter = getStrictLimiter();
      expect(limiter).toBeDefined();
      expect(typeof limiter.limit).toBe("function");
    });

    it("getDefaultLimiter должен возвращать один и тот же экземпляр при повторных вызовах (singleton)", () => {
      const firstInstance = getDefaultLimiter();
      const secondInstance = getDefaultLimiter();
      expect(firstInstance).toBe(secondInstance);
    });

    it("getChatLimiter должен возвращать один и тот же экземпляр при повторных вызовах (singleton)", () => {
      const firstInstance = getChatLimiter();
      const secondInstance = getChatLimiter();
      expect(firstInstance).toBe(secondInstance);
    });

    it("getStrictLimiter должен возвращать один и тот же экземпляр при повторных вызовах (singleton)", () => {
      const firstInstance = getStrictLimiter();
      const secondInstance = getStrictLimiter();
      expect(firstInstance).toBe(secondInstance);
    });
  });

  // ──────── Подключение к Redis (Юнит-тесты) ────────
  describe("Юнит-тесты подключения (Unit mocked)", () => {
    it("должен успешно работать, когда Redis отвечает PONG на PING", async () => {
      mockRedisPing.mockResolvedValueOnce("PONG");

      const redisClient = getRedisClient();
      const pongResponse = await redisClient.ping();

      expect(pongResponse).toBe("PONG");
      expect(mockRedisPing).toHaveBeenCalledOnce();
    });

    it("должен корректно обрабатывать ошибку подключения к Redis", async () => {
      mockRedisPing.mockRejectedValueOnce(new Error("В соединении отказано (Connection refused)"));

      const redisClient = getRedisClient();
      await expect(redisClient.ping()).rejects.toThrow("В соединении отказано (Connection refused)");
    });
  });

  // ──────── Проверка доступности (Availability) ────────
  describe("Проверка доступности (Availability)", () => {
    // Тест выполняется только при наличии реальных учетных данных Upstash
    it.skipIf(!process.env.KV_REST_API_URL)(
      "должен успешно подключаться к реальному Upstash Redis",
      async () => {
        const { Redis: RealUpstashRedis } =
          await vi.importActual<typeof import("@upstash/redis")>(
            "@upstash/redis",
          );

        const redisInstance = new RealUpstashRedis({
          url: process.env.KV_REST_API_URL!,
          token: process.env.KV_REST_API_TOKEN!,
        });
        
        const pongResponse = await redisInstance.ping();
        expect(pongResponse).toBe("PONG");
      },
    );
  });
});
