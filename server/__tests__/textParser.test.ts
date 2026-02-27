import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mock pdfjs-dist ----
const mockGetTextContent = vi.fn();
const mockGetPage = vi.fn(() => ({ getTextContent: mockGetTextContent }));
const mockGetDocument = vi.fn();

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  getDocument: (opts: any) => ({ promise: mockGetDocument(opts) }),
}));

// ---- Mock epub2 ----
const mockGetChapterAsync = vi.fn();
const mockCreateAsync = vi.fn();

vi.mock("epub2", () => ({
  EPub: {
    createAsync: (path: string) => mockCreateAsync(path),
  },
}));

// ---- Mock html-to-text ----
const mockConvert = vi.fn();
vi.mock("html-to-text", () => ({
  convert: (html: string, opts: any) => mockConvert(html, opts),
}));

// ---- Mock fs for EPUB temp file handling ----
const mockWriteFileSync = vi.fn();
const mockUnlinkSync = vi.fn();
vi.mock("fs", () => ({
  default: {
    writeFileSync: (...args: any[]) => mockWriteFileSync(...args),
    unlinkSync: (...args: any[]) => mockUnlinkSync(...args),
  },
  writeFileSync: (...args: any[]) => mockWriteFileSync(...args),
  unlinkSync: (...args: any[]) => mockUnlinkSync(...args),
}));

import { extractText } from "../utils/textParser";
import type { PageText } from "../utils/textParser";

