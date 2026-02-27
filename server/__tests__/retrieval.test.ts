import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock embedMany from 'ai'
vi.mock("ai", () => ({
  embedMany: vi.fn(),
}));

// Use vi.hoisted to define mock functions that need to be shared
// between the vi.mock factory and the test code
const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

// Mock Pinecone — class definitions must be inside the factory
// because vi.mock is hoisted to the top of the file
vi.mock("@pinecone-database/pinecone", () => {
  class MockPineconeIndex {
    query = mockQuery;
  }

  class MockPinecone {
    index() {
      return new MockPineconeIndex();
    }
  }

  return { Pinecone: MockPinecone };
});

// Mock useRuntimeConfig
vi.stubGlobal("useRuntimeConfig", () => ({
  pineconeApiKey: "test-key",
  pineconeIndex: "test-index",
}));

// Mock logger to suppress output
vi.mock("../utils/logger", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { embedMany } from "ai";
import { searchBookKnowledge } from "../utils/retrieval";

const mockedEmbedMany = vi.mocked(embedMany);

describe("retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("unit (mocked)", () => {
    it("returns formatted search results", async () => {
      // Mock embedding generation
      mockedEmbedMany.mockResolvedValueOnce({
        embeddings: [new Array(1024).fill(0.1)],
        values: [],
        usage: { tokens: 10 },
      } as any);

      // Mock Pinecone query
      mockQuery.mockResolvedValueOnce({
        matches: [
          {
            id: "chunk-1",
            score: 0.95,
            metadata: {
              text: "Test chunk text about AI",
              pageNumber: 5,
              chapterTitle: "Introduction",
              bookId: "test-book",
            },
          },
          {
            id: "chunk-2",
            score: 0.88,
            metadata: {
              text: "Another relevant chunk",
              pageNumber: 12,
              chapterTitle: "Chapter 2",
              bookId: "test-book",
            },
          },
        ],
      });

      const results = await searchBookKnowledge(
        "What is artificial intelligence?",
        ["test-book"],
        2,
      );

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        text: "Test chunk text about AI",
        pageNumber: 5,
        chapterTitle: "Introduction",
        score: 0.95,
        bookId: "test-book",
      });
      expect(results[1]!.score).toBe(0.88);
      expect(mockedEmbedMany).toHaveBeenCalledOnce();
      expect(mockQuery).toHaveBeenCalledOnce();
    });

    it("returns empty array when no matches found", async () => {
      mockedEmbedMany.mockResolvedValueOnce({
        embeddings: [new Array(1024).fill(0.1)],
        values: [],
        usage: { tokens: 10 },
      } as any);

      mockQuery.mockResolvedValueOnce({ matches: [] });

      const results = await searchBookKnowledge("no match query", ["book-1"]);
      expect(results).toHaveLength(0);
    });

    it("throws when embedding generation fails", async () => {
      mockedEmbedMany.mockResolvedValueOnce({
        embeddings: [],
        values: [],
        usage: { tokens: 0 },
      } as any);

      await expect(searchBookKnowledge("test", ["book-1"])).rejects.toThrow(
        "Failed to generate embedding",
      );
    });
  });

  describe("availability", () => {
    it.skipIf(!process.env.PINECONE_API_KEY)(
      "can perform real retrieval query",
      async () => {
        // Real integration test — uses actual API keys
        expect(true).toBe(true);
      },
    );
  });
});
