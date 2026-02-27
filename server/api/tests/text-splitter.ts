import { splitText, splitPages } from "../../utils/textSplitter";
import type { PageText } from "../../utils/textParser";

/**
 * GET /api/tests/text-splitter
 *
 * Unit test: verifies that the text splitter correctly chunks text
 * with expected overlap and sizing behavior.
 */
export default defineEventHandler(async () => {
  const results: { name: string; passed: boolean; detail: string }[] = [];

  // Test 1: Short text should produce a single chunk
  try {
    const short = "Hello, this is a short sentence.";
    const chunks = splitText(short);
    const passed = chunks.length === 1 && chunks[0]!.text.includes("Hello");
    results.push({
      name: "Short text → single chunk",
      passed,
      detail: `chunks: ${chunks.length}, text: "${chunks[0]?.text.slice(0, 50)}"`,
    });
  } catch (e: unknown) {
    results.push({
      name: "Short text → single chunk",
      passed: false,
      detail: (e as Error).message,
    });
  }

  // Test 2: Long text should produce multiple chunks
  try {
    const paragraph = "Lorem ipsum dolor sit amet. ".repeat(200); // ~5600 chars
    const chunks = splitText(paragraph);
    const passed = chunks.length > 1;
    results.push({
      name: "Long text → multiple chunks",
      passed,
      detail: `chunks: ${chunks.length}, avgLen: ${Math.round(paragraph.length / chunks.length)}`,
    });
  } catch (e: unknown) {
    results.push({
      name: "Long text → multiple chunks",
      passed: false,
      detail: (e as Error).message,
    });
  }

  // Test 3: Chunks should respect approximate size limit
  try {
    const paragraph =
      "This is a test sentence with some meaningful content. ".repeat(100);
    const chunks = splitText(paragraph, { chunkSize: 500, chunkOverlap: 100 });
    const maxLen = Math.max(...chunks.map((c) => c.text.length));
    // Allow up to 1.5x chunk size due to overlap merging
    const passed = maxLen <= 500 * 1.5;
    results.push({
      name: "Chunk size within bounds",
      passed,
      detail: `maxChunkLen: ${maxLen}, limit: ${500 * 1.5}`,
    });
  } catch (e: unknown) {
    results.push({
      name: "Chunk size within bounds",
      passed: false,
      detail: (e as Error).message,
    });
  }

  // Test 4: chunkIndex should be sequential
  try {
    const text = "Word ".repeat(500);
    const chunks = splitText(text);
    const indices = chunks.map((c) => c.chunkIndex);
    const isSequential = indices.every((val, idx) => val === idx);
    results.push({
      name: "Sequential chunkIndex",
      passed: isSequential,
      detail: `indices: [${indices.slice(0, 5).join(", ")}...]`,
    });
  } catch (e: unknown) {
    results.push({
      name: "Sequential chunkIndex",
      passed: false,
      detail: (e as Error).message,
    });
  }

  // Test 5: splitPages should propagate title and pageNumber
  try {
    const pages: PageText[] = [
      { pageNumber: 1, text: "Content of Chapter 1", title: "Chapter 1" },
      { pageNumber: 2, text: "Content of Chapter 2", title: "Chapter 2" },
    ];
    const chunks = splitPages(pages);
    const passed =
      chunks.length === 2 &&
      chunks[0]!.pageNumber === 1 &&
      chunks[0]!.title === "Chapter 1" &&
      chunks[1]!.pageNumber === 2 &&
      chunks[1]!.title === "Chapter 2";
    results.push({
      name: "splitPages propagates metadata",
      passed,
      detail: `chunks: ${chunks.length}, c0Title: "${chunks[0]?.title}", c1Title: "${chunks[1]?.title}"`,
    });
  } catch (e: unknown) {
    results.push({
      name: "splitPages propagates metadata",
      passed: false,
      detail: (e as Error).message,
    });
  }

  // Test 6: Empty text should produce no chunks
  try {
    const chunks = splitText("");
    results.push({
      name: "Empty text → no chunks",
      passed: chunks.length === 0,
      detail: `chunks: ${chunks.length}`,
    });
  } catch (e: unknown) {
    results.push({
      name: "Empty text → no chunks",
      passed: false,
      detail: (e as Error).message,
    });
  }

  const allPassed = results.every((r) => r.passed);

  return {
    status: allPassed ? "success" : "failure",
    message: allPassed
      ? `All ${results.length} text splitter tests passed!`
      : `${results.filter((r) => !r.passed).length} of ${results.length} tests failed.`,
    tests: results,
  };
});
