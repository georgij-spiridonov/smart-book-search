import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Тестирование инициализации синглтона getRedisClient (redis.ts).
 * Мы тестируем фактический модуль (не мок), чтобы покрыть логику инициализации клиента.
 * Используем vi.stubGlobal для имитации useRuntimeConfig (Nuxt global) и мокаем библиотеку @upstash/redis.
 */

// Массив для отслеживания вызовов конструктора
const redisConstructorCalls: any[] = [];

vi.mock("@upstash/redis", () => {
  return {
    Redis: class MockRedis {
      constructor(options: any) {
        redisConstructorCalls.push(options);
      }
      ping() {
        return "PONG";
      }
    },
  };
});

// Глобальная имитация функции useRuntimeConfig
vi.stubGlobal("useRuntimeConfig", () => ({
  upstashRedisUrl: "https://fake-redis.upstash.io",
  upstashRedisToken: "fake-token-12345",
}));

// Переменная для хранения функции получения клиента
let getRedisClient: typeof import("../utils/redis").getRedisClient;

describe("Сервис Redis (redis)", () => {
  beforeEach(async () => {
    // Очищаем историю вызовов конструктора
    redisConstructorCalls.length = 0;

    // Сбрасываем модуль, чтобы _redisClient снова стал null
    vi.resetModules();

    // Повторно настраиваем глобальные моки после сброса модулей
    vi.stubGlobal("useRuntimeConfig", () => ({
      upstashRedisUrl: "https://fake-redis.upstash.io",
      upstashRedisToken: "fake-token-12345",
    }));

    // Импортируем модуль заново для получения "чистого" состояния
    const redisModule = await import("../utils/redis");
    getRedisClient = redisModule.getRedisClient;
  });

  it("должен создавать клиент Redis, используя useRuntimeConfig при первом вызове", () => {
    const redisClient = getRedisClient();

    expect(redisClient).toBeDefined();
    expect(redisConstructorCalls).toHaveLength(1);
    expect(redisConstructorCalls[0]).toEqual({
      url: "https://fake-redis.upstash.io",
      token: "fake-token-12345",
    });
  });

  it("должен возвращать один и тот же экземпляр при последующих вызовах (синглтон)", () => {
    const firstClient = getRedisClient();
    const secondClient = getRedisClient();

    expect(firstClient).toBe(secondClient);
    // Конструктор должен быть вызван только один раз
    expect(redisConstructorCalls).toHaveLength(1);
  });

  it("должен корректно считывать URL и токен из runtimeConfig", () => {
    getRedisClient();

    expect(redisConstructorCalls[0]!.url).toBe("https://fake-redis.upstash.io");
    expect(redisConstructorCalls[0]!.token).toBe("fake-token-12345");
  });

  it("должен выбрасывать ошибку, если конфигурация Redis полностью отсутствует", () => {
    // Удаляем глобальный мок
    (globalThis as any).useRuntimeConfig = undefined;
    
    // Очищаем переменные окружения (в vitest они могут сохраняться)
    const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
    const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    const originalKvUrl = process.env.KV_REST_API_URL;
    const originalKvToken = process.env.KV_REST_API_TOKEN;
    
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;

    try {
      expect(() => getRedisClient()).toThrow(
        "Redis configuration is missing. Provide UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars.",
      );
    } finally {
      // Восстанавливаем окружение
      process.env.UPSTASH_REDIS_REST_URL = originalUrl;
      process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
      process.env.KV_REST_API_URL = originalKvUrl;
      process.env.KV_REST_API_TOKEN = originalKvToken;
    }
  });
});
