import { describe, it, expect } from "vitest";
import { validateFileType, detectFileType } from "../utils/fileValidator";

describe("fileValidator", () => {
  it("accepts a valid PDF header", () => {
    const pdfBuffer = Buffer.from("%PDF-1.4 fake content", "ascii");
    const result = validateFileType(pdfBuffer, "pdf");

    expect(result.valid).toBe(true);
    expect(result.detectedType).toBe("pdf");
  });

  it("rejects PDF content with .txt extension", () => {
    const pdfBuffer = Buffer.from("%PDF-1.4 fake content", "ascii");
    const result = validateFileType(pdfBuffer, "txt");

    expect(result.valid).toBe(false);
    expect(result.detectedType).toBe("pdf");
  });

  it("accepts valid TXT (ASCII)", () => {
    const txtBuffer = Buffer.from(
      "Hello, this is plain text content.",
      "utf-8",
    );
    const result = validateFileType(txtBuffer, "txt");

    expect(result.valid).toBe(true);
    expect(result.detectedType).toBe("txt");
  });

  it("accepts valid TXT (UTF-8 unicode)", () => {
    const txtBuffer = Buffer.from("Привет мир! 你好世界!", "utf-8");
    const result = validateFileType(txtBuffer, "txt");

    expect(result.valid).toBe(true);
    expect(result.detectedType).toBe("txt");
  });

  it("rejects ZIP file declared as EPUB without epub mimetype", () => {
    // Minimal ZIP header without epub mimetype
    const zipHeader = Buffer.from([
      0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00,
    ]);
    const result = validateFileType(zipHeader, "epub");

    expect(result.valid).toBe(false);
  });

  it("detects binary garbage as unknown", () => {
    const binaryBuffer = Buffer.from([
      0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
    ]);
    const detected = detectFileType(binaryBuffer);

    expect(detected).toBe("unknown");
  });

  it("detects empty buffer as unknown", () => {
    const emptyBuffer = Buffer.alloc(0);
    const detected = detectFileType(emptyBuffer);

    expect(detected).toBe("unknown");
  });
});
