import { getRedisClient } from "./redis";
import { logger } from "./logger";

/**
 * Хранилище метаданных книг на базе Upstash Redis.
 * 
 * Каждая книга хранится как Redis Hash по ключу `books:{id}`.
 * Redis Set `books:index` хранит список всех ID книг для листинга.
 * Redis Hash `books:blob-index` используется для быстрого поиска ID по URL файла.
 */

/** Запись о книге в базе данных */
export interface BookRecord {
  /** Уникальный идентификатор книги (slug) */
  id: string;
  /** ID пользователя, загрузившего книгу */
  userId: string;
  /** Название книги */
  title: string;
  /** Автор книги */
  author: string;
  /** URL обложки */
  coverUrl: string;
  /** URL файла в облачном хранилище (Vercel Blob) */
  blobUrl: string;
  /** Оригинальное имя файла */
  filename: string;
  /** Размер файла в байтах */
  fileSize: number;
  /** Время загрузки (timestamp) */
  uploadedAt: number;
  /** Флаг, указывающий, была ли книга векторизована для поиска */
  vectorized: boolean;
}

/** Ключ индекса всех ID книг */
const REDIS_KEY_BOOKS_INDEX = "smart-book-search:books:index";
/** Префикс для ключей деталей конкретной книги */
const REDIS_KEY_BOOK_DETAILS_PREFIX = "smart-book-search:books:";
/** Ключ обратного индекса (Blob URL -> Book ID) */
const REDIS_KEY_BLOB_TO_ID_INDEX = "smart-book-search:books:blob-index";

/** Формирует ключ Redis для конкретной книги */
function formatBookDetailsKey(id: string): string {
  return `${REDIS_KEY_BOOK_DETAILS_PREFIX}${id}`;
}

/**
 * Сериализует объект BookRecord для сохранения в Redis HSET.
 */
