import { extractText } from "../../utils/textParser";
import type { PageText } from "../../utils/textParser";

/**
 * GET /api/tests/text-parser
 *
 * Unit tests for the text parser (PageText[] return type).
 */
export default defineEventHandler(async () => {
  const results: { name: string; passed: boolean; detail: string }[] = [];

  // Test 1: TXT extraction returns PageText[]
  try {
    const content = "Hello, World! This is a test book content.";
    const buffer = Buffer.from(content, "utf-8");
    const pages: PageText[] = await extractText(buffer, "test.txt");
    const passed =
      pages.length === 1 &&
      pages[0]!.pageNumber === 1 &&
      pages[0]!.text === content;
    results.push({
      name: "TXT extraction → PageText[]",
      passed,
      detail: `pages: ${pages.length}, pageNum: ${pages[0]?.pageNumber}, text: "${pages[0]?.text.slice(0, 40)}"`,
    });
  } catch (e: any) {
    results.push({
      name: "TXT extraction → PageText[]",
      passed: false,
      detail: e.message,
    });
  }

  // Test 2: TXT with unicode
  try {
    const content = "Привет мир! 你好世界! مرحبا بالعالم";
    const buffer = Buffer.from(content, "utf-8");
    const pages = await extractText(buffer, "unicode-book.txt");
    const passed = pages.length === 1 && pages[0]!.text === content;
    results.push({
      name: "TXT with unicode",
      passed,
      detail: `pages: ${pages.length}, text: "${pages[0]?.text.slice(0, 40)}"`,
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

  // Test 4: Empty TXT returns empty array
  try {
    const buffer = Buffer.from("", "utf-8");
    const pages = await extractText(buffer, "empty.txt");
    results.push({
      name: "Empty TXT → empty array",
      passed: pages.length === 0,
      detail: `pages: ${pages.length}`,
    });
  } catch (e: any) {
    results.push({
      name: "Empty TXT → empty array",
      passed: false,
      detail: e.message,
    });
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
