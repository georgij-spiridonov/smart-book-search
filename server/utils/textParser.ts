import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { normalizePageText } from "./textNormalizer";

/**
 * A piece of text with its source page/chapter number and optional metadata.
 */
export interface PageText {
  pageNumber: number;
  text: string;
  title?: string;
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
 * PDF: page-by-page extraction using pdfjs-dist + line normalization.
 */
async function extractTextFromPdf(buffer: Buffer): Promise<PageText[]> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // In Node.js environment, we need to provide standard fonts and cmaps
  // to avoid "Ensure that the standardFontDataUrl API parameter is provided" errors.
  const { createRequire } = await import("node:module");
  const { pathToFileURL } = await import("node:url");
  const require = createRequire(import.meta.url);
  const pdfjsPath = path.dirname(require.resolve("pdfjs-dist/package.json"));

  // PDF.js expects URLs ending with a slash
  const standardFontDataUrl = pathToFileURL(
    path.join(pdfjsPath, "standard_fonts", path.sep),
  ).toString();
  const cMapUrl = pathToFileURL(
    path.join(pdfjsPath, "cmaps", path.sep),
  ).toString();

  const uint8Array = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({
    data: uint8Array,
    standardFontDataUrl,
    cMapUrl,
    cMapPacked: true,
  }).promise;

  const pages: PageText[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const rawText = content.items
      .filter((item: Record<string, unknown>) => "str" in item)
      .map((item: Record<string, unknown>) => item.str as string)
      .join(" ");

    if (rawText.trim()) {
      // Normalize: merge broken lines from PDF layout
      const normalized = normalizePageText(rawText.trim());
      pages.push({ pageNumber: i, text: normalized });
    }
  }

  return pages;
}

/**
 * EPUB: chapter-by-chapter extraction using epub2 + html-to-text.
 */
async function extractTextFromEpub(buffer: Buffer): Promise<PageText[]> {
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `epub-${Date.now()}.epub`);

  try {
    fs.writeFileSync(tmpFile, buffer);

    const { EPub } = await import("epub2");
    const { convert } = await import("html-to-text");

    const epub = await EPub.createAsync(tmpFile);

    const pages: PageText[] = [];
    const flow = epub.flow || [];

    for (let i = 0; i < flow.length; i++) {
      const chapter = flow[i]!;
      try {
        const html = await epub.getChapterAsync(chapter.id);
        // Use html-to-text for clean conversion
        const text = convert(html, {
          wordwrap: false,
          selectors: [
            { selector: "img", format: "skip" },
            { selector: "a", options: { ignoreHref: true } },
          ],
        });
        if (text.trim()) {
          pages.push({
            pageNumber: i + 1,
            text: text.trim(),
            title: chapter.title,
          });
        }
      } catch {
        // Skip chapters that can't be read
      }
    }

    return pages;
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}
