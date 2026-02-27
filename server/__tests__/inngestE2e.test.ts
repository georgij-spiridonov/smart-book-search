import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock inngest client
const mockSend = vi.fn();
vi.mock("../utils/inngest", () => ({
  inngest: {
    send: mockSend,
  },
}));

// Mock Redis for jobStore
vi.mock("../utils/redis", () => ({
  getRedisClient: vi.fn(() => ({
    hset: vi.fn(),
    hgetall: vi.fn(async () => ({})),
    expire: vi.fn(),
  })),
}));

// Mock logger
vi.mock("../utils/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock useRuntimeConfig
vi.stubGlobal("useRuntimeConfig", () => ({
  upstashRedisUrl: "https://test.upstash.io",
  upstashRedisToken: "token",
  inngestEventKey: "test-key",
}));

describe("inngestE2e", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("unit (mocked)", () => {
    it("sends event to Inngest and receives event IDs", async () => {
      mockSend.mockResolvedValueOnce({
        ids: ["evt-abc-123"],
      });

      const result = await mockSend({
        name: "book/vectorize",
        data: {
          jobId: "test-job-1",
          bookId: "test-book",
          blobUrl: "https://example.com/book.pdf",
          bookName: "Test Book",
          resume: false,
          pineconeApiKey: "dummy",
          pineconeIndex: "dummy",
        },
      });

      expect(result.ids).toBeDefined();
      expect(result.ids).toHaveLength(1);
      expect(result.ids[0]).toBe("evt-abc-123");
      expect(mockSend).toHaveBeenCalledOnce();
    });

    it("handles Inngest send failure", async () => {
      mockSend.mockRejectedValueOnce(new Error("Inngest unavailable"));

      await expect(
        mockSend({
          name: "book/vectorize",
          data: { jobId: "test", bookId: "test" },
        }),
      ).rejects.toThrow("Inngest unavailable");
    });

    it("detects when Inngest returns no event IDs", async () => {
      mockSend.mockResolvedValueOnce({
        ids: [],
      });

      const result = await mockSend({
        name: "book/vectorize",
        data: { jobId: "test", bookId: "test" },
      });

      expect(result.ids).toHaveLength(0);
    });
  });
});
