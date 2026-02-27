import { describe, it, expect } from "vitest";
import { extractText } from "../utils/textParser";
import type { PageText } from "../utils/textParser";

describe("textParser", () => {
  it("extracts TXT content as a single PageText entry", async () => {
    const content = "Hello, World! This is a test book content.";
    const buffer = Buffer.from(content, "utf-8");
    const pages: PageText[] = await extractText(buffer, "test.txt");

    expect(pages).toHaveLength(1);
    expect(pages[0]!.pageNumber).toBe(1);
    expect(pages[0]!.text).toBe(content);
  });

  it("handles TXT with unicode characters", async () => {
    const content = "Привет мир! 你好世界! مرحبا بالعالم";
    const buffer = Buffer.from(content, "utf-8");
    const pages = await extractText(buffer, "unicode-book.txt");

    expect(pages).toHaveLength(1);
    expect(pages[0]!.text).toBe(content);
  });

  it("throws on unsupported file format", async () => {
    const buffer = Buffer.from("data", "utf-8");
    await expect(extractText(buffer, "file.docx")).rejects.toThrow(
      "Unsupported file format",
    );
  });

  it("returns empty array for empty TXT", async () => {
    const buffer = Buffer.from("", "utf-8");
    const pages = await extractText(buffer, "empty.txt");
    expect(pages).toHaveLength(0);
  });
});
