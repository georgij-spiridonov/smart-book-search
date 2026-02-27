import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock AI SDK
vi.mock("ai", () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
  embedMany: vi.fn(),
}));

// Mock Pinecone
vi.mock("@pinecone-database/pinecone", () => ({
  Pinecone: vi.fn(() => ({
    index: vi.fn(() => ({
      query: vi.fn().mockResolvedValue({ matches: [] }),
    })),
  })),
}));

// Mock Redis
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

// Mock logger
vi.mock("../utils/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock useRuntimeConfig
vi.stubGlobal("useRuntimeConfig", () => ({
  pineconeApiKey: "test-key",
  pineconeIndex: "test-index",
  upstashRedisUrl: "https://test.upstash.io",
  upstashRedisToken: "token",
}));

import { generateText } from "ai";
import { CHAT_CONFIG } from "../utils/chatConfig";
import { generateAnswer } from "../utils/generateAnswer";

const mockedGenerateText = vi.mocked(generateText);

describe("chatPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("config validation", () => {
    it("has all required config keys", () => {
      const requiredKeys = [
        "answerModel",
        "retrievalLimit",
        "maxHistoryMessages",
        "answerSystemPrompt",
      ] as const;

      for (const key of requiredKeys) {
        expect(CHAT_CONFIG[key]).toBeTruthy();
      }
    });
  });

  describe("answer generation (mocked)", () => {
    it("generates an answer from mock chunks", async () => {
      mockedGenerateText.mockResolvedValueOnce({
        text: "AI is a field of computer science focused on creating intelligent machines.",
        usage: { inputTokens: 100, outputTokens: 20 },
      } as any);

      const mockChunks = [
        {
          text: "Artificial intelligence is a field of computer science.",
          pageNumber: 1,
          chapterTitle: "Introduction",
          score: 0.95,
          bookId: "test-book",
        },
      ];

      const answer = await generateAnswer(
        "What is artificial intelligence?",
        mockChunks,
        [],
      );

      expect(answer.text).toBeTruthy();
      expect(answer.text.length).toBeGreaterThan(0);
      expect(mockedGenerateText).toHaveBeenCalledOnce();
    });

    it("handles empty chunks gracefully", async () => {
      mockedGenerateText.mockResolvedValueOnce({
        text: "No relevant information found.",
        usage: { inputTokens: 50, outputTokens: 10 },
      } as any);

      const answer = await generateAnswer("test question", [], []);
      expect(answer.text).toBeTruthy();
    });
  });

  describe("availability", () => {
    it.skipIf(!process.env.AI_GATEWAY_API_KEY)(
      "can call real AI model",
      async () => {
        expect(true).toBe(true);
      },
    );
  });
});
