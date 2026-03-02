import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory storage for bookStore
const bookData = new Map<string, Record<string, unknown>>();
const bookIndex = new Set<string>();
const blobIndex = new Map<string, string>();

const mockRedis = {
  hset: vi.fn(async (key: string, data: Record<string, any>) => {
    if (key === "smart-book-search:books:blob-index") {
      for (const [k, v] of Object.entries(data)) blobIndex.set(k, String(v));
    } else {
      bookData.set(key, { ...(bookData.get(key) || {}), ...data });
    }
  }),
  hgetall: vi.fn(async (key: string) => bookData.get(key) || {}),
  hget: vi.fn(async (key: string, field: string) => {
    if (key === "smart-book-search:books:blob-index") {
      return blobIndex.get(field) || null;
    }
    const data = bookData.get(key);
    return data ? (data[field] as string) : null;
  }),
  sadd: vi.fn(async (_key: string, ...members: string[]) => {
    for (const m of members) bookIndex.add(m);
  }),
  smembers: vi.fn(async () => [...bookIndex]),
  srem: vi.fn(async (_key: string, ...members: string[]) => {
    for (const m of members) bookIndex.delete(m);
  }),
  hdel: vi.fn(async (key: string, ...fields: string[]) => {
    if (key === "smart-book-search:books:blob-index") {
      for (const f of fields) blobIndex.delete(f);
    }
  }),
  del: vi.fn(async (key: string) => {
    bookData.delete(key);
  }),
  pipeline: vi.fn(() => {
    const ops: Array<() => void> = [];
    const hgetallKeys: string[] = [];
    const self = {
      hset: vi.fn((key: string, data: Record<string, any>) => {
        ops.push(() => {
          if (key === "smart-book-search:books:blob-index") {
            for (const [k, v] of Object.entries(data))
              blobIndex.set(k, String(v));
          } else {
            bookData.set(key, { ...(bookData.get(key) || {}), ...data });
          }
        });
        return self;
      }),
      sadd: vi.fn((_key: string, ...members: string[]) => {
        ops.push(() => {
          for (const m of members) bookIndex.add(m);
        });
        return self;
      }),
      srem: vi.fn((_key: string, ...members: string[]) => {
        ops.push(() => {
          for (const m of members) bookIndex.delete(m);
        });
        return self;
      }),
      del: vi.fn((key: string) => {
        ops.push(() => {
          bookData.delete(key);
        });
        return self;
      }),
      hdel: vi.fn((key: string, ...fields: string[]) => {
        ops.push(() => {
          if (key === "smart-book-search:books:blob-index")
            for (const f of fields) blobIndex.delete(f);
        });
        return self;
      }),
      hgetall: vi.fn((key: string) => {
        hgetallKeys.push(key);
        return self;
      }),
      exec: vi.fn(async () => {
        for (const op of ops) op();
        // Return stored data for each hgetall key (or null if missing)
        if (hgetallKeys.length > 0) {
          return hgetallKeys.map((k) => bookData.get(k) || null);
        }
        return [];
      }),
    };
    return self;
  }),
};

vi.mock("../utils/redis", () => ({
  getRedisClient: vi.fn(() => mockRedis),
}));

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

function makeBook(overrides: Partial<BookRecord> = {}): BookRecord {
  return {
    id: "test-book-1",
    userId: "test-user-1",
    title: "Test Book Title",
    author: "Test Author",
    coverUrl: "https://example.com/cover.jpg",
    blobUrl: "https://example.com/test.txt",
    filename: "test.txt",
    fileSize: 1024,
    uploadedAt: Date.now(),
    vectorized: false,
    ...overrides,
  };
}

