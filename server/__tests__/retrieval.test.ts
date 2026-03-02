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

    it("должна возвращать исходный запрос при ошибке парсинга", async () => {
      mockGenerateText.mockResolvedValueOnce({
        text: "Это не JSON массив вовсе",
      });

      const queries = await generateSearchQueries("original query", "info");
      expect(queries).toEqual(["original query"]);
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

    it("должна выполнять повторные попытки (retry) при сбое Pinecone", async () => {
      vi.useFakeTimers();
      
      // Два сбоя, затем успех
      mockPineconeSearchRecords
        .mockRejectedValueOnce(new Error("Pinecone Timeout"))
        .mockRejectedValueOnce(new Error("Pinecone Overload"))
        .mockResolvedValueOnce({
          result: { hits: [{ _id: "3", _score: 0.8, fields: { text: "retry success" } }] },
        });

      const searchPromise = searchBookKnowledge("query", ["b1"]);
      
      // Проматываем таймеры для ретраев
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

    it("должна дедуплицировать фрагменты и выбирать лучший скор", async () => {
      // Имитируем два запроса, вернувших один и тот же текст с разными скорами
      mockPineconeSearchRecords
        .mockResolvedValueOnce({
          result: { hits: [{ _id: "a", _score: 0.5, fields: { text: "duplicate" } }] },
        })
        .mockResolvedValueOnce({
          result: { hits: [{ _id: "b", _score: 0.8, fields: { text: "duplicate" } }] },
        });

      const results = await searchBookKnowledge(["q1", "q2"], ["b1"]);
      
      expect(results).toHaveLength(1);
      expect(results[0]!.score).toBe(0.8);
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
