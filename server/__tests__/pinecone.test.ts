import { describe, it, expect, vi, beforeEach } from "vitest";

// =======================
// Имитации для Pinecone (Mocks for Pinecone)
// =======================
const { mockDescribeIndexStats } = vi.hoisted(() => ({
  mockDescribeIndexStats: vi.fn(),
}));

vi.mock("@pinecone-database/pinecone", () => {
  class MockPineconeIndex {
    describeIndexStats = mockDescribeIndexStats;
  }
  class MockPinecone {
    index() {
      return new MockPineconeIndex();
    }
  }
  return { Pinecone: MockPinecone };
});

// Настройка конфигурации Nuxt
vi.stubGlobal("useRuntimeConfig", () => ({
  pineconeApiKey: "test-pinecone-key",
  pineconeIndex: "test-pinecone-index",
  pineconeHost: "https://test-host.pinecone.io",
}));

describe("Интеграция с Pinecone (pinecone)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Юнит-тесты (Unit tests - mocked)", () => {
    it("должен успешно работать, когда база Pinecone доступна", async () => {
      mockDescribeIndexStats.mockResolvedValueOnce({
        dimension: 1024,
        indexFullness: 0.1,
        totalRecordCount: 100,
        namespaces: {},
      });

      const configuration = useRuntimeConfig();
      expect(configuration.pineconeApiKey).toBeTruthy();
      expect(configuration.pineconeIndex).toBeTruthy();
      expect(configuration.pineconeHost).toBeTruthy();

      const { Pinecone } = await import("@pinecone-database/pinecone");
      const pcClient = new Pinecone({ apiKey: configuration.pineconeApiKey });
      const pcIndex = pcClient.index(configuration.pineconeIndex);
      const stats = await pcIndex.describeIndexStats();

      expect(stats).toBeDefined();
      expect(stats.dimension).toBe(1024);
      expect(mockDescribeIndexStats).toHaveBeenCalledOnce();
    });

    it("должен определять отсутствие необходимых параметров в конфигурации Pinecone", () => {
      vi.stubGlobal("useRuntimeConfig", () => ({
        pineconeApiKey: "",
        pineconeIndex: "",
        pineconeHost: "",
      }));

      const configuration = useRuntimeConfig();
      expect(configuration.pineconeApiKey).toBeFalsy();
      expect(configuration.pineconeIndex).toBeFalsy();
    });

    it("должен корректно обрабатывать ошибки подключения к Pinecone", async () => {
      mockDescribeIndexStats.mockRejectedValueOnce(
        new Error("В соединении отказано (Connection refused)"),
      );

      const { Pinecone } = await import("@pinecone-database/pinecone");
      const pcClient = new Pinecone({ apiKey: "invalid-key" });
      const pcIndex = pcClient.index("any-index");

      await expect(pcIndex.describeIndexStats()).rejects.toThrow(
        "В соединении отказано (Connection refused)",
      );
    });
  });

  describe("Проверка доступности (Availability)", () => {
    // Данный тест выполняется только при наличии реальных учетных данных в окружении
    it.skipIf(!process.env.PINECONE_API_KEY)(
      "должен успешно подключаться к реальной базе Pinecone",
      async () => {
        const { Pinecone: RealPinecone } = await vi.importActual<
          typeof import("@pinecone-database/pinecone")
        >("@pinecone-database/pinecone");

        const pcClient = new RealPinecone({
          apiKey: process.env.PINECONE_API_KEY!,
        });
        const pcIndex = pcClient.index(process.env.PINECONE_INDEX!);
        const stats = await pcIndex.describeIndexStats();
        
        expect(stats).toBeDefined();
      },
    );
  });
});
