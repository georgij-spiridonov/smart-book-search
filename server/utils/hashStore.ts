import crypto from "crypto";

// In-memory store mapping file hash to its Vercel Blob URL
const processedFiles = new Map<string, string>();
// Set of file hashes that have completely finished vectorization
const vectorizedHashes = new Set<string>();

export function getFileHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function getExistingBlobUrl(hash: string): string | undefined {
  return processedFiles.get(hash);
}

export function markFileAsUploaded(hash: string, url: string): void {
  processedFiles.set(hash, url);
}

export function isFileVectorized(hash: string): boolean {
  return vectorizedHashes.has(hash);
}

export function markFileAsVectorized(hash: string): void {
  vectorizedHashes.add(hash);
}