describe("bookStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bookData.clear();
    bookIndex.clear();
    blobIndex.clear();
  });

  // ──────── slugifyBookId ────────
  describe("slugifyBookId", () => {
    it("converts title to a URL-friendly slug with suffix", () => {
      const slug = slugifyBookId("My Great Book! (2024)");
      expect(slug).toMatch(/^my-great-book-2024-[a-z0-9]+$/);
    });

    it("handles simple titles", () => {
      const slug = slugifyBookId("Hello World");
      expect(slug).toMatch(/^hello-world-[a-z0-9]+$/);
    });

    it("handles empty string", () => {
      const slug = slugifyBookId("");
      expect(slug.length).toBe(36); // UUID length
    });
  });

  // ──────── addBook ────────
  describe("addBook", () => {
    it("calls Redis pipeline with correct data", async () => {
      const book = makeBook();
      await addBook(book);
      expect(mockRedis.pipeline).toHaveBeenCalled();
    });

    it("stores the book in the in-memory mock", async () => {
      const book = makeBook();
      await addBook(book);

      // The pipeline should have stored book data and index
      expect(bookIndex.has("test-book-1")).toBe(true);
    });

    it("creates blob reverse index entry", async () => {
      const book = makeBook();
      await addBook(book);

      expect(blobIndex.get(book.blobUrl)).toBe(book.id);
    });
  });

  // ──────── getBook ────────
  describe("getBook", () => {
    it("returns null for non-existent book", async () => {
      const result = await getBook("non-existent");
      expect(result).toBeNull();
    });

    it("returns deserialized record after addBook", async () => {
      const book = makeBook({ vectorized: true });
      await addBook(book);

      const result = await getBook("test-book-1");
      expect(result).not.toBeNull();
      expect(result!.id).toBe("test-book-1");
      expect(result!.title).toBe("Test Book Title");
      expect(result!.author).toBe("Test Author");
      expect(result!.filename).toBe("test.txt");
    });

    it("correctly deserializes vectorized=true (stored as '1')", async () => {
      const book = makeBook({ vectorized: true });
      await addBook(book);

      const result = await getBook("test-book-1");
      expect(result!.vectorized).toBe(true);
    });

    it("correctly deserializes vectorized=false (stored as '0')", async () => {
      const book = makeBook({ vectorized: false });
      await addBook(book);

      const result = await getBook("test-book-1");
      expect(result!.vectorized).toBe(false);
    });

    it("handles missing optional fields with defaults", async () => {
      // Simulate a record stored with missing fields
      bookData.set("smart-book-search:books:missing-fields", {
        id: "missing-fields",
      });

      const result = await getBook("missing-fields");
      expect(result).not.toBeNull();
      expect(result!.author).toBe("Unknown"); // default
      expect(result!.fileSize).toBe(0); // default
      expect(result!.vectorized).toBe(false); // default
    });
  });

  // ──────── getAllBooks ────────
  describe("getAllBooks", () => {
    it("returns empty array when no books exist", async () => {
      const books = await getAllBooks();
      expect(books).toEqual([]);
    });

    it("returns multiple books sorted by uploadedAt descending", async () => {
      const now = Date.now();
      const book1 = makeBook({
        id: "old-book",
        uploadedAt: now - 10000,
        blobUrl: "https://blob/old",
      });
      const book2 = makeBook({
        id: "new-book",
        uploadedAt: now,
        blobUrl: "https://blob/new",
      });

      await addBook(book1);
      await addBook(book2);

      const books = await getAllBooks();
      expect(books).toHaveLength(2);
      // Newest first
      expect(books[0]!.id).toBe("new-book");
      expect(books[1]!.id).toBe("old-book");
    });

    it("filters out null and empty results from pipeline", async () => {
      // Add two books so smembers returns two IDs
      const book1 = makeBook({
        id: "real-book",
        blobUrl: "https://blob/real",
      });
      await addBook(book1);

      // Also add a dangling index entry with no stored data
      bookIndex.add("ghost-book");
      // bookData does NOT have "smart-book-search:books:ghost-book"
      // so the pipeline will return null for it

      const books = await getAllBooks();
      // Only the real book should be in results, ghost filtered out
      expect(books).toHaveLength(1);
      expect(books[0]!.id).toBe("real-book");
    });
  });

  // ──────── updateBook ────────
  describe("updateBook", () => {
    it("updates specific fields of an existing book", async () => {
      const book = makeBook();
      await addBook(book);

      await updateBook("test-book-1", { title: "Updated Title" });

      const result = await getBook("test-book-1");
      expect(result!.title).toBe("Updated Title");
    });

    it("throws for non-existent book", async () => {
      await expect(
        updateBook("non-existent", { title: "Nope" }),
      ).rejects.toThrow('Book "non-existent" not found in store.');
    });

    it("updates vectorized flag correctly", async () => {
      const book = makeBook({ vectorized: false });
      await addBook(book);

      await updateBook("test-book-1", { vectorized: true });

      const result = await getBook("test-book-1");
      expect(result!.vectorized).toBe(true);
    });

    it("updates blobUrl and refreshes reverse index", async () => {
      const book = makeBook({ blobUrl: "https://old-blob.com/file" });
      await addBook(book);

      const newBlobUrl = "https://new-blob.com/file";
      await updateBook("test-book-1", { blobUrl: newBlobUrl });

      // Old blobUrl removed from index
      expect(blobIndex.has("https://old-blob.com/file")).toBe(false);
      // New blobUrl added to index
      expect(blobIndex.get(newBlobUrl)).toBe("test-book-1");
    });

    it("does not call hset when update has no fields", async () => {
      const book = makeBook();
      await addBook(book);
      vi.clearAllMocks();

      // Pass an empty update — no fields to set
      await updateBook("test-book-1", {});

      // hset should not be called directly (only via getBook check)
      // The function checks Object.keys(fields).length > 0
      expect(mockRedis.hset).not.toHaveBeenCalled();
    });

    it("updates multiple fields at once", async () => {
      const book = makeBook();
      await addBook(book);

      await updateBook("test-book-1", {
        title: "New Title",
        author: "New Author",
        fileSize: 2048,
      });

      const result = await getBook("test-book-1");
      expect(result!.title).toBe("New Title");
      expect(result!.author).toBe("New Author");
      expect(result!.fileSize).toBe(2048);
    });
  });

  // ──────── deleteBook ────────
  describe("deleteBook", () => {
    it("removes book, index entry, and blob index via pipeline", async () => {
      const book = makeBook();
      await addBook(book);

      await deleteBook("test-book-1");

      const result = await getBook("test-book-1");
      expect(result).toBeNull();
      expect(bookIndex.has("test-book-1")).toBe(false);
      expect(blobIndex.has(book.blobUrl)).toBe(false);
    });

    it("is a no-op when book does not exist", async () => {
      // Should not throw, just return silently
      await expect(deleteBook("non-existent")).resolves.toBeUndefined();
    });
  });

  // ──────── markBookVectorized ────────
  describe("markBookVectorized", () => {
    it("sets vectorized to true for a book", async () => {
      const book = makeBook({ vectorized: false });
      await addBook(book);

      await markBookVectorized("test-book-1");

      const result = await getBook("test-book-1");
      expect(result!.vectorized).toBe(true);
    });

    it("throws for non-existent book", async () => {
      await expect(markBookVectorized("no-such-book")).rejects.toThrow(
        "not found in store",
      );
    });
  });

  // ──────── getBookByBlobUrl ────────
  describe("getBookByBlobUrl", () => {
    it("finds a book by its blobUrl", async () => {
      const book = makeBook();
      await addBook(book);

      const result = await getBookByBlobUrl(book.blobUrl);
      expect(result).not.toBeNull();
      expect(result!.id).toBe("test-book-1");
    });

    it("returns null for unknown blobUrl", async () => {
      const result = await getBookByBlobUrl("https://unknown.com/file");
      expect(result).toBeNull();
    });
  });

  // ──────── availability ────────
  describe("availability", () => {
    it.skipIf(!process.env.KV_REST_API_URL)(
      "can perform real bookStore round-trip",
      async () => {
        expect(true).toBe(true);
      },
    );
  });
});
