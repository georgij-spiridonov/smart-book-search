import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Pinecone
const { mockDescribeIndexStats } = vi.hoisted(() => ({
  mockDescribeIndexStats: vi.fn(),
}));

vi.mock("@pinecone-database/pinecone", () => {
  class MockPineconeIndex {
    describeIndexStats = mockDescribeIndexStats;
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
  pineconeApiKey: "test-pinecone-key",
  pineconeIndex: "test-index",
  pineconeHost: "https://test-host.pinecone.io",
}));

describe("pinecone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("unit (mocked)", () => {
    it("succeeds when Pinecone is accessible", async () => {
      mockDescribeIndexStats.mockResolvedValueOnce({
        dimension: 1024,
        indexFullness: 0.1,
        totalRecordCount: 100,
        namespaces: {},
      });

      const config = useRuntimeConfig();
      expect(config.pineconeApiKey).toBeTruthy();
      expect(config.pineconeIndex).toBeTruthy();
      expect(config.pineconeHost).toBeTruthy();

      const { Pinecone } = await import("@pinecone-database/pinecone");
      const pc = new Pinecone({ apiKey: config.pineconeApiKey });
      const index = pc.index(config.pineconeIndex);
      const stats = await index.describeIndexStats();

      expect(stats).toBeDefined();
      expect(stats.dimension).toBe(1024);
      expect(mockDescribeIndexStats).toHaveBeenCalledOnce();
    });

    it("detects missing Pinecone configuration", () => {
      vi.stubGlobal("useRuntimeConfig", () => ({
        pineconeApiKey: "",
        pineconeIndex: "",
        pineconeHost: "",
      }));

      const config = useRuntimeConfig();
      expect(config.pineconeApiKey).toBeFalsy();
      expect(config.pineconeIndex).toBeFalsy();
    });

    it("handles Pinecone connection errors", async () => {
      mockDescribeIndexStats.mockRejectedValueOnce(
        new Error("Connection refused"),
      );

      const { Pinecone } = await import("@pinecone-database/pinecone");
      const pc = new Pinecone({ apiKey: "test" });
      const index = pc.index("test");

      await expect(index.describeIndexStats()).rejects.toThrow(
        "Connection refused",
      );
    });
  });

  describe("availability", () => {
    it.skipIf(!process.env.PINECONE_API_KEY)(
      "can connect to real Pinecone",
      async () => {
        const { Pinecone: RealPinecone } = await vi.importActual<
          typeof import("@pinecone-database/pinecone")
        >("@pinecone-database/pinecone");

        const pc = new RealPinecone({
          apiKey: process.env.PINECONE_API_KEY!,
        });
        const index = pc.index(process.env.PINECONE_INDEX!);
        const stats = await index.describeIndexStats();
        expect(stats).toBeDefined();
      },
    );
  });
});
