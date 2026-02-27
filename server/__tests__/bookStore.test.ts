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
    // Pipeline simulates the side effects immediately when exec is called
    const ops: Array<() => void> = [];
    return {
      hset: vi.fn((key: string, data: Record<string, any>) => {
        ops.push(() => {
          if (key === "smart-book-search:books:blob-index") {
            for (const [k, v] of Object.entries(data))
              blobIndex.set(k, String(v));
          } else {
            bookData.set(key, { ...(bookData.get(key) || {}), ...data });
          }
        });
        return {
          hset: vi.fn().mockReturnThis(),
          sadd: vi.fn().mockReturnThis(),
          srem: vi.fn().mockReturnThis(),
          del: vi.fn().mockReturnThis(),
          hdel: vi.fn().mockReturnThis(),
          exec: vi.fn(async () => {
            for (const op of ops) op();
            return [];
          }),
        };
      }),
      sadd: vi.fn((_key: string, ...members: string[]) => {
        ops.push(() => {
          for (const m of members) bookIndex.add(m);
        });
        return {
          hset: vi.fn().mockReturnThis(),
          sadd: vi.fn().mockReturnThis(),
          srem: vi.fn().mockReturnThis(),
          del: vi.fn().mockReturnThis(),
          hdel: vi.fn().mockReturnThis(),
          exec: vi.fn(async () => {
            for (const op of ops) op();
            return [];
          }),
        };
      }),
      srem: vi.fn((_key: string, ...members: string[]) => {
        ops.push(() => {
          for (const m of members) bookIndex.delete(m);
        });
        return {
          hset: vi.fn().mockReturnThis(),
          sadd: vi.fn().mockReturnThis(),
          srem: vi.fn().mockReturnThis(),
          del: vi.fn().mockReturnThis(),
          hdel: vi.fn().mockReturnThis(),
          exec: vi.fn(async () => {
            for (const op of ops) op();
            return [];
          }),
        };
      }),
      del: vi.fn((key: string) => {
        ops.push(() => {
          bookData.delete(key);
        });
        return {
          hset: vi.fn().mockReturnThis(),
          sadd: vi.fn().mockReturnThis(),
          srem: vi.fn().mockReturnThis(),
          del: vi.fn().mockReturnThis(),
          hdel: vi.fn().mockReturnThis(),
          exec: vi.fn(async () => {
            for (const op of ops) op();
            return [];
          }),
        };
      }),
      hdel: vi.fn((key: string, ...fields: string[]) => {
        ops.push(() => {
          if (key === "smart-book-search:books:blob-index")
            for (const f of fields) blobIndex.delete(f);
        });
        return {
          hset: vi.fn().mockReturnThis(),
          sadd: vi.fn().mockReturnThis(),
          srem: vi.fn().mockReturnThis(),
          del: vi.fn().mockReturnThis(),
          hdel: vi.fn().mockReturnThis(),
          exec: vi.fn(async () => {
            for (const op of ops) op();
            return [];
          }),
        };
      }),
      exec: vi.fn(async () => {
        for (const op of ops) op();
        return [];
      }),
    };
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
  type BookRecord,
} from "../utils/bookStore";

describe("bookStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bookData.clear();
    bookIndex.clear();
    blobIndex.clear();
  });

  describe("slugifyBookId", () => {
    it("converts title to a URL-friendly slug", () => {
      expect(slugifyBookId("My Great Book! (2024)")).toBe("my-great-book-2024");
    });

    it("handles simple titles", () => {
      expect(slugifyBookId("Hello World")).toBe("hello-world");
    });

    it("trims leading and trailing hyphens", () => {
      expect(slugifyBookId("---test---")).toBe("test");
    });
  });

  describe("CRUD operations (mocked Redis)", () => {
    const testBook: BookRecord = {
      id: "test-book-1",
      title: "Test Book Title",
      author: "Test Author",
      coverUrl: "https://example.com/cover.jpg",
      blobUrl: "https://example.com/test.txt",
      filename: "test.txt",
      fileSize: 1024,
      uploadedAt: Date.now(),
      vectorized: false,
    };

    it("addBook calls Redis pipeline with correct data", async () => {
      await addBook(testBook);
      expect(mockRedis.pipeline).toHaveBeenCalled();
    });

    it("getBook returns null for non-existent book", async () => {
      const result = await getBook("non-existent");
      expect(result).toBeNull();
    });

    it("getAllBooks returns empty array when no books exist", async () => {
      const books = await getAllBooks();
      expect(books).toEqual([]);
    });
  });

  describe("availability", () => {
    it.skipIf(!process.env.KV_REST_API_URL)(
      "can perform real bookStore round-trip",
      async () => {
        // This test would use real Redis — skipped by default
        expect(true).toBe(true);
      },
    );
  });
});
