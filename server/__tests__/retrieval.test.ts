import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Имитации для Pinecone.
 */
const { mockPineconeSearchRecords } = vi.hoisted(() => ({
  mockPineconeSearchRecords: vi.fn(),
}));

vi.mock("@pinecone-database/pinecone", () => {
  class MockPineconeIndex {
    searchRecords = mockPineconeSearchRecords;
  }
  class MockPinecone {
    index() {
      return new MockPineconeIndex();
    }
  }
  return { Pinecone: MockPinecone };
});

// Имитация AI SDK
const { mockGenerateText } = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
}));
vi.mock("ai", () => ({
  generateText: mockGenerateText,
}));

// Имитация конфигурации Nuxt
vi.stubGlobal("useRuntimeConfig", () => ({
  pineconeApiKey: "test-pinecone-key",
  pineconeIndex: "test-pinecone-index",
}));

// Имитация логгера
vi.mock("../utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { searchBookKnowledge, generateSearchQueries } from "../utils/retrieval";

describe("Поиск по базе знаний (retrieval)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Функция generateSearchQueries", () => {
    it("должна успешно генерировать список запросов из JSON ответа", async () => {
      mockGenerateText.mockResolvedValueOnce({
        text: '["запрос 1", "запрос 2"]',
      });

      const queries = await generateSearchQueries("вопрос", "книга 1");
      expect(queries).toEqual(["запрос 1", "запрос 2"]);
    });

    it("должна извлекать JSON массив, даже если он окружен текстом", async () => {
      mockGenerateText.mockResolvedValueOnce({
        text: 'Вот ваши запросы: ["query A", "query B"]. Надеюсь, они помогут.',
      });

      const queries = await generateSearchQueries("test", "book");
      expect(queries).toEqual(["query A", "query B"]);
    });

    it("должна исправлять одинарные кавычки в JSON массиве", async () => {
      mockGenerateText.mockResolvedValueOnce({
        text: "['single', 'quotes']",
      });

      const queries = await generateSearchQueries("q", "b");
      expect(queries).toEqual(["single", "quotes"]);
    });

    it("должна обрабатывать пустой массив после парсинга", async () => {
      mockGenerateText.mockResolvedValueOnce({ text: "[]" });
      const queries = await generateSearchQueries("q", "b");
      expect(queries).toEqual(["q"]);
    });

    it("должна логировать ошибку при полном сбое парсинга JSON", async () => {
      mockGenerateText.mockResolvedValueOnce({ text: "[это не джейсон]" });
      const { logger } = await import("../utils/logger");
      
      const queries = await generateSearchQueries("original", "info");
      expect(queries).toEqual(["original"]);
      expect(logger.error).toHaveBeenCalled();
    });

    it("должна возвращать исходный запрос, если JSON после фиксации всё ещё не валиден", async () => {
      mockGenerateText.mockResolvedValueOnce({
        text: "['really broken { } ]", // Совсем не валидно
      });
      const queries = await generateSearchQueries("q", "b");
      expect(queries).toEqual(["q"]);
    });

    it("должна возвращать исходный запрос при ошибке в AI модели", async () => {
      mockGenerateText.mockRejectedValueOnce(new Error("AI Model Error"));
      const queries = await generateSearchQueries("q", "b");
      expect(queries).toEqual(["q"]);
    });

    it("должна корректно обрабатывать ситуацию без bookMetadata", async () => {
      mockGenerateText.mockResolvedValueOnce({ text: '["query"]' });
      await generateSearchQueries("q", "");
      expect(mockGenerateText).toHaveBeenCalled();
    });

    it("должна включать историю в промпт", async () => {
      mockGenerateText.mockResolvedValueOnce({ text: '["q1"]' });
      
      await generateSearchQueries("current", "info", [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi there" }
      ]);
      
      const callArgs = mockGenerateText.mock.calls[0]![0];
      expect(callArgs.prompt).toContain("USER: hello");
      expect(callArgs.prompt).toContain("ASSISTANT: hi there");
    });
  });

  describe("Функция searchBookKnowledge", () => {
    it("должна возвращать отформатированные результаты поиска", async () => {
      mockPineconeSearchRecords.mockResolvedValueOnce({
        result: {
          hits: [
            {
              _id: "1",
              _score: 0.9,
              fields: { text: "AI content", pageNumber: 5, bookId: "b1" },
            },
          ],
        },
      });

      const results = await searchBookKnowledge("query", ["b1"]);
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ text: "AI content", score: 0.9 });
    });

    it("должна корректно обрабатывать пустые bookIds", async () => {
      mockPineconeSearchRecords.mockResolvedValueOnce({ result: { hits: [] } });
      const results = await searchBookKnowledge("q", []);
      expect(results).toEqual([]);
    });

    it("должна обрабатывать ситуацию, когда поля (fields) или скор отсутствуют", async () => {
      mockPineconeSearchRecords.mockResolvedValueOnce({
        result: {
          hits: [
            { _id: "empty", _score: undefined, fields: undefined }
          ]
        }
      });
      const results = await searchBookKnowledge("q", ["b"]);
      expect(results).toHaveLength(0); // Скор 0 < 0.3
    });

    it("должна выполнять повторные попытки (retry) при сбое Pinecone", async () => {
      vi.useFakeTimers();
      
      mockPineconeSearchRecords
        .mockRejectedValueOnce(new Error("Pinecone Timeout"))
        .mockRejectedValueOnce(new Error("Pinecone Overload"))
        .mockResolvedValueOnce({
          result: { hits: [{ _id: "3", _score: 0.8, fields: { text: "retry success" } }] },
        });

      const searchPromise = searchBookKnowledge("query", ["b1"]);
      
      await vi.runAllTimersAsync();
      await vi.runAllTimersAsync();

      const results = await searchPromise;
      expect(results[0]!.text).toBe("retry success");
      expect(mockPineconeSearchRecords).toHaveBeenCalledTimes(3);
      
      vi.useRealTimers();
    });

    it("должна возвращать пустой массив после исчерпания попыток", async () => {
      vi.useFakeTimers();
      mockPineconeSearchRecords.mockRejectedValue(new Error("Permanent Failure"));

      const searchPromise = searchBookKnowledge("query", ["b1"]);
      await vi.runAllTimersAsync();
      await vi.runAllTimersAsync();
      
      const results = await searchPromise;
      expect(results).toEqual([]);
      expect(mockPineconeSearchRecords).toHaveBeenCalledTimes(3);
      
      vi.useRealTimers();
    });

    it("должна корректно дедуплицировать результаты из разных запросов", async () => {
      mockPineconeSearchRecords
        .mockResolvedValueOnce({
          result: { hits: [{ _id: "1", _score: 0.8, fields: { text: "shared" } }] }
        })
        .mockResolvedValueOnce({
          result: { hits: [{ _id: "1", _score: 0.8, fields: { text: "shared" } }] }
        });

      const results = await searchBookKnowledge(["q1", "q2"], ["b"]);
      expect(results).toHaveLength(1);
    });

    it("должна корректно дедуплицировать, выбирая лучший скор", async () => {
      mockPineconeSearchRecords
        .mockResolvedValueOnce({
          result: { hits: [{ _id: "1", _score: 0.5, fields: { text: "duplicate" } }] }
        })
        .mockResolvedValueOnce({
          result: { hits: [{ _id: "2", _score: 0.9, fields: { text: "duplicate" } }] }
        });

      const results = await searchBookKnowledge(["q1", "q2"], ["b"]);
      expect(results).toHaveLength(1);
      expect(results[0]!.score).toBe(0.9);
    });

    it("должна игнорировать дубликаты с НИЗКИМ скором", async () => {
      mockPineconeSearchRecords
        .mockResolvedValueOnce({
          result: { hits: [{ _id: "1", _score: 0.9, fields: { text: "duplicate" } }] }
        })
        .mockResolvedValueOnce({
          result: { hits: [{ _id: "2", _score: 0.5, fields: { text: "duplicate" } }] }
        });

      const results = await searchBookKnowledge(["q1", "q2"], ["b"]);
      expect(results).toHaveLength(1);
      expect(results[0]!.score).toBe(0.9);
    });

    it("должна фильтровать результаты с низким скором (ниже MIN_SCORE=0.3)", async () => {
      mockPineconeSearchRecords.mockResolvedValueOnce({
        result: {
          hits: [{ _id: "low", _score: 0.2, fields: { text: "too low" } }],
        },
      });

      const results = await searchBookKnowledge("query", ["b1"]);
      expect(results).toHaveLength(0);
    });
  });
});