describe("textParser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ──────── TXT ────────
  describe("TXT extraction", () => {
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

    it("returns empty array for empty TXT", async () => {
      const buffer = Buffer.from("", "utf-8");
      const pages = await extractText(buffer, "empty.txt");
      expect(pages).toHaveLength(0);
    });

    it("returns empty array for whitespace-only TXT", async () => {
      const buffer = Buffer.from("   \n\t  \n  ", "utf-8");
      const pages = await extractText(buffer, "blank.txt");
      expect(pages).toHaveLength(0);
    });
  });

  // ──────── Error handling ────────
  it("throws on unsupported file format", async () => {
    const buffer = Buffer.from("data", "utf-8");
    await expect(extractText(buffer, "file.docx")).rejects.toThrow(
      "Unsupported file format",
    );
  });

  it("throws for format without extension", async () => {
    const buffer = Buffer.from("data", "utf-8");
    await expect(extractText(buffer, "noextension")).rejects.toThrow(
      "Unsupported file format",
    );
  });

  // ──────── PDF ────────
  describe("PDF extraction", () => {
    it("extracts text from multiple PDF pages", async () => {
      mockGetDocument.mockResolvedValue({
        numPages: 2,
        getPage: mockGetPage,
      });

      // Page 1
      mockGetTextContent
        .mockResolvedValueOnce({
          items: [{ str: "Hello " }, { str: "World" }],
        })
        // Page 2
        .mockResolvedValueOnce({
          items: [{ str: "Second page content" }],
        });

      const buffer = Buffer.from("fake-pdf-data");
      const pages = await extractText(buffer, "book.pdf");

      expect(pages).toHaveLength(2);
      expect(pages[0]!.pageNumber).toBe(1);
      expect(pages[0]!.text).toContain("Hello");
      expect(pages[1]!.pageNumber).toBe(2);
      expect(pages[1]!.text).toContain("Second page content");
    });

    it("skips empty PDF pages", async () => {
      mockGetDocument.mockResolvedValue({
        numPages: 3,
        getPage: mockGetPage,
      });

      mockGetTextContent
        .mockResolvedValueOnce({ items: [{ str: "Page one" }] })
        .mockResolvedValueOnce({ items: [{ str: "   " }] }) // empty after trim
        .mockResolvedValueOnce({ items: [{ str: "Page three" }] });

      const buffer = Buffer.from("fake-pdf");
      const pages = await extractText(buffer, "test.pdf");

      expect(pages).toHaveLength(2);
      expect(pages[0]!.pageNumber).toBe(1);
      expect(pages[1]!.pageNumber).toBe(3);
    });

    it("filters out non-text items in PDF content", async () => {
      mockGetDocument.mockResolvedValue({
        numPages: 1,
        getPage: mockGetPage,
      });

      mockGetTextContent.mockResolvedValueOnce({
        items: [
          { str: "Text item" },
          { width: 100, height: 50 }, // non-text item without 'str'
          { str: " continues" },
        ],
      });

      const buffer = Buffer.from("fake-pdf");
      const pages = await extractText(buffer, "mixed.pdf");

      expect(pages).toHaveLength(1);
      expect(pages[0]!.text).toContain("Text item");
      expect(pages[0]!.text).toContain("continues");
    });

    it("returns empty array for PDF with no text content", async () => {
      mockGetDocument.mockResolvedValue({
        numPages: 1,
        getPage: mockGetPage,
      });

      mockGetTextContent.mockResolvedValueOnce({ items: [] });

      const buffer = Buffer.from("empty-pdf");
      const pages = await extractText(buffer, "empty.pdf");

      expect(pages).toHaveLength(0);
    });
  });

  // ──────── EPUB ────────
  describe("EPUB extraction", () => {
    it("extracts text from EPUB chapters", async () => {
      mockCreateAsync.mockResolvedValue({
        flow: [
          { id: "ch1", title: "Chapter 1" },
          { id: "ch2", title: "Chapter 2" },
        ],
        getChapterAsync: mockGetChapterAsync,
      });

      mockGetChapterAsync
        .mockResolvedValueOnce("<p>First chapter HTML</p>")
        .mockResolvedValueOnce("<p>Second chapter HTML</p>");

      mockConvert
        .mockReturnValueOnce("First chapter text")
        .mockReturnValueOnce("Second chapter text");

      const buffer = Buffer.from("fake-epub-data");
      const pages = await extractText(buffer, "book.epub");

      expect(pages).toHaveLength(2);
      expect(pages[0]!.pageNumber).toBe(1);
      expect(pages[0]!.text).toBe("First chapter text");
      expect(pages[0]!.title).toBe("Chapter 1");
      expect(pages[1]!.pageNumber).toBe(2);
      expect(pages[1]!.text).toBe("Second chapter text");
      expect(pages[1]!.title).toBe("Chapter 2");
    });

    it("skips chapters that return empty text", async () => {
      mockCreateAsync.mockResolvedValue({
        flow: [
          { id: "ch1", title: "Chapter 1" },
          { id: "ch2", title: "Empty Chapter" },
        ],
        getChapterAsync: mockGetChapterAsync,
      });

      mockGetChapterAsync
        .mockResolvedValueOnce("<p>Real content</p>")
        .mockResolvedValueOnce("<p></p>");

      mockConvert
        .mockReturnValueOnce("Real content")
        .mockReturnValueOnce("   "); // empty after trim

      const buffer = Buffer.from("fake-epub");
      const pages = await extractText(buffer, "test.epub");

      expect(pages).toHaveLength(1);
      expect(pages[0]!.title).toBe("Chapter 1");
    });

    it("silently skips chapters that throw errors", async () => {
      mockCreateAsync.mockResolvedValue({
        flow: [
          { id: "ch1", title: "Good Chapter" },
          { id: "ch2", title: "Bad Chapter" },
          { id: "ch3", title: "Another Good" },
        ],
        getChapterAsync: mockGetChapterAsync,
      });

      mockGetChapterAsync
        .mockResolvedValueOnce("<p>Content 1</p>")
        .mockRejectedValueOnce(new Error("Chapter read error"))
        .mockResolvedValueOnce("<p>Content 3</p>");

      mockConvert
        .mockReturnValueOnce("Content 1")
        .mockReturnValueOnce("Content 3");

      const buffer = Buffer.from("fake-epub");
      const pages = await extractText(buffer, "broken.epub");

      expect(pages).toHaveLength(2);
      expect(pages[0]!.pageNumber).toBe(1);
      expect(pages[1]!.pageNumber).toBe(3);
    });

    it("cleans up temp file even on parsing error", async () => {
      mockCreateAsync.mockRejectedValue(new Error("Invalid EPUB"));

      const buffer = Buffer.from("bad-epub");
      await expect(extractText(buffer, "bad.epub")).rejects.toThrow(
        "Invalid EPUB",
      );

      // Temp file should be written and then cleaned up
      expect(mockWriteFileSync).toHaveBeenCalledOnce();
      expect(mockUnlinkSync).toHaveBeenCalledOnce();
    });

    it("handles EPUB with empty flow", async () => {
      mockCreateAsync.mockResolvedValue({
        flow: [],
        getChapterAsync: mockGetChapterAsync,
      });

      const buffer = Buffer.from("empty-epub");
      const pages = await extractText(buffer, "empty.epub");

      expect(pages).toHaveLength(0);
    });

    it("handles EPUB with undefined flow", async () => {
      mockCreateAsync.mockResolvedValue({
        flow: undefined,
        getChapterAsync: mockGetChapterAsync,
      });

      const buffer = Buffer.from("no-flow-epub");
      const pages = await extractText(buffer, "noflow.epub");

      expect(pages).toHaveLength(0);
    });
  });
});
