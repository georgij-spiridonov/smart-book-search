import { describe, it, expect } from "vitest";
import { splitText, splitPages } from "../utils/textSplitter";
import type { PageText } from "../utils/textParser";

describe("textSplitter", () => {
  it("produces a single chunk for short text", () => {
    const short = "Hello, this is a short sentence.";
    const chunks = splitText(short);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toBe(short);
  });

  it("produces multiple chunks for long text", () => {
    const paragraph = "Sentence one. ".repeat(100);
    const chunks = splitText(paragraph, { chunkSize: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    // Every chunk should start with "Sentence"
    chunks.forEach((c) => {
      expect(c.text.startsWith("Sentence")).toBe(true);
    });
  });

  it("takes a long sentence as a whole even if it exceeds chunkSize", () => {
    const longSentence = "This is a very long sentence without any terminators that exceeds the chunk size limit by quite a bit and should not be split into smaller pieces even though it is very long indeed";
    const text = "Short sentence. " + longSentence + ". Another short sentence.";
    const chunkSize = 50;
    const chunks = splitText(text, { chunkSize });

    // The long sentence (plus its terminator) should be its own chunk and not be split
    const longChunk = chunks.find(c => c.text.includes(longSentence));
    expect(longChunk).toBeDefined();
    expect(longChunk!.text).toContain(longSentence);
    expect(longChunk!.text.length).toBeGreaterThan(chunkSize);
  });

  it("preserves line breaks and punctuation", () => {
    const textWithNewlines = "First sentence.\nSecond sentence with\na newline.\nThird sentence!";
    const chunks = splitText(textWithNewlines, { chunkSize: 20 });
    
    // Join all chunks (ignoring overlaps for this test by setting overlap to 0)
    const chunksNoOverlap = splitText(textWithNewlines, { chunkSize: 20, chunkOverlap: 0 });
    const joined = chunksNoOverlap.map(c => c.text).join("");
    expect(joined).toBe(textWithNewlines);
  });

  it("handles overlap correctly with sentences", () => {
    const text = "S1. S2. S3. S4. S5."; // Each "SX. " is 4 chars
    const chunks = splitText(text, { chunkSize: 10, chunkOverlap: 5 });
    
    // Chunk 1: "S1. S2. " (8 chars)
    // Chunk 2: overlap "S2. " + "S3. " -> "S2. S3. " (8 chars)
    // ...
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[1]!.text.startsWith("S2.")).toBe(true);
  });

  it("propagates title and pageNumber via splitPages and respects chapter boundaries", () => {
    const pages: PageText[] = [
      { pageNumber: 1, text: "Chapter 1 sentence. Another sentence.", title: "Chapter 1" },
      { pageNumber: 2, text: "Chapter 2 starts here.", title: "Chapter 2" },
    ];
    // Use a very small chunkSize to force splitting if it was one big text
    const chunks = splitPages(pages, { chunkSize: 10 });

    expect(chunks[0]!.pageNumber).toBe(1);
    expect(chunks[0]!.title).toBe("Chapter 1");
    
    // The last chunk of Chapter 1 should not contain any text from Chapter 2
    const chapter1Chunks = chunks.filter(c => c.pageNumber === 1);
    const chapter2Chunks = chunks.filter(c => c.pageNumber === 2);
    
    chapter1Chunks.forEach(c => {
        expect(c.text).not.toContain("Chapter 2");
    });
    chapter2Chunks.forEach(c => {
        expect(c.text).not.toContain("Chapter 1");
    });
  });

  it("returns no chunks for empty text", () => {
    const chunks = splitText("");
    expect(chunks).toHaveLength(0);
  });

  it("handles Russian text correctly", () => {
    const russianText = "Первое предложение. Второе предложение с запятой, и еще чем-то. Третье!";
    const chunks = splitText(russianText, { chunkSize: 30 });
    
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.text).toContain("Первое предложение.");
  });
});
