import type { PageText } from "./textParser";

export interface TextChunk {
  text: string;
  chunkIndex: number;
  pageNumber: number;
}

const DEFAULT_SEPARATORS = ["\n\n", "\n", ". ", " ", ""];

/**
 * Split an array of pages into smaller, overlapping chunks,
 * preserving the source page number in each chunk.
 */
export function splitPages(
  pages: PageText[],
  options?: {
    chunkSize?: number;
    chunkOverlap?: number;
  },
): TextChunk[] {
  const allChunks: TextChunk[] = [];
  let globalIndex = 0;

  for (const page of pages) {
    const rawChunks = splitText(page.text, options);
    for (const chunk of rawChunks) {
      allChunks.push({
        text: chunk.text,
        chunkIndex: globalIndex++,
        pageNumber: page.pageNumber,
      });
    }
  }

  return allChunks;
}

/**
 * Split a single text string into chunks (used internally and by tests).
 */
export function splitText(
  text: string,
  options?: {
    chunkSize?: number;
    chunkOverlap?: number;
  },
): Omit<TextChunk, "pageNumber">[] {
  const chunkSize = options?.chunkSize ?? 800;
  const chunkOverlap = options?.chunkOverlap ?? 200;

  const rawChunks = recursiveSplit(text, DEFAULT_SEPARATORS, chunkSize);
  const merged = mergeWithOverlap(rawChunks, chunkSize, chunkOverlap);

  return merged
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((t, i) => ({ text: t, chunkIndex: i }));
}

function recursiveSplit(
  text: string,
  separators: string[],
  chunkSize: number,
): string[] {
  if (text.length <= chunkSize) {
    return [text];
  }

  const separator = separators[0];
  const remainingSeparators = separators.slice(1);

  if (!separator) {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }
    return chunks;
  }

  const parts = text.split(separator);
  const results: string[] = [];
  let current = "";

  for (const part of parts) {
    const candidate = current ? current + separator + part : part;

    if (candidate.length <= chunkSize) {
      current = candidate;
    } else {
      if (current) {
        results.push(current);
      }
      if (part.length > chunkSize && remainingSeparators.length > 0) {
        results.push(...recursiveSplit(part, remainingSeparators, chunkSize));
        current = "";
      } else {
        current = part;
      }
    }
  }

  if (current) {
    results.push(current);
  }

  return results;
}

function mergeWithOverlap(
  chunks: string[],
  chunkSize: number,
  chunkOverlap: number,
): string[] {
  if (chunks.length <= 1 || chunkOverlap === 0) {
    return chunks;
  }

  const result: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const current = chunks[i]!;
    if (i === 0) {
      result.push(current);
    } else {
      const prevChunk = chunks[i - 1]!;
      const overlapText = prevChunk.slice(-chunkOverlap);
      const merged = overlapText + current;

      if (merged.length > chunkSize * 1.5) {
        result.push(current);
      } else {
        result.push(merged);
      }
    }
  }

  return result;
}
