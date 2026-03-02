import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Глобальные имитации (Mocks) для Redis клиента.
 * Используем vi.hoisted для обеспечения доступности моков до импорта модулей.
 */
const { mockedGetRedisClient } = vi.hoisted(() => {
  const redisMethodsMock = {
    hget: vi.fn(),
    hset: vi.fn(),
    sismember: vi.fn(),
    sadd: vi.fn(),
    hdel: vi.fn(),
    srem: vi.fn(),
    hgetall: vi.fn(),
  };

  return {
    mockedGetRedisClient: vi.fn(() => redisMethodsMock),
  };
});

vi.mock("../utils/redis", () => ({
  getRedisClient: mockedGetRedisClient,
}));

vi.mock("../utils/logger", () => ({
  log: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import {
  getFileHash,
  getExistingBlobUrl,
  markFileAsUploaded,
  isFileVectorized,
  markFileAsVectorized,
  deleteHashesByBlobUrl,
} from "../utils/hashStore";

describe("Хранилище хэшей файлов (hashStore / redisStores)", () => {
  let redisClientInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();
    redisClientInstance = mockedGetRedisClient();
  });

  describe("Функция getFileHash", () => {
    it("должна генерировать валидную строку SHA-256 в формате hex", () => {
      const contentBuffer = Buffer.from("test content");
      const generatedHash = getFileHash(contentBuffer);
      
      // SHA-256 хэш для строки "test content"
      expect(generatedHash).toBe(
        "6ae8a75555209fd6c44157c0aed8016e763ff435a19cf186f76863140143ff72",
      );
    });
  });

  describe("Функция getExistingBlobUrl", () => {
    it("должна возвращать ссылку на blob, если она существует в Redis", async () => {
      const expectedUrl = "https://blob.test/book.pdf";
      redisClientInstance.hget.mockResolvedValueOnce(expectedUrl);
      
      const resultUrl = await getExistingBlobUrl("test-file-hash");
      
      expect(redisClientInstance.hget).toHaveBeenCalledWith(
        "smart-book-search:blobs",
        "test-file-hash",
      );
      expect(resultUrl).toBe(expectedUrl);
    });

    it("должна возвращать undefined, если хэш не найден", async () => {
      redisClientInstance.hget.mockResolvedValueOnce(null);
      const resultUrl = await getExistingBlobUrl("unknown-hash");
      expect(resultUrl).toBeUndefined();
    });
  });

  describe("Функция markFileAsUploaded", () => {
    it("должна сохранять соответствие хэша и ссылки на blob в Redis", async () => {
      redisClientInstance.hset.mockResolvedValueOnce(1);
      
      await markFileAsUploaded("new-hash", "https://blob.test/new-book.pdf");
      
      expect(redisClientInstance.hset).toHaveBeenCalledWith("smart-book-search:blobs", {
        "new-hash": "https://blob.test/new-book.pdf",
      });
    });
  });

  describe("Функция isFileVectorized", () => {
    it("должна возвращать true, если хэш присутствует в наборе векторизованных файлов", async () => {
      redisClientInstance.sismember.mockResolvedValueOnce(1);
      
      const isVectorized = await isFileVectorized("hash-123");
      
      expect(redisClientInstance.sismember).toHaveBeenCalledWith(
        "smart-book-search:vectorized",
        "hash-123",
      );
      expect(isVectorized).toBe(true);
    });

    it("должна возвращать false, если хэш отсутствует в наборе", async () => {
      redisClientInstance.sismember.mockResolvedValueOnce(0);
      const isVectorized = await isFileVectorized("hash-456");
      expect(isVectorized).toBe(false);
    });
  });

  describe("Функция markFileAsVectorized", () => {
    it("должна добавлять хэш в набор векторизованных файлов в Redis", async () => {
      redisClientInstance.sadd.mockResolvedValueOnce(1);
      
      await markFileAsVectorized("hash-to-vectorize");
      
      expect(redisClientInstance.sadd).toHaveBeenCalledWith(
        "smart-book-search:vectorized",
        "hash-to-vectorize",
      );
    });
  });

  describe("Функция deleteHashesByBlobUrl", () => {
    it("должна находить и удалять хэши, соответствующие указанной ссылке на blob", async () => {
      // Имитируем поиск хэша по URL через hgetall
      redisClientInstance.hgetall.mockResolvedValueOnce({
        "hash-to-delete": "https://blob.test/target",
        "other-hash": "https://blob.test/other",
      });
      redisClientInstance.hdel.mockResolvedValueOnce(1);
      redisClientInstance.srem.mockResolvedValueOnce(1);

      await deleteHashesByBlobUrl("https://blob.test/target");

      // Проверяем удаление хэша из обеих структур данных Redis
      expect(redisClientInstance.hdel).toHaveBeenCalledWith(
        "smart-book-search:blobs",
        "hash-to-delete",
      );
      expect(redisClientInstance.srem).toHaveBeenCalledWith(
        "smart-book-search:vectorized",
        "hash-to-delete",
      );
    });

    it("должна завершаться без ошибок, если в Redis нет записей о хэшах", async () => {
      redisClientInstance.hgetall.mockResolvedValueOnce(null);
      
      await expect(deleteHashesByBlobUrl("https://any.url")).resolves.toBeUndefined();
      expect(redisClientInstance.hdel).not.toHaveBeenCalled();
    });
  });
});
