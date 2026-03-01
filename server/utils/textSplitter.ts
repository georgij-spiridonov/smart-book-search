import type { PageText } from "./textParser";

export interface TextChunk {
  text: string;
  chunkIndex: number;
  pageNumber: number;
  title?: string;
}

/**
 * Split an array of pages into smaller, overlapping chunks,
 * preserving the source page number and metadata in each chunk.
 *
 * Each PageText usually represents a chapter (EPUB) or a page (PDF).
 * To avoid "splitting the meaning of a block", we process each page/chapter
 * independently, so chunks never span across chapter boundaries.
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
        title: page.title,
      });
    }
  }

  return allChunks;
}

/**
 * Split a single text string into chunks based on sentences.
 *
 * Key features:
 * 1. Always starts a chunk with the beginning of a sentence.
 * 2. If a sentence is longer than chunkSize, it's taken whole as one chunk.
 * 3. Preserves original line breaks, spaces, and punctuation.
 * 4. Supports sentence-aware overlap.
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

  if (!text.trim()) return [];

  // Use Intl.Segmenter for robust sentence splitting across different languages.
  // Using 'undefined' as locale lets it use the environment default or best-guess.
  const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
  const segments = segmenter.segment(text);
  const sentences = Array.from(segments).map((s) => s.segment);

  const chunks: string[] = [];
  let currentChunkSentences: string[] = [];
  let currentChunkLength = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i]!;

    // Case 1: The sentence itself is longer than the desired chunk size.
    // Requirement: "Если предложение больше длины чанка - брать его целиком и переходить к следующему."
    if (sentence.length >= chunkSize) {
      // Flush current accumulated chunk if any
      if (currentChunkSentences.length > 0) {
        chunks.push(currentChunkSentences.join(""));
        currentChunkSentences = [];
        currentChunkLength = 0;
      }
      // Add the long sentence as its own standalone chunk
      chunks.push(sentence);
      continue;
    }

    // Case 2: Adding this sentence would exceed the chunkSize.
    if (currentChunkLength + sentence.length > chunkSize) {
      // Finalize the current chunk
      const finishedChunkText = currentChunkSentences.join("");
      chunks.push(finishedChunkText);

      // Implement sentence-aware overlap.
      // We want to include previous sentences that fit within the chunkOverlap limit.
      const overlapSentences: string[] = [];
      let overlapLength = 0;
      for (let j = currentChunkSentences.length - 1; j >= 0; j--) {
        const prevS = currentChunkSentences[j]!;
        // Ensure overlap doesn't exceed the limit and doesn't consume the whole next chunk
        if (overlapLength + prevS.length <= chunkOverlap) {
          overlapSentences.unshift(prevS);
          overlapLength += prevS.length;
        } else {
          break;
        }
      }

      // Start new chunk with the overlap and the current sentence
      currentChunkSentences = [...overlapSentences, sentence];
      currentChunkLength = overlapLength + sentence.length;
    } else {
      // Case 3: Sentence fits within the current chunk
      currentChunkSentences.push(sentence);
      currentChunkLength += sentence.length;
    }
  }

  // Push the last remaining chunk
  if (currentChunkSentences.length > 0) {
    const lastChunkText = currentChunkSentences.join("");
    // Avoid redundant chunks (e.g. if the last chunk is identical to overlap from previous)
    if (chunks.length === 0 || chunks[chunks.length - 1] !== lastChunkText) {
      chunks.push(lastChunkText);
    }
  }

  return chunks.map((t, i) => ({ text: t, chunkIndex: i }));
}
