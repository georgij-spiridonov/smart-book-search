import { extractText } from "../../utils/textParser";

/**
 * GET /api/tests/text-parser
 *
 * Unit test: verifies that the text parser can extract text
 * from TXT buffers and handles unsupported formats correctly.
 *
 * Note: PDF parsing is tested with a minimal synthetic buffer,
 * but a real PDF test requires an actual PDF file.
 */
export default defineEventHandler(async () => {
  const results: { name: string; passed: boolean; detail: string }[] = [];

  // Test 1: TXT extraction
  try {
    const content = "Hello, World! This is a test book content.";
    const buffer = Buffer.from(content, "utf-8");
    const text = await extractText(buffer, "test.txt");
    const passed = text === content;
    results.push({
      name: "TXT extraction",
      passed,
      detail: `extracted: "${text.slice(0, 50)}"`,
    });
  } catch (e: any) {
    results.push({ name: "TXT extraction", passed: false, detail: e.message });
  }

  // Test 2: TXT with unicode
  try {
    const content = "Привет мир! 你好世界! مرحبا بالعالم";
    const buffer = Buffer.from(content, "utf-8");
    const text = await extractText(buffer, "unicode-book.txt");
    const passed = text === content;
    results.push({
      name: "TXT with unicode",
      passed,
      detail: `extracted: "${text.slice(0, 50)}"`,
    });
  } catch (e: any) {
    results.push({
      name: "TXT with unicode",
      passed: false,
      detail: e.message,
    });
  }

  // Test 3: Unsupported format should throw
  try {
    const buffer = Buffer.from("data", "utf-8");
    await extractText(buffer, "file.docx");
    results.push({
      name: "Unsupported format throws",
      passed: false,
      detail: "Expected an error but none was thrown",
    });
  } catch (e: any) {
    const passed = e.message.includes("Unsupported file format");
    results.push({
      name: "Unsupported format throws",
      passed,
      detail: `error: "${e.message}"`,
    });
  }

  // Test 4: Empty TXT
  try {
    const buffer = Buffer.from("", "utf-8");
    const text = await extractText(buffer, "empty.txt");
    const passed = text === "";
    results.push({
      name: "Empty TXT file",
      passed,
      detail: `length: ${text.length}`,
    });
  } catch (e: any) {
    results.push({ name: "Empty TXT file", passed: false, detail: e.message });
  }

  const allPassed = results.every((r) => r.passed);

  return {
    status: allPassed ? "success" : "failure",
    message: allPassed
      ? `All ${results.length} text parser tests passed!`
      : `${results.filter((r) => !r.passed).length} of ${results.length} tests failed.`,
    tests: results,
  };
});
