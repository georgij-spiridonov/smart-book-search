import crypto from "crypto";
import { getRedisClient } from "./redis";
import { log } from "./logger";

const BLOBS_HASH_KEY = "smart-book-search:blobs";
const VECTORIZED_SET_KEY = "smart-book-search:vectorized";

export function getFileHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function getExistingBlobUrl(
  hash: string,
): Promise<string | undefined> {
  const redis = getRedisClient();
  const url = await redis.hget(BLOBS_HASH_KEY, hash);
  const result = (url as string) || undefined;

  if (result) {
    log.info("hash-store", "Duplicate file detected by hash", { hash });
  }

  return result;
}

export async function markFileAsUploaded(
  hash: string,
  url: string,
): Promise<void> {
  const redis = getRedisClient();
  await redis.hset(BLOBS_HASH_KEY, { [hash]: url });
}

export async function isFileVectorized(hash: string): Promise<boolean> {
  const redis = getRedisClient();
  const result = await redis.sismember(VECTORIZED_SET_KEY, hash);
  return result === 1;
}

export async function markFileAsVectorized(hash: string): Promise<void> {
  const redis = getRedisClient();
  await redis.sadd(VECTORIZED_SET_KEY, hash);
  log.info("hash-store", "Marked file as vectorized by hash", { hash });
}
