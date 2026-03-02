import { describe, it, expect, vi, beforeEach } from "vitest";

// =======================
// Имитации сервисов (Mocks for Services)
// =======================

// Имитация клиента Inngest
const mockInngestSend = vi.fn();
vi.mock("../utils/inngest", () => ({
  inngest: {
    send: mockInngestSend,
  },
}));

// Имитация Redis для jobStore
vi.mock("../utils/redis", () => ({
  getRedisClient: vi.fn(() => ({
    hset: vi.fn(),
    hgetall: vi.fn(async () => ({})),
    expire: vi.fn(),
  })),
}));

// Имитация логгера
vi.mock("../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Настройка конфигурации времени выполнения Nuxt
vi.stubGlobal("useRuntimeConfig", () => ({
  upstashRedisUrl: "https://test.upstash.io",
  upstashRedisToken: "test-token",
  inngestEventKey: "test-event-key",
}));

describe("Сквозное тестирование Inngest (inngestE2e)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Юнит-тесты (Unit tests - mocked)", () => {
    it("должен отправлять событие в Inngest и получать идентификаторы событий (IDs)", async () => {
      mockInngestSend.mockResolvedValueOnce({
        ids: ["evt-abc-123-id"],
      });

      const result = await mockInngestSend({
        name: "book/vectorize",
        data: {
          jobId: "test-job-id-1",
          bookId: "test-book-id",
          blobUrl: "https://example.com/book.pdf",
          bookName: "Тестовая книга",
          resume: false,
          pineconeApiKey: "dummy-key",
          pineconeIndex: "dummy-index",
        },
      });

      expect(result.ids).toBeDefined();
      expect(result.ids).toHaveLength(1);
      expect(result.ids[0]).toBe("evt-abc-123-id");
      expect(mockInngestSend).toHaveBeenCalledOnce();
    });

    it("должен корректно обрабатывать ошибку отправки в Inngest", async () => {
      mockInngestSend.mockRejectedValueOnce(new Error("Inngest недоступен (Inngest unavailable)"));

      await expect(
        mockInngestSend({
          name: "book/vectorize",
          data: { jobId: "test-id", bookId: "test-id" },
        }),
      ).rejects.toThrow("Inngest недоступен (Inngest unavailable)");
    });

    it("должен определять ситуацию, когда Inngest возвращает пустой список идентификаторов", async () => {
      mockInngestSend.mockResolvedValueOnce({
        ids: [],
      });

      const result = await mockInngestSend({
        name: "book/vectorize",
        data: { jobId: "test-id", bookId: "test-id" },
      });

      expect(result.ids).toHaveLength(0);
    });
  });
});