function serializeBookRecord(
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
 * Десериализует ответ из Redis Hash обратно в объект BookRecord.
 */
function deserializeBookRecord(rawData: Record<string, unknown>): BookRecord {
  return {
    id: String(rawData.id ?? ""),
    userId: String(rawData.userId ?? "legacy"),
    title: String(rawData.title ?? ""),
    author: String(rawData.author ?? "Unknown"),
    coverUrl: String(rawData.coverUrl ?? ""),
    blobUrl: String(rawData.blobUrl ?? ""),
    filename: String(rawData.filename ?? ""),
    fileSize: Number(rawData.fileSize ?? 0),
    uploadedAt: Number(rawData.uploadedAt ?? 0),
    vectorized: String(rawData.vectorized) === "1" || rawData.vectorized === true,
  };
}

/**
 * Добавляет новую запись о книге в хранилище.
 */
export async function addBook(record: BookRecord): Promise<void> {
  const redisClient = getRedisClient();
  const bookKey = formatBookDetailsKey(record.id);

  // Используем конвейер для обеспечения целостности индексов
  const redisPipeline = redisClient.pipeline();
  
  redisPipeline.hset(bookKey, serializeBookRecord(record));
  redisPipeline.sadd(REDIS_KEY_BOOKS_INDEX, record.id);
  
  // Добавляем запись в обратный индекс для поиска O(1) по URL
  redisPipeline.hset(REDIS_KEY_BLOB_TO_ID_INDEX, { [record.blobUrl]: record.id });
  
  await redisPipeline.exec();

  logger.info("book-store", "Added new book record", { bookId: record.id });
}

/**
 * Получает информацию о книге по её ID. Возвращает null, если книга не найдена.
 */
export async function getBook(id: string): Promise<BookRecord | null> {
  const redisClient = getRedisClient();
  const rawData = await redisClient.hgetall<Record<string, unknown>>(formatBookDetailsKey(id));

  if (!rawData || Object.keys(rawData).length === 0) {
    return null;
  }

  return deserializeBookRecord(rawData);
}

/**
 * Возвращает список всех книг в хранилище.
 */
export async function getAllBooks(): Promise<BookRecord[]> {
  const redisClient = getRedisClient();
  const bookIds = await redisClient.smembers<string[]>(REDIS_KEY_BOOKS_INDEX);

  if (!bookIds || bookIds.length === 0) {
    return [];
  }

  // Получаем данные всех книг за один запрос к Redis
  const redisPipeline = redisClient.pipeline();
  for (const id of bookIds) {
    redisPipeline.hgetall(formatBookDetailsKey(id));
  }

  const pipelineResults = await redisPipeline.exec<(Record<string, unknown> | null)[]>();

  const booksList: BookRecord[] = [];
  for (const rawData of pipelineResults) {
    if (rawData && typeof rawData === "object" && Object.keys(rawData).length > 0) {
      booksList.push(deserializeBookRecord(rawData));
    }
  }

  // Сортируем: сначала новые (по дате загрузки)
  booksList.sort((a, b) => b.uploadedAt - a.uploadedAt);

  return booksList;
}

/**
 * Обновляет указанные поля в записи о книге.
 */
export async function updateBook(
  id: string,
  updateData: Partial<Omit<BookRecord, "id">>,
): Promise<void> {
  const redisClient = getRedisClient();
  const bookKey = formatBookDetailsKey(id);

  // Проверяем существование книги и получаем текущие данные для обновления индексов
  const currentRecord = await getBook(id);
  if (!currentRecord) {
    logger.error("book-store", "Cannot update: Book not found", { bookId: id });
    throw new Error(`Book "${id}" not found in store.`);
  }

  const fieldsToSet: Record<string, string | number | boolean> = {};
  
  if (updateData.title !== undefined) fieldsToSet.title = updateData.title;
  if (updateData.author !== undefined) fieldsToSet.author = updateData.author;
  if (updateData.coverUrl !== undefined) fieldsToSet.coverUrl = updateData.coverUrl;
  if (updateData.filename !== undefined) fieldsToSet.filename = updateData.filename;
  if (updateData.fileSize !== undefined) fieldsToSet.fileSize = updateData.fileSize;
  if (updateData.uploadedAt !== undefined) fieldsToSet.uploadedAt = updateData.uploadedAt;
  
  if (updateData.vectorized !== undefined) {
    fieldsToSet.vectorized = updateData.vectorized ? "1" : "0";
  }

  // Обработка изменения URL файла и обновление обратного индекса
  if (updateData.blobUrl !== undefined && updateData.blobUrl !== currentRecord.blobUrl) {
    fieldsToSet.blobUrl = updateData.blobUrl;
    const redisPipeline = redisClient.pipeline();
    redisPipeline.hdel(REDIS_KEY_BLOB_TO_ID_INDEX, currentRecord.blobUrl);
    redisPipeline.hset(REDIS_KEY_BLOB_TO_ID_INDEX, { [updateData.blobUrl]: id });
    await redisPipeline.exec();
  }

  if (Object.keys(fieldsToSet).length > 0) {
    await redisClient.hset(bookKey, fieldsToSet);

    logger.info("book-store", "Updated book record", {
      bookId: id,
      updatedFields: Object.keys(fieldsToSet),
    });
  }
}

/**
 * Удаляет книгу и все связанные с ней индексные записи.
 */
export async function deleteBook(id: string): Promise<void> {
  const redisClient = getRedisClient();
  const bookRecord = await getBook(id);
  if (!bookRecord) {
    return;
  }

  const redisPipeline = redisClient.pipeline();
  redisPipeline.del(formatBookDetailsKey(id));
  redisPipeline.srem(REDIS_KEY_BOOKS_INDEX, id);
  redisPipeline.hdel(REDIS_KEY_BLOB_TO_ID_INDEX, bookRecord.blobUrl);
  
  await redisPipeline.exec();

  logger.info("book-store", "Deleted book record", { bookId: id });
}

/**
 * Помечает книгу как векторизованную.
 */
export async function markBookVectorized(id: string): Promise<void> {
  await updateBook(id, { vectorized: true });
}

/**
 * Ищет книгу по её URL файла.
 * Использует Redis Hash для мгновенного обратного поиска.
 */
export async function getBookByBlobUrl(
  blobUrl: string,
): Promise<BookRecord | null> {
  const redisClient = getRedisClient();
  const foundBookId = await redisClient.hget<string>(REDIS_KEY_BLOB_TO_ID_INDEX, blobUrl);

  if (!foundBookId) {
    return null;
  }

  return getBook(foundBookId);
}

/**
 * Генерирует безопасный для URL идентификатор (slug) на основе названия книги.
 * Поддерживает латиницу и кириллицу.
 */
export function slugifyBookId(title: string): string {
  const slugBase = title
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04FF]+/gi, "-")
    .replace(/^-|-$/g, "");

  const uniqueSuffix = crypto.randomUUID().split("-")[0];
  return slugBase ? `${slugBase}-${uniqueSuffix}` : crypto.randomUUID();
}
