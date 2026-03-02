import { getRedisClient } from "./redis";
import { log } from "./logger";

/**
 * Book metadata store backed by Upstash Redis.
 *
 * Each book is stored as a Redis hash at key `books:{id}`.
 * A Redis set `books:index` keeps track of all book IDs for listing.
 *
 * This is production-ready: data persists across deployments
 * and serverless cold starts.
 */

export interface BookRecord {
  id: string;
  userId: string;
  title: string;
  author: string;
  coverUrl: string;
  blobUrl: string;
  filename: string;
  fileSize: number;
  uploadedAt: number;
  vectorized: boolean;
}

const BOOKS_INDEX_KEY = "smart-book-search:books:index";
const BOOK_KEY_PREFIX = "smart-book-search:books:";
const BLOB_INDEX_KEY = "smart-book-search:books:blob-index";

function bookKey(id: string): string {
  return `${BOOK_KEY_PREFIX}${id}`;
}

/**
 * Serialize a BookRecord into a flat string-valued object for Redis HSET.
 */
function serialize(
  record: BookRecord,
): Record<string, string | number | boolean> {
  return {
    id: record.id,
    userId: record.userId,
    title: record.title,
    author: record.author,
    coverUrl: record.coverUrl,
    blobUrl: record.blobUrl,
    filename: record.filename,
    fileSize: record.fileSize,
    uploadedAt: record.uploadedAt,
    vectorized: record.vectorized ? "1" : "0",
  };
}

/**
 * Deserialize a Redis hash response back into a BookRecord.
 */
function deserialize(data: Record<string, unknown>): BookRecord {
  return {
    id: String(data.id ?? ""),
    userId: String(data.userId ?? "legacy"),
    title: String(data.title ?? ""),
    author: String(data.author ?? "Unknown"),
    coverUrl: String(data.coverUrl ?? ""),
    blobUrl: String(data.blobUrl ?? ""),
    filename: String(data.filename ?? ""),
    fileSize: Number(data.fileSize ?? 0),
    uploadedAt: Number(data.uploadedAt ?? 0),
    vectorized: String(data.vectorized) === "1" || data.vectorized === true,
  };
}

/**
 * Add a new book record to the store.
 */
export async function addBook(record: BookRecord): Promise<void> {
  const redis = getRedisClient();
  const key = bookKey(record.id);

  // Use pipeline for atomic-like consistency
  const pipeline = redis.pipeline();
  pipeline.hset(key, serialize(record));
  pipeline.sadd(BOOKS_INDEX_KEY, record.id);
  // Add reverse index for O(1) lookups by blobUrl
  pipeline.hset(BLOB_INDEX_KEY, { [record.blobUrl]: record.id });
  await pipeline.exec();

  log.info("book-store", "Added new book record", { bookId: record.id });
}

/**
 * Get a single book record by ID. Returns null if not found.
 */
export async function getBook(id: string): Promise<BookRecord | null> {
  const redis = getRedisClient();
  const data = await redis.hgetall<Record<string, unknown>>(bookKey(id));

  if (!data || Object.keys(data).length === 0) {
    return null;
  }

  return deserialize(data);
}

/**
 * Get all book records from the store.
 */
export async function getAllBooks(): Promise<BookRecord[]> {
  const redis = getRedisClient();
  const ids = await redis.smembers<string[]>(BOOKS_INDEX_KEY);

  if (!ids || ids.length === 0) {
    return [];
  }

  // Use pipeline to fetch all books in a single round-trip
  const pipeline = redis.pipeline();
  for (const id of ids) {
    pipeline.hgetall(bookKey(id));
  }

  const results = await pipeline.exec<(Record<string, unknown> | null)[]>();

  const books: BookRecord[] = [];
  for (const data of results) {
    if (data && typeof data === "object" && Object.keys(data).length > 0) {
      books.push(deserialize(data));
    }
  }

  // Sort by uploadedAt descending (newest first)
  books.sort((a, b) => b.uploadedAt - a.uploadedAt);

  return books;
}

/**
 * Update specific fields of a book record.
 */
export async function updateBook(
  id: string,
  update: Partial<Omit<BookRecord, "id">>,
): Promise<void> {
  const redis = getRedisClient();
  const key = bookKey(id);

  // Check if book exists and get current data for index management
  const current = await getBook(id);
  if (!current) {
    log.error("book-store", "Cannot update: Book not found", { bookId: id });
    throw new Error(`Book "${id}" not found in store.`);
  }

  const fields: Record<string, string | number | boolean> = {};
  if (update.title !== undefined) fields.title = update.title;
  if (update.author !== undefined) fields.author = update.author;
  if (update.coverUrl !== undefined) fields.coverUrl = update.coverUrl;
  if (update.filename !== undefined) fields.filename = update.filename;
  if (update.fileSize !== undefined) fields.fileSize = update.fileSize;
  if (update.uploadedAt !== undefined) fields.uploadedAt = update.uploadedAt;
  if (update.vectorized !== undefined)
    fields.vectorized = update.vectorized ? "1" : "0";

  // Handle blobUrl change and reverse index update
  if (update.blobUrl !== undefined && update.blobUrl !== current.blobUrl) {
    fields.blobUrl = update.blobUrl;
    const pipeline = redis.pipeline();
    pipeline.hdel(BLOB_INDEX_KEY, current.blobUrl);
    pipeline.hset(BLOB_INDEX_KEY, { [update.blobUrl]: id });
    await pipeline.exec();
  }

  if (Object.keys(fields).length > 0) {
    await redis.hset(key, fields);

    // Minimal log that avoids logging the whole diff
    log.info("book-store", "Updated book record", {
      bookId: id,
      updatedFields: Object.keys(fields),
    });
  }
}

/**
 * Delete a book and all its index entries.
 */
export async function deleteBook(id: string): Promise<void> {
  const redis = getRedisClient();
  const book = await getBook(id);
  if (!book) return;

  const pipeline = redis.pipeline();
  pipeline.del(bookKey(id));
  pipeline.srem(BOOKS_INDEX_KEY, id);
  pipeline.hdel(BLOB_INDEX_KEY, book.blobUrl);
  await pipeline.exec();

  log.info("book-store", "Deleted book record", { bookId: id });
}

/**
 * Mark a book as vectorized.
 */
export async function markBookVectorized(id: string): Promise<void> {
  await updateBook(id, { vectorized: true });
}

/**
 * Find a book by its blobUrl.
 * Uses a Redis Hash for O(1) reverse lookup.
 */
export async function getBookByBlobUrl(
  blobUrl: string,
): Promise<BookRecord | null> {
  const redis = getRedisClient();
  const bookId = await redis.hget<string>(BLOB_INDEX_KEY, blobUrl);

  if (!bookId) {
    return null;
  }

  return getBook(bookId);
}

/**
 * Generate a URL-friendly slug from a book title with a unique suffix.
 */
export function slugifyBookId(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04FF]+/gi, "-") // Allow English and Cyrillic
    .replace(/^-|-$/g, "");

  const suffix = crypto.randomUUID().split("-")[0];
  return slug ? `${slug}-${suffix}` : crypto.randomUUID();
}
