import { describe, it, expect, vi, beforeEach } from "vitest";

// Имитация библиотеки @vercel/blob
vi.mock("@vercel/blob", () => ({
  list: vi.fn(),
}));

// Имитация конфигурации Nuxt
vi.stubGlobal("useRuntimeConfig", () => ({
  blobToken: "test-blob-token",
}));

import { list } from "@vercel/blob";

const mockedBlobList = vi.mocked(list);

describe("Тестирование хранилища Vercel Blob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Юнит-тесты (имитация/mocked)", () => {
    it("должен успешно работать, когда хранилище Vercel Blob доступно", async () => {
      mockedBlobList.mockResolvedValueOnce({
        blobs: [],
        cursor: undefined,
        hasMore: false,
      } as any);

      const result = await list({ token: "test-blob-token" });
      expect(result).toBeDefined();
      expect(mockedBlobList).toHaveBeenCalledWith({ token: "test-blob-token" });
    });

    it("должен выбрасывать ошибку при неверном токене", async () => {
      mockedBlobList.mockRejectedValueOnce(new Error("Неверный токен (Invalid token)"));

      await expect(list({ token: "bad-token" })).rejects.toThrow(
        "Неверный токен (Invalid token)",
      );
    });
  });

  describe("Проверка доступности (Availability)", () => {
    // Тест пропускается, если нет реальных учетных данных в окружении
    it.skipIf(!process.env.BOOKS_BLOB_READ_WRITE_TOKEN)(
      "должен подключаться к реальному Vercel Blob хранилищу",
      async () => {
        const { list: realBlobList } =
          await vi.importActual<typeof import("@vercel/blob")>("@vercel/blob");
        
        const result = await realBlobList({
          token: process.env.BOOKS_BLOB_READ_WRITE_TOKEN!,
        });
        
        expect(result).toBeDefined();
      },
    );
  });
});
