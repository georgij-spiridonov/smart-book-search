import { describe, it, expect } from "vitest";
import { splitText, splitPages } from "../utils/textSplitter";
import type { PageText } from "../utils/textParser";

describe("textSplitter", () => {
  it("produces a single chunk for short text", () => {
    const short = "Hello, this is a short sentence.";
    const chunks = splitText(short);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toContain("Hello");
  });

  it("produces multiple chunks for long text", () => {
    const paragraph = "Lorem ipsum dolor sit amet. ".repeat(200); // ~5600 chars
    const chunks = splitText(paragraph);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("respects approximate chunk size limit", () => {
    const paragraph =
      "This is a test sentence with some meaningful content. ".repeat(100);
    const chunks = splitText(paragraph, { chunkSize: 500, chunkOverlap: 100 });
    const maxLen = Math.max(...chunks.map((c) => c.text.length));
    // Allow up to 1.5x chunk size due to overlap merging
    expect(maxLen).toBeLessThanOrEqual(500 * 1.5);
  });

  it("assigns sequential chunkIndex values", () => {
    const text = "Word ".repeat(500);
    const chunks = splitText(text);
    const indices = chunks.map((c) => c.chunkIndex);
    const isSequential = indices.every((val, idx) => val === idx);
    expect(isSequential).toBe(true);
  });

  it("propagates title and pageNumber via splitPages", () => {
    const pages: PageText[] = [
      { pageNumber: 1, text: "Content of Chapter 1", title: "Chapter 1" },
      { pageNumber: 2, text: "Content of Chapter 2", title: "Chapter 2" },
    ];
    const chunks = splitPages(pages);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.pageNumber).toBe(1);
    expect(chunks[0]!.title).toBe("Chapter 1");
    expect(chunks[1]!.pageNumber).toBe(2);
    expect(chunks[1]!.title).toBe("Chapter 2");
  });

  it("returns no chunks for empty text", () => {
    const chunks = splitText("");
    expect(chunks).toHaveLength(0);
  });
});
