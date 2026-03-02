import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Локальное хранилище в памяти для имитации работы Redis (In-memory storage for bookStore).
 */
const storageBookData = new Map<string, Record<string, unknown>>();
const storageBookIndex = new Set<string>();
const storageBlobIndex = new Map<string, string>();

/**
 * Объект-имитация (Mock) Redis клиента.
 */
const mockRedisClient = {
  hset: vi.fn(async (key: string, data: Record<string, any>) => {
    if (key === "smart-book-search:books:blob-index") {
      for (const [k, v] of Object.entries(data)) storageBlobIndex.set(k, String(v));
    } else {
      storageBookData.set(key, { ...(storageBookData.get(key) || {}), ...data });
    }
  }),
  hgetall: vi.fn(async (key: string) => storageBookData.get(key) || {}),
  hget: vi.fn(async (key: string, field: string) => {
    if (key === "smart-book-search:books:blob-index") {
      return storageBlobIndex.get(field) || null;
    }
    const data = storageBookData.get(key);
    return data ? (data[field] as string) : null;
  }),
  sadd: vi.fn(async (_key: string, ...members: string[]) => {
    for (const member of members) storageBookIndex.add(member);
  }),
  smembers: vi.fn(async () => [...storageBookIndex]),
  srem: vi.fn(async (_key: string, ...members: string[]) => {
    for (const member of members) storageBookIndex.delete(member);
  }),
  hdel: vi.fn(async (key: string, ...fields: string[]) => {
    if (key === "smart-book-search:books:blob-index") {
      for (const field of fields) storageBlobIndex.delete(field);
    }
  }),
  del: vi.fn(async (key: string) => {
    storageBookData.delete(key);
  }),
  pipeline: vi.fn(() => {
    const operations: Array<() => void> = [];
    const hgetallTargetKeys: string[] = [];
    const pipelineInstance = {
      hset: vi.fn((key: string, data: Record<string, any>) => {
        operations.push(() => {
          if (key === "smart-book-search:books:blob-index") {
            for (const [k, v] of Object.entries(data))
              storageBlobIndex.set(k, String(v));
          } else {
            storageBookData.set(key, { ...(storageBookData.get(key) || {}), ...data });
          }
        });
        return pipelineInstance;
      }),
      sadd: vi.fn((_key: string, ...members: string[]) => {
        operations.push(() => {
          for (const member of members) storageBookIndex.add(member);
        });
        return pipelineInstance;
      }),
      srem: vi.fn((_key: string, ...members: string[]) => {
        operations.push(() => {
          for (const member of members) storageBookIndex.delete(member);
        });
        return pipelineInstance;
      }),
      del: vi.fn((key: string) => {
        operations.push(() => {
          storageBookData.delete(key);
        });
        return pipelineInstance;
      }),
      hdel: vi.fn((key: string, ...fields: string[]) => {
        operations.push(() => {
          if (key === "smart-book-search:books:blob-index")
            for (const field of fields) storageBlobIndex.delete(field);
        });
        return pipelineInstance;
      }),
      hgetall: vi.fn((key: string) => {
        hgetallTargetKeys.push(key);
        return pipelineInstance;
      }),
      exec: vi.fn(async () => {
        for (const op of operations) op();
        if (hgetallTargetKeys.length > 0) {
          return hgetallTargetKeys.map((k) => storageBookData.get(k) || null);
        }
        return [];
      }),
    };
    return pipelineInstance;
  }),
};

// Мокаем утилиту получения Redis клиента
vi.mock("../utils/redis", () => ({
  getRedisClient: vi.fn(() => mockRedisClient),
}));

// Настройка конфигурации Nuxt
vi.stubGlobal("useRuntimeConfig", () => ({
  upstashRedisUrl: "https://test.upstash.io",
  upstashRedisToken: "test-token",
}));

import {
  slugifyBookId,
  addBook,
  getBook,
  getAllBooks,
  updateBook,
  deleteBook,
  markBookVectorized,
  getBookByBlobUrl,
  type BookRecord,
} from "../utils/bookStore";

/**
 * Вспомогательная функция для создания объекта книги с возможностью переопределения полей.
 */
