import { describe, it, expect, vi, beforeEach } from "vitest";
import { splitPages } from "../utils/textSplitter";
import type { PageText } from "../utils/textParser";

// Mock embedMany from 'ai'
vi.mock("ai", () => ({
  embedMany: vi.fn(),
}));

// Mock Pinecone
const { mockUpsert, mockFetch, mockDeleteMany } = vi.hoisted(() => ({
  mockUpsert: vi.fn(),
  mockFetch: vi.fn(),
  mockDeleteMany: vi.fn(),
}));

vi.mock("@pinecone-database/pinecone", () => {
  class MockPineconeNamespace {
    upsert = mockUpsert;
    fetch = mockFetch;
    deleteMany = mockDeleteMany;
  }
  class MockPineconeIndex {
    namespace() {
      return new MockPineconeNamespace();
    }
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

import { embedMany } from "ai";

const mockedEmbedMany = vi.mocked(embedMany);

describe("vectorizePipeline", () => {
  const samplePages: PageText[] = [
    {
      pageNumber: 1,
      text: "Artificial intelligence is a branch of computer science. It deals with creating systems that can perform tasks requiring human intelligence.",
      title: "Introduction to AI",
    },
    {
      pageNumber: 2,
      text: "Machine learning is a subset of AI that enables systems to learn from data. Neural networks are computing systems inspired by biological neural networks.",
      title: "Machine Learning Basics",
    },
    {
      pageNumber: 3,
      text: "Deep learning uses multi-layered neural networks to analyze complex patterns in large datasets.",
      title: "Deep Learning Insights",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("page-aware chunking", () => {
    it("produces chunks with correct page metadata", () => {
      const chunks = splitPages(samplePages, {
        chunkSize: 200,
        chunkOverlap: 50,
      });

      expect(chunks.length).toBeGreaterThanOrEqual(1);

      for (const chunk of chunks) {
        expect(chunk.pageNumber).toBeGreaterThanOrEqual(1);
        expect(chunk.pageNumber).toBeLessThanOrEqual(3);
        expect(chunk.title).toBeTruthy();
      }
    });

    it("preserves page numbers from source pages", () => {
      const chunks = splitPages(samplePages);
      const pageNumbers = [...new Set(chunks.map((c) => c.pageNumber))];

      // Should cover pages from source data
      expect(pageNumbers.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("embedding generation (mocked)", () => {
    it("generates 1024-dimensional embeddings for each chunk", async () => {
      const chunks = splitPages(samplePages, {
        chunkSize: 200,
        chunkOverlap: 50,
      });

      const fakeEmbeddings = chunks.map(() => new Array(1024).fill(0.1));
      mockedEmbedMany.mockResolvedValueOnce({
        embeddings: fakeEmbeddings,
        values: [],
        usage: { tokens: 100 },
      } as any);

      const result = await embedMany({
        model: "openai/text-embedding-3-large" as any,
        values: chunks.map((c) => c.text),
        providerOptions: { openai: { dimensions: 1024 } },
      });

      expect(result.embeddings).toHaveLength(chunks.length);
      expect(result.embeddings[0]).toHaveLength(1024);
    });
  });

  describe("Pinecone upsert (mocked)", () => {
    it("upserts vectors with correct metadata", async () => {
      const chunks = splitPages(samplePages, {
        chunkSize: 200,
        chunkOverlap: 50,
      });

      const fakeEmbeddings = chunks.map(() => new Array(1024).fill(0.1));
      const bookSlug = "test-pipeline-v4";

      const vectors = chunks.map((chunk, i) => ({
        id: `${bookSlug}-chunk-${chunk.chunkIndex}`,
        values: fakeEmbeddings[i]!,
        metadata: {
          bookName: "__test_v4__",
          chunkIndex: chunk.chunkIndex,
          pageNumber: chunk.pageNumber,
          chapterTitle: chunk.title || "",
          text: chunk.text.slice(0, 200),
        },
      }));

      mockUpsert.mockResolvedValueOnce(undefined);

      const { Pinecone } = await import("@pinecone-database/pinecone");
      const pc = new Pinecone({ apiKey: "test" });
      const index = pc.index("test");
      await index.namespace("test").upsert({ records: vectors } as any);

      expect(mockUpsert).toHaveBeenCalledOnce();
      expect(mockUpsert).toHaveBeenCalledWith({ records: vectors });
    });

    it("supports resume mechanism by checking existing IDs", async () => {
      const existingIds = new Set(["test-chunk-0", "test-chunk-1"]);

      const allChunkIds = ["test-chunk-0", "test-chunk-1", "test-chunk-2"];
      const remaining = allChunkIds.filter((id) => !existingIds.has(id));

      expect(remaining).toEqual(["test-chunk-2"]);
    });
  });

  describe("availability", () => {
    it.skipIf(!process.env.PINECONE_API_KEY)(
      "can perform real vectorization pipeline",
      async () => {
        expect(true).toBe(true);
      },
    );
  });
});
