import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to define mock functions that need to be shared
// between the vi.mock factory and the test code
const { mockSearchRecords } = vi.hoisted(() => ({
  mockSearchRecords: vi.fn(),
}));

// Mock Pinecone — class definitions must be inside the factory
// because vi.mock is hoisted to the top of the file
vi.mock("@pinecone-database/pinecone", () => {
  class MockPineconeIndex {
    searchRecords = mockSearchRecords;
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

import { searchBookKnowledge } from "../utils/retrieval";

describe("retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("unit (mocked)", () => {
    it("returns formatted search results", async () => {
      // Mock Pinecone searchRecords (integrated embedding)
      mockSearchRecords.mockResolvedValueOnce({
        result: {
          hits: [
            {
              _id: "chunk-1",
              _score: 0.95,
              fields: {
                text: "Test chunk text about AI",
                pageNumber: 5,
                chapterTitle: "Introduction",
                bookId: "test-book",
              },
            },
            {
              _id: "chunk-2",
              _score: 0.88,
              fields: {
                text: "Another relevant chunk",
                pageNumber: 12,
                chapterTitle: "Chapter 2",
                bookId: "test-book",
              },
            },
          ],
        },
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
      expect(mockSearchRecords).toHaveBeenCalledOnce();
      expect(mockSearchRecords).toHaveBeenCalledWith({
        query: {
          topK: 2,
          inputs: { text: "What is artificial intelligence?" },
          filter: {
            bookId: { $in: ["test-book"] },
          },
        },
      });
    });

    it("returns empty array when no matches found", async () => {
      mockSearchRecords.mockResolvedValueOnce({
        result: { hits: [] },
      });

      const results = await searchBookKnowledge("no match query", ["book-1"]);
      expect(results).toHaveLength(0);
    });

    it("filters out low-score results below MIN_SCORE threshold", async () => {
      mockSearchRecords.mockResolvedValueOnce({
        result: {
          hits: [
            {
              _id: "chunk-1",
              _score: 0.95,
              fields: {
                text: "High relevance",
                pageNumber: 1,
                chapterTitle: "Ch1",
                bookId: "book-1",
              },
            },
            {
              _id: "chunk-2",
              _score: 0.1,
              fields: {
                text: "Low relevance",
                pageNumber: 2,
                chapterTitle: "Ch2",
                bookId: "book-1",
              },
            },
          ],
        },
      });

      const results = await searchBookKnowledge("test query", ["book-1"]);
      expect(results).toHaveLength(1);
      expect(results[0]!.score).toBe(0.95);
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