function createMockBook(overrides: Partial<BookRecord> = {}): BookRecord {
  return {
    id: "test-book-id-1",
    userId: "test-user-id-1",
    title: "Тестовое название книги",
    author: "Тестовый автор",
    coverUrl: "https://example.com/cover.jpg",
    blobUrl: "https://example.com/test.txt",
    filename: "test.txt",
    fileSize: 1024,
    uploadedAt: Date.now(),
    vectorized: false,
    ...overrides,
  };
}

describe("Сервис хранилища книг (bookStore)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageBookData.clear();
    storageBookIndex.clear();
    storageBlobIndex.clear();
  });

  // ──────── slugifyBookId ────────
  describe("Функция slugifyBookId", () => {
    it("должна преобразовывать название в URL-совместимый слаг с суффиксом", () => {
      const slug = slugifyBookId("Моя отличная книга! (2024)");
      // Регулярное выражение разрешает латиницу, кириллицу и цифры в слаге
      expect(slug).toMatch(/^[a-z0-9\u0400-\u04FF-]+-[a-z0-9]+$/);
    });

    it("должна корректно обрабатывать простые названия", () => {
      const slug = slugifyBookId("Привет Мир");
      expect(slug).toMatch(/^привет-мир-[a-z0-9]+$/);
    });

    it("должна возвращать UUID при пустой строке", () => {
      const slug = slugifyBookId("");
      expect(slug.length).toBe(36); // Длина UUID
    });
  });

  // ──────── addBook ────────
  describe("Функция addBook", () => {
    it("должна вызывать pipeline Redis с корректными данными", async () => {
      const book = createMockBook();
      await addBook(book);
      expect(mockRedisClient.pipeline).toHaveBeenCalled();
    });

    it("должна сохранять книгу в локальном мок-хранилище", async () => {
      const book = createMockBook();
      await addBook(book);

      expect(storageBookIndex.has(book.id)).toBe(true);
      expect(storageBookData.has(`smart-book-search:books:${book.id}`)).toBe(true);
    });

    it("должна создавать запись в обратном индексе blob-ссылок", async () => {
      const book = createMockBook();
      await addBook(book);

      expect(storageBlobIndex.get(book.blobUrl)).toBe(book.id);
    });
  });

  // ──────── getBook ────────
  describe("Функция getBook", () => {
    it("должна возвращать null для несуществующей книги", async () => {
      const result = await getBook("non-existent-id");
      expect(result).toBeNull();
    });

    it("должна возвращать десериализованную запись после добавления", async () => {
      const book = createMockBook({ vectorized: true });
      await addBook(book);

      const result = await getBook(book.id);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(book.id);
      expect(result!.title).toBe(book.title);
      expect(result!.vectorized).toBe(true);
    });

    it("должна корректно десериализовать vectorized=true (хранится как '1')", async () => {
      const bookId = "vector-true-id";
      storageBookData.set(`smart-book-search:books:${bookId}`, {
        ...createMockBook({ id: bookId }),
        vectorized: "1"
      });
      storageBookIndex.add(bookId);

      const result = await getBook(bookId);
      expect(result!.vectorized).toBe(true);
    });

    it("должна корректно десериализовать vectorized=false (хранится как '0')", async () => {
      const bookId = "vector-false-id";
      storageBookData.set(`smart-book-search:books:${bookId}`, {
        ...createMockBook({ id: bookId }),
        vectorized: "0"
      });
      storageBookIndex.add(bookId);

      const result = await getBook(bookId);
      expect(result!.vectorized).toBe(false);
    });

    it("должна подставлять значения по умолчанию для отсутствующих полей", async () => {
      const bookId = "missing-fields-id";
      storageBookData.set(`smart-book-search:books:${bookId}`, {
        id: bookId,
      });

      const result = await getBook(bookId);
      expect(result).not.toBeNull();
      expect(result!.author).toBe("Unknown");
      expect(result!.fileSize).toBe(0);
      expect(result!.vectorized).toBe(false);
    });
  });

  // ──────── getAllBooks ────────
  describe("Функция getAllBooks", () => {
    it("должна возвращать пустой массив, если книг нет", async () => {
      const books = await getAllBooks();
      expect(books).toEqual([]);
    });

    it("должна возвращать список книг, отсортированный по дате загрузки (сначала новые)", async () => {
      const now = Date.now();
      const oldBook = createMockBook({
        id: "old-book-id",
        uploadedAt: now - 10000,
        blobUrl: "https://blob/old",
      });
      const newBook = createMockBook({
        id: "new-book-id",
        uploadedAt: now,
        blobUrl: "https://blob/new",
      });

      await addBook(oldBook);
      await addBook(newBook);

      const books = await getAllBooks();
      expect(books).toHaveLength(2);
      expect(books[0]!.id).toBe("new-book-id");
      expect(books[1]!.id).toBe("old-book-id");
    });

    it("должна фильтровать null и пустые результаты из pipeline", async () => {
      const realBook = createMockBook({ id: "real-book-id" });
      await addBook(realBook);

      // Добавляем "фантомную" запись в индекс без данных в основном хранилище
      storageBookIndex.add("ghost-book-id");

      const books = await getAllBooks();
      expect(books).toHaveLength(1);
      expect(books[0]!.id).toBe("real-book-id");
    });
  });

  // ──────── updateBook ────────
  describe("Функция updateBook", () => {
    it("должна обновлять конкретные поля существующей книги", async () => {
      const book = createMockBook();
      await addBook(book);

      await updateBook(book.id, { title: "Обновленное название" });

      const result = await getBook(book.id);
      expect(result!.title).toBe("Обновленное название");
    });

    it("должен обновлять blobUrl и пересоздавать обратный индекс", async () => {
      const oldUrl = "https://old-blob.com/file";
      const newUrl = "https://new-blob.com/file";
      const book = createMockBook({ blobUrl: oldUrl });
      await addBook(book);

      await updateBook(book.id, { blobUrl: newUrl });

      expect(storageBlobIndex.has(oldUrl)).toBe(false);
      expect(storageBlobIndex.get(newUrl)).toBe(book.id);
      
      const result = await getBook(book.id);
      expect(result!.blobUrl).toBe(newUrl);
    });

    it("должна выбрасывать ошибку, если книга не найдена", async () => {
      await expect(
        updateBook("non-existent-id", { title: "Ошибка" }),
      ).rejects.toThrow('Book "non-existent-id" not found in store.');
    });

    it("должна корректно обновлять флаг векторизации", async () => {
      const book = createMockBook({ vectorized: false });
      await addBook(book);

      await updateBook(book.id, { vectorized: true });

      const result = await getBook(book.id);
      expect(result!.vectorized).toBe(true);
    });

    it("должна обновлять blobUrl и пересоздавать обратный индекс", async () => {
      const oldUrl = "https://old-blob.com/file";
      const newUrl = "https://new-blob.com/file";
      const book = createMockBook({ blobUrl: oldUrl });
      await addBook(book);

      await updateBook(book.id, { blobUrl: newUrl });

      expect(storageBlobIndex.has(oldUrl)).toBe(false);
      expect(storageBlobIndex.get(newUrl)).toBe(book.id);
    });

    it("не должна вызывать hset, если список полей для обновления пуст", async () => {
      const book = createMockBook();
      await addBook(book);
      vi.clearAllMocks();

      await updateBook(book.id, {});

      expect(mockRedisClient.hset).not.toHaveBeenCalled();
    });
  });

  // ──────── deleteBook ────────
  describe("Функция deleteBook", () => {
    it("должна удалять книгу, индексную запись и blob-индекс через pipeline", async () => {
      const book = createMockBook();
      await addBook(book);

      await deleteBook(book.id);

      const result = await getBook(book.id);
      expect(result).toBeNull();
      expect(storageBookIndex.has(book.id)).toBe(false);
      expect(storageBlobIndex.has(book.blobUrl)).toBe(false);
    });

    it("должна завершаться без ошибок, если книга не существует", async () => {
      await expect(deleteBook("non-existent-id")).resolves.toBeUndefined();
    });
  });

  // ──────── markBookVectorized ────────
  describe("Функция markBookVectorized", () => {
    it("должна устанавливать флаг векторизации в true", async () => {
      const book = createMockBook({ vectorized: false });
      await addBook(book);

      await markBookVectorized(book.id);

      const result = await getBook(book.id);
      expect(result!.vectorized).toBe(true);
    });
  });

  // ──────── getBookByBlobUrl ────────
  describe("Функция getBookByBlobUrl", () => {
    it("должна находить книгу по её blobUrl", async () => {
      const book = createMockBook();
      await addBook(book);

      const result = await getBookByBlobUrl(book.blobUrl);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(book.id);
    });

    it("должна возвращать null для неизвестного blobUrl", async () => {
      const result = await getBookByBlobUrl("https://unknown.com/file");
      expect(result).toBeNull();
    });
  });
});
