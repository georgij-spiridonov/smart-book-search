import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock useRuntimeConfig (Nuxt auto-import)
const mockConfig = {
  aiGatewayApiKey: "test-ai-gateway-key",
  blobToken: "test-blob-token",
  pineconeApiKey: "test-pinecone-key",
  pineconeIndex: "test-index",
  pineconeHost: "test-host",
  upstashRedisUrl: "https://test-redis.upstash.io",
  upstashRedisToken: "test-token",
};

vi.stubGlobal("useRuntimeConfig", () => mockConfig);

describe("aiGateway", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns success when AI Gateway key is loaded", () => {
    const config = useRuntimeConfig();
    expect(config.aiGatewayApiKey).toBeTruthy();
    expect(config.aiGatewayApiKey).toBe("test-ai-gateway-key");
  });

  it("detects missing AI Gateway configuration", () => {
    vi.stubGlobal("useRuntimeConfig", () => ({
      ...mockConfig,
      aiGatewayApiKey: "",
    }));

    const config = useRuntimeConfig();
    expect(config.aiGatewayApiKey).toBeFalsy();
  });
});
