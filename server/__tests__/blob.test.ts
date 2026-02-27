import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @vercel/blob
vi.mock("@vercel/blob", () => ({
  list: vi.fn(),
}));

// Mock useRuntimeConfig
vi.stubGlobal("useRuntimeConfig", () => ({
  blobToken: "test-blob-token",
}));

import { list } from "@vercel/blob";

const mockedList = vi.mocked(list);

describe("blob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("unit (mocked)", () => {
    it("succeeds when Vercel Blob is accessible", async () => {
      mockedList.mockResolvedValueOnce({
        blobs: [],
        cursor: undefined,
        hasMore: false,
      } as any);

      const result = await list({ token: "test-blob-token" });
      expect(result).toBeDefined();
      expect(mockedList).toHaveBeenCalledWith({ token: "test-blob-token" });
    });

    it("throws an error when Blob token is invalid", async () => {
      mockedList.mockRejectedValueOnce(new Error("Invalid token"));

      await expect(list({ token: "bad-token" })).rejects.toThrow(
        "Invalid token",
      );
    });
  });

  describe("availability", () => {
    it.skipIf(!process.env.BOOKS_BLOB_READ_WRITE_TOKEN)(
      "can connect to real Vercel Blob",
      async () => {
        // This test only runs when real credentials are available
        const { list: realList } =
          await vi.importActual<typeof import("@vercel/blob")>("@vercel/blob");
        const result = await realList({
          token: process.env.BOOKS_BLOB_READ_WRITE_TOKEN!,
        });
        expect(result).toBeDefined();
      },
    );
  });
});
