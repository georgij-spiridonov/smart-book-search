import * as pdfParseModule from "pdf-parse";

// pdf-parse exports differently in ESM vs CJS
const pdfParse = (pdfParseModule as any).default ?? pdfParseModule;

/**
 * Extract plain text from a file buffer based on its extension.
 * Supports: .txt, .pdf
 */
export async function extractText(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  const ext = filename.split(".").pop()?.toLowerCase();

  switch (ext) {
    case "txt":
      return buffer.toString("utf-8");

    case "pdf":
      return extractTextFromPdf(buffer);

    default:
      throw new Error(`Unsupported file format: .${ext}`);
  }
}

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return data.text;
}
