import { validateFileType, detectFileType } from "../../utils/fileValidator";

/**
 * GET /api/tests/file-validator
 *
 * Unit tests for magic-bytes file validation.
 */
export default defineEventHandler(async () => {
  const results: { name: string; passed: boolean; detail: string }[] = [];

  // Test 1: Valid PDF header
  try {
    const pdfBuffer = Buffer.from("%PDF-1.4 fake content", "ascii");
    const result = validateFileType(pdfBuffer, "pdf");
    results.push({
      name: "Valid PDF header",
      passed: result.valid && result.detectedType === "pdf",
      detail: `valid=${result.valid}, detected=${result.detectedType}`,
    });
  } catch (e: unknown) {
    results.push({
      name: "Valid PDF header",
      passed: false,
      detail: (e as Error).message,
    });
  }

  // Test 2: PDF mismatch — PDF content but .txt extension
  try {
    const pdfBuffer = Buffer.from("%PDF-1.4 fake content", "ascii");
    const result = validateFileType(pdfBuffer, "txt");
    results.push({
      name: "PDF content with .txt extension → reject",
      passed: !result.valid && result.detectedType === "pdf",
      detail: `valid=${result.valid}, msg=${result.message}`,
    });
  } catch (e: unknown) {
    results.push({
      name: "PDF content with .txt extension",
      passed: false,
      detail: (e as Error).message,
    });
  }

  // Test 3: Valid TXT (plain ASCII)
  try {
    const txtBuffer = Buffer.from(
      "Hello, this is plain text content.",
      "utf-8",
    );
    const result = validateFileType(txtBuffer, "txt");
    results.push({
      name: "Valid TXT (ASCII)",
      passed: result.valid && result.detectedType === "txt",
      detail: `valid=${result.valid}, detected=${result.detectedType}`,
    });
  } catch (e: unknown) {
    results.push({
      name: "Valid TXT (ASCII)",
      passed: false,
      detail: (e as Error).message,
    });
  }

  // Test 4: Valid TXT (UTF-8 unicode)
  try {
    const txtBuffer = Buffer.from("Привет мир! 你好世界!", "utf-8");
    const result = validateFileType(txtBuffer, "txt");
    results.push({
      name: "Valid TXT (UTF-8 unicode)",
      passed: result.valid && result.detectedType === "txt",
      detail: `valid=${result.valid}, detected=${result.detectedType}`,
    });
  } catch (e: unknown) {
    results.push({
      name: "Valid TXT (UTF-8 unicode)",
      passed: false,
      detail: (e as Error).message,
    });
  }

  // Test 5: ZIP file declared as EPUB → unknown (no epub mimetype)
  try {
    // Minimal ZIP header without epub mimetype
    const zipHeader = Buffer.from([
      0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00,
    ]);
    const result = validateFileType(zipHeader, "epub");
    results.push({
      name: "ZIP without EPUB mimetype → reject",
      passed: !result.valid,
      detail: `valid=${result.valid}, detected=${result.detectedType}`,
    });
  } catch (e: unknown) {
    results.push({
      name: "ZIP without EPUB mimetype",
      passed: false,
      detail: (e as Error).message,
    });
  }

  // Test 6: Binary garbage → unknown
  try {
    const binaryBuffer = Buffer.from([
      0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
    ]);
    const detected = detectFileType(binaryBuffer);
    results.push({
      name: "Binary garbage → unknown",
      passed: detected === "unknown",
      detail: `detected=${detected}`,
    });
  } catch (e: unknown) {
    results.push({
      name: "Binary garbage → unknown",
      passed: false,
      detail: (e as Error).message,
    });
  }

  // Test 7: Empty buffer → unknown
  try {
    const emptyBuffer = Buffer.alloc(0);
    const detected = detectFileType(emptyBuffer);
    results.push({
      name: "Empty buffer → unknown",
      passed: detected === "unknown",
      detail: `detected=${detected}`,
    });
  } catch (e: unknown) {
    results.push({
      name: "Empty buffer → unknown",
      passed: false,
      detail: (e as Error).message,
    });
  }

  const allPassed = results.every((r) => r.passed);

  return {
    status: allPassed ? "success" : "failure",
    message: allPassed
      ? `All ${results.length} file validator tests passed!`
      : `${results.filter((r) => !r.passed).length} of ${results.length} tests failed.`,
    tests: results,
  };
});
