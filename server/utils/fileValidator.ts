/**
 * Magic-bytes file type validation.
 * Checks the actual binary header of a file buffer instead of trusting extensions.
 */

export type DetectedFileType = "pdf" | "epub" | "txt" | "unknown";

interface ValidationResult {
  valid: boolean;
  detectedType: DetectedFileType;
  message: string;
}

// Magic byte signatures
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // PK\x03\x04

/**
 * Validate that a file buffer matches its declared extension
 * by inspecting magic bytes.
 */
export function validateFileType(
  buffer: Buffer,
  declaredExtension: string,
): ValidationResult {
  const detected = detectFileType(buffer);
  const ext = declaredExtension.toLowerCase().replace(/^\./, "");

  if (detected === "unknown") {
    return {
      valid: false,
      detectedType: detected,
      message: `Unable to detect file type from content. Declared: .${ext}`,
    };
  }

  if (detected !== ext) {
    return {
      valid: false,
      detectedType: detected,
      message: `File content mismatch: declared .${ext} but content is ${detected}`,
    };
  }

  return {
    valid: true,
    detectedType: detected,
    message: `File type verified: .${ext}`,
  };
}

/**
 * Detect file type from buffer content using magic bytes.
 */
export function detectFileType(buffer: Buffer): DetectedFileType {
  if (buffer.length < 4) {
    return "unknown";
  }

  // PDF: starts with %PDF-
  if (buffer.subarray(0, 5).equals(PDF_MAGIC)) {
    return "pdf";
  }

  // ZIP (EPUB is a ZIP with mimetype file): starts with PK\x03\x04
  if (buffer.subarray(0, 4).equals(ZIP_MAGIC)) {
    // Further check: EPUB ZIPs contain "application/epub+zip" at offset 30+
    // The mimetype file is typically the first entry and uncompressed
    const mimetypeStr = buffer.subarray(30, 58).toString("ascii");
    if (mimetypeStr.includes("application/epub+zip")) {
      return "epub";
    }
    // It's a ZIP but not EPUB
    return "unknown";
  }

  // TXT: no binary bytes in the first 512 bytes (simple heuristic)
  if (isLikelyText(buffer)) {
    return "txt";
  }

  return "unknown";
}

/**
 * Check if a buffer is likely text by scanning for binary (non-text) bytes.
 * Allows common whitespace and printable characters.
 */
function isLikelyText(buffer: Buffer): boolean {
  const checkLength = Math.min(buffer.length, 512);
  let binaryCount = 0;

  for (let i = 0; i < checkLength; i++) {
    const byte = buffer[i]!;
    // Allow: tab(9), newline(10), carriage-return(13), printable ASCII(32-126)
    // Allow: UTF-8 continuation bytes (128-255)
    const isText =
      byte === 9 ||
      byte === 10 ||
      byte === 13 ||
      (byte >= 32 && byte <= 126) ||
      byte >= 128;

    if (!isText) {
      binaryCount++;
    }
  }

  // Allow a tiny fraction of non-text bytes (e.g. BOM)
  return binaryCount <= 2;
}
