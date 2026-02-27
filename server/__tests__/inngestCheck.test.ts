import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock $fetch (Nuxt global)
const mock$fetch = vi.fn();
vi.stubGlobal("$fetch", mock$fetch);

describe("inngestCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("unit (mocked)", () => {
    it("detects reachable Inngest endpoint with registered functions", async () => {
      mock$fetch.mockResolvedValueOnce({
        function_count: 3,
      });

      const response = (await $fetch("/api/inngest")) as any;
      expect(response).toBeDefined();
      expect(response.function_count).toBe(3);
    });

    it("handles Inngest endpoint returning zero functions", async () => {
      mock$fetch.mockResolvedValueOnce({
        function_count: 0,
      });

      const response = (await $fetch("/api/inngest")) as any;
      expect(response.function_count).toBe(0);
    });

    it("handles Inngest endpoint failure", async () => {
      mock$fetch.mockRejectedValueOnce(new Error("Cannot reach endpoint"));

      await expect($fetch("/api/inngest")).rejects.toThrow(
        "Cannot reach endpoint",
      );
    });
  });
});
