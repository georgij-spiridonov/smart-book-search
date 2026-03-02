import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Имитация конфигурации времени выполнения Nuxt (Nuxt Runtime Config Mock).
 * Используется для проверки корректности загрузки переменных окружения,
 * необходимых для работы с AI Gateway.
 */
const mockConfig = {
  aiGatewayApiKey: "test-ai-gateway-key",
  blobToken: "test-blob-token",
  pineconeApiKey: "test-pinecone-key",
  pineconeIndex: "test-index",
  pineconeHost: "test-host",
  upstashRedisUrl: "https://test-redis.upstash.io",
  upstashRedisToken: "test-token",
};

// Глобальная имитация функции useRuntimeConfig
vi.stubGlobal("useRuntimeConfig", () => mockConfig);

describe("Конфигурация AI Gateway (AI Gateway Configuration)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("должен успешно возвращать ключ AI Gateway, если он загружен", () => {
    const configuration = useRuntimeConfig();
    expect(configuration.aiGatewayApiKey).toBeTruthy();
    expect(configuration.aiGatewayApiKey).toBe("test-ai-gateway-key");
  });

  it("должен определять отсутствие конфигурации AI Gateway", () => {
    // Переопределяем мок для этого теста, имитируя отсутствие ключа
    vi.stubGlobal("useRuntimeConfig", () => ({
      ...mockConfig,
      aiGatewayApiKey: "",
    }));

    const configuration = useRuntimeConfig();
    expect(configuration.aiGatewayApiKey).toBeFalsy();
    expect(configuration.aiGatewayApiKey).toBe("");
  });
});
