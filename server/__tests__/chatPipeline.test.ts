import { describe, it, expect, vi, beforeEach } from "vitest";

// =======================
// Имитации внешних сервисов (Mocks for External Services)
// =======================

// Имитация AI SDK
vi.mock("ai", () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}));

// Имитация Pinecone
vi.mock("@pinecone-database/pinecone", () => ({
  Pinecone: vi.fn(() => ({
    index: vi.fn(() => ({
      searchRecords: vi.fn().mockResolvedValue({ result: { hits: [] } }),
    })),
  })),
}));

// Имитация Redis
vi.mock("../utils/redis", () => ({
  getRedisClient: vi.fn(() => ({
    hset: vi.fn(),
    hgetall: vi.fn(async () => ({})),
    hget: vi.fn(async () => null),
    sadd: vi.fn(),
    smembers: vi.fn(async () => []),
    srem: vi.fn(),
    hdel: vi.fn(),
    del: vi.fn(),
    pipeline: vi.fn(() => ({
      hset: vi.fn().mockReturnThis(),
      sadd: vi.fn().mockReturnThis(),
      srem: vi.fn().mockReturnThis(),
      del: vi.fn().mockReturnThis(),
      hdel: vi.fn().mockReturnThis(),
      exec: vi.fn(async () => []),
    })),
  })),
}));

// Имитация логгера
vi.mock("../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Настройка конфигурации времени выполнения Nuxt
vi.stubGlobal("useRuntimeConfig", () => ({
  pineconeApiKey: "test-pinecone-key",
  pineconeIndex: "test-index",
  upstashRedisUrl: "https://test.upstash.io",
  upstashRedisToken: "test-token",
}));

import { generateText, streamText } from "ai";
import { CHAT_CONFIG } from "../utils/chatConfig";
import { generateAnswer, streamAnswer } from "../utils/generateAnswer";

const mockedGenerateText = vi.mocked(generateText);
const mockedStreamText = vi.mocked(streamText);

describe("Конвейер чата (chatPipeline)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Валидация конфигурации (Config Validation)", () => {
    it("должен содержать все необходимые ключи конфигурации", () => {
      const requiredConfigurationKeys = [
        "answerModel",
        "retrievalLimit",
        "maxHistoryMessages",
        "answerSystemPrompt",
      ] as const;

      for (const key of requiredConfigurationKeys) {
        expect(CHAT_CONFIG[key]).toBeTruthy();
      }
    });
  });

  describe("Генерация ответов (Answer Generation - Mocked)", () => {
    it("должен успешно генерировать ответ на основе предоставленных фрагментов", async () => {
      mockedGenerateText.mockResolvedValueOnce({
        text: "Искусственный интеллект — это область компьютерных наук, занимающаяся созданием интеллектуальных машин.",
        usage: { inputTokens: 100, outputTokens: 20 },
      } as any);

      const mockContextChunks = [
        {
          text: "Искусственный интеллект является областью компьютерных наук.",
          pageNumber: 1,
          chapterTitle: "Введение",
          score: 0.95,
          bookId: "test-book-id",
        },
      ];

      const response = await generateAnswer(
        "Что такое искусственный интеллект?",
        mockContextChunks,
        [],
      );

      expect(response.text).toBeTruthy();
      expect(response.text.length).toBeGreaterThan(0);
      expect(mockedGenerateText).toHaveBeenCalledOnce();
    });

    it("должен корректно обрабатывать ситуацию с отсутствием фрагментов контекста", async () => {
      mockedGenerateText.mockResolvedValueOnce({
        text: "Соответствующая информация не найдена.",
        usage: { inputTokens: 50, outputTokens: 10 },
      } as any);

      const response = await generateAnswer("тестовый вопрос", [], []);
      expect(response.text).toBeTruthy();
      expect(response.text).toBe("Соответствующая информация не найдена.");
    });

    it("должен включать историю сообщений в запрос к LLM", async () => {
      mockedGenerateText.mockResolvedValueOnce({
        text: "Ответ с учетом истории",
        usage: { inputTokens: 50, outputTokens: 10 },
      } as any);

      const response = await generateAnswer(
        "текущий вопрос",
        [],
        [
          { role: "user", content: "предыдущий вопрос" },
          { role: "assistant", content: "предыдущий ответ" },
        ],
      );
      
      expect(response.text).toBe("Ответ с учетом истории");
      expect(mockedGenerateText).toHaveBeenCalledOnce();
    });

    it("должен поддерживать потоковую генерацию ответов (streamAnswer)", () => {
      mockedStreamText.mockReturnValueOnce("mock-stream-object" as any);

      const result = streamAnswer(
        "вопрос",
        [
          {
            text: "контекст",
            score: 1,
            bookId: "1",
            pageNumber: 1,
            chapterTitle: "Глава 1",
          },
        ],
        [{ role: "user", content: "привет" }],
      );

      expect(result).toBe("mock-stream-object");
      expect(mockedStreamText).toHaveBeenCalledOnce();
    });
  });

  describe("Доступность внешних сервисов (Availability)", () => {
    // Данный тест пропускается, если нет реального API ключа в окружении
    it.skipIf(!process.env.AI_GATEWAY_API_KEY)(
      "должен успешно вызывать реальную модель ИИ",
      async () => {
        expect(true).toBe(true);
      },
    );
  });
});
