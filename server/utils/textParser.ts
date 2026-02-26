import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * A piece of text with its source page/chapter number.
 */
export interface PageText {
  pageNumber: number;
  text: string;
}

/**
 * Extract text from a file buffer, returning an array of pages/chapters
 * with their page numbers. Supports: .txt, .pdf, .epub
 */
export async function extractText(
  buffer: Buffer,
  filename: string,
): Promise<PageText[]> {
  const ext = filename.split(".").pop()?.toLowerCase();

  switch (ext) {
    case "txt":
      return extractTextFromTxt(buffer);

    case "pdf":
      return extractTextFromPdf(buffer);

    case "epub":
      return extractTextFromEpub(buffer);

    default:
      throw new Error(`Unsupported file format: .${ext}`);
  }
}

/**
 * TXT: single page containing the entire text.
 */
function extractTextFromTxt(buffer: Buffer): PageText[] {
  const text = buffer.toString("utf-8");
  if (!text.trim()) return [];
  return [{ pageNumber: 1, text }];
}

/**
 * PDF: page-by-page extraction using pdfjs-dist.
 */
async function extractTextFromPdf(buffer: Buffer): Promise<PageText[]> {
  // pdfjs-dist ESM import
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const uint8Array = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({ data: uint8Array }).promise;

  const pages: PageText[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .filter((item: any) => "str" in item)
      .map((item: any) => item.str)
      .join(" ");

    if (text.trim()) {
      pages.push({ pageNumber: i, text: text.trim() });
    }
  }

  return pages;
}

/**
 * EPUB: chapter-by-chapter extraction using epub2.
 * Each chapter maps to a logical "page" number.
 */
async function extractTextFromEpub(buffer: Buffer): Promise<PageText[]> {
  // epub2 requires a file path, so write buffer to a temp file
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `epub-${Date.now()}.epub`);

  try {
    fs.writeFileSync(tmpFile, buffer);

    const { EPub } = await import("epub2");
    const epub = await EPub.createAsync(tmpFile);

    const pages: PageText[] = [];
    const flow = epub.flow || [];

    for (let i = 0; i < flow.length; i++) {
      const chapter = flow[i]!;
      try {
        const html = await epub.getChapterAsync(chapter.id);
        // Strip HTML tags to get plain text
        const text = stripHtml(html);
        if (text.trim()) {
          pages.push({ pageNumber: i + 1, text: text.trim() });
        }
      } catch {
        // Skip chapters that can't be read (e.g. images-only)
      }
    }

    return pages;
  } finally {
    // Cleanup temp file
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Strip HTML tags and decode common HTML entities.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
