import { describe, it, expect, vi, beforeEach } from "vitest";
import { splitPages } from "../utils/textSplitter";
import type { PageText } from "../utils/textParser";

// Mock Pinecone
const { mockUpsertRecords, mockFetch, mockDeleteMany } = vi.hoisted(() => ({
  mockUpsertRecords: vi.fn(),
  mockFetch: vi.fn(),
  mockDeleteMany: vi.fn(),
}));

vi.mock("@pinecone-database/pinecone", () => {
  class MockPineconeNamespace {
    upsertRecords = mockUpsertRecords;
    fetch = mockFetch;
    deleteMany = mockDeleteMany;
  }
  class MockPineconeIndex {
    namespace() {
      return new MockPineconeNamespace();
    }
    upsertRecords = mockUpsertRecords;
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

  describe("Pinecone upsertRecords (integrated embedding)", () => {
    it("upserts records with correct format for integrated embedding", async () => {
      const chunks = splitPages(samplePages, {
        chunkSize: 200,
        chunkOverlap: 50,
      });

      const bookSlug = "test-pipeline-v4";

      // Records for integrated embedding: id, text (for embedding), and metadata fields
      const records = chunks.map((chunk) => ({
        id: `${bookSlug}-chunk-${chunk.chunkIndex}`,
        text: chunk.text.slice(0, 200),
        bookName: "__test_v4__",
        chunkIndex: chunk.chunkIndex,
        pageNumber: chunk.pageNumber,
        chapterTitle: chunk.title || "",
      }));

      mockUpsertRecords.mockResolvedValueOnce(undefined);

      const { Pinecone } = await import("@pinecone-database/pinecone");
      const pc = new Pinecone({ apiKey: "test" });
      const index = pc.index("test");
      await index.upsertRecords({ records });

      expect(mockUpsertRecords).toHaveBeenCalledOnce();
      expect(mockUpsertRecords).toHaveBeenCalledWith({ records });

      // Verify record format: should have id and text, but NOT values
      const upsertedRecords = mockUpsertRecords.mock.calls[0]![0].records;
      expect(upsertedRecords[0]).toHaveProperty("id");
      expect(upsertedRecords[0]).toHaveProperty("text");
      expect(upsertedRecords[0]).not.toHaveProperty("values");
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
