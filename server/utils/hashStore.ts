import crypto from "crypto";
import { getRedisClient } from "./redis";
import { logger } from "./logger";

/** Ключ в Redis для хранения соответствия хэша файла и его URL в хранилище (Blob Storage) */
const REDIS_KEY_FILE_HASH_TO_URL = "smart-book-search:blobs";
/** Ключ в Redis для хранения набора хэшей файлов, которые уже были векторизованы */
const REDIS_KEY_VECTORIZED_HASHES = "smart-book-search:vectorized";

/**
 * Генерирует SHA-256 хэш контента файла.
 * 
 * @param {Buffer} fileBuffer Бинарное содержимое файла.
 * @returns {string} Хэш в формате hex.
 */
export function getFileHash(fileBuffer: Buffer): string {
  return crypto.createHash("sha256").update(fileBuffer).digest("hex");
}

/**
 * Ищет существующий URL файла по его хэшу.
 * Позволяет избежать повторной загрузки идентичных файлов.
 * 
 * @param {string} fileHash Хэш файла для поиска.
 * @returns {Promise<string | undefined>} URL файла, если он найден, иначе undefined.
 */
export async function getExistingBlobUrl(
  fileHash: string,
): Promise<string | undefined> {
  const redisClient = getRedisClient();
  const existingUrl = await redisClient.hget(REDIS_KEY_FILE_HASH_TO_URL, fileHash);
  const resultUrl = (existingUrl as string) || undefined;

  if (resultUrl) {
    logger.info("hash-store", "Duplicate file detected by hash", { fileHash });
  }

  return resultUrl;
}

/**
 * Сохраняет информацию о загруженном файле в Redis.
 * 
 * @param {string} fileHash Хэш файла.
 * @param {string} blobUrl URL загруженного файла в хранилище.
 */
export async function markFileAsUploaded(
  fileHash: string,
  blobUrl: string,
): Promise<void> {
  const redisClient = getRedisClient();
  await redisClient.hset(REDIS_KEY_FILE_HASH_TO_URL, { [fileHash]: blobUrl });
}

/**
 * Проверяет, был ли файл с данным хэшем уже векторизован (обработан ИИ).
 * 
 * @param {string} fileHash Хэш файла.
 * @returns {Promise<boolean>} true, если файл уже векторизован.
 */
export async function isFileVectorized(fileHash: string): Promise<boolean> {
  const redisClient = getRedisClient();
  const exists = await redisClient.sismember(REDIS_KEY_VECTORIZED_HASHES, fileHash);
  return exists === 1;
}

/**
 * Помечает файл как векторизованный.
 * 
 * @param {string} fileHash Хэш векторизованного файла.
 */
export async function markFileAsVectorized(fileHash: string): Promise<void> {
  const redisClient = getRedisClient();
  await redisClient.sadd(REDIS_KEY_VECTORIZED_HASHES, fileHash);
  logger.info("hash-store", "Marked file as vectorized by hash", { fileHash });
}

/**
 * Удаляет все связанные с данным URL хэши.
 * Используется при удалении книги для очистки кэша.
 * 
 * Примечание: hgetall может быть медленным при огромном количестве файлов,
 * но в рамках данного проекта это допустимо.
 * 
 * @param {string} targetBlobUrl URL файла, записи о котором нужно удалить.
 */
export async function deleteHashesByBlobUrl(targetBlobUrl: string): Promise<void> {
  const redisClient = getRedisClient();

  // Получаем все записи хэшей, чтобы найти те, что ссылаются на данный URL
  const allHashEntries = await redisClient.hgetall(REDIS_KEY_FILE_HASH_TO_URL);
  if (!allHashEntries) {
    return;
  }

  const hashesToDelete = Object.entries(allHashEntries)
    .filter(([_, currentUrl]) => currentUrl === targetBlobUrl)
    .map(([hash, _]) => hash);

  for (const hashToDelete of hashesToDelete) {
    // Выполняем удаление параллельно для ускорения
    await Promise.all([
      redisClient.hdel(REDIS_KEY_FILE_HASH_TO_URL, hashToDelete),
      redisClient.srem(REDIS_KEY_VECTORIZED_HASHES, hashToDelete)
    ]);
    
    logger.info("hash-store", "Deleted file hash mappings", { 
      hash: hashToDelete, 
      blobUrl: targetBlobUrl 
    });
  }
}
