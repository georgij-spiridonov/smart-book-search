import { normalizePageText } from "../../utils/textNormalizer";

/**
 * GET /api/tests/text-normalizer
 *
 * Unit tests for PDF line reconstruction.
 */
export default defineEventHandler(async () => {
  const results: { name: string; passed: boolean; detail: string }[] = [];

  // Test 1: Merge broken lines
  try {
    const input = "This is a sentence that\ncontinues on the next line.";
    const output = normalizePageText(input);
    const passed =
      output === "This is a sentence that continues on the next line.";
    results.push({
      name: "Merge broken mid-sentence lines",
      passed,
      detail: `output: "${output.slice(0, 60)}"`,
    });
  } catch (e: any) {
    results.push({
      name: "Merge broken lines",
      passed: false,
      detail: e.message,
    });
  }

  // Test 2: Preserve paragraph boundaries
  try {
    const input = "First paragraph.\n\nSecond paragraph.";
    const output = normalizePageText(input);
    const passed =
      output.includes("First paragraph.") &&
      output.includes("Second paragraph.") &&
      output.includes("\n");
    results.push({
      name: "Preserve paragraph breaks",
      passed,
      detail: `output: "${output.slice(0, 60)}"`,
    });
  } catch (e: any) {
    results.push({
      name: "Preserve paragraph breaks",
      passed: false,
      detail: e.message,
    });
  }

  // Test 3: Complete sentences stay separate
  try {
    const input = "First sentence.\nSecond sentence.";
    const output = normalizePageText(input);
    // After a sentence terminator, lines should NOT merge
    const passed = !output.includes("First sentence. Second sentence.");
    results.push({
      name: "Complete sentences stay on separate lines",
      passed,
      detail: `output: "${output.slice(0, 60)}"`,
    });
  } catch (e: any) {
    results.push({
      name: "Complete sentences stay separate",
      passed: false,
      detail: e.message,
    });
  }

  // Test 4: Handle hyphenated words
  try {
    const input = "This is a hyph-\nenated word.";
    const output = normalizePageText(input);
    const passed = output.includes("hyph-") && output.includes("enated");
    results.push({
      name: "Handle hyphenated line breaks",
      passed,
      detail: `output: "${output.slice(0, 60)}"`,
    });
  } catch (e: any) {
    results.push({
      name: "Handle hyphenated line breaks",
      passed: false,
      detail: e.message,
    });
  }

  // Test 5: Collapse excessive newlines
  try {
    const input = "Text.\n\n\n\n\nMore text.";
    const output = normalizePageText(input);
    const passed = !output.includes("\n\n\n");
    results.push({
      name: "Collapse excessive newlines",
      passed,
      detail: `newlines collapsed: ${!output.includes("\n\n\n")}`,
    });
  } catch (e: any) {
    results.push({
      name: "Collapse excessive newlines",
      passed: false,
      detail: e.message,
    });
  }

  const allPassed = results.every((r) => r.passed);

  return {
    status: allPassed ? "success" : "failure",
    message: allPassed
      ? `All ${results.length} normalizer tests passed!`
      : `${results.filter((r) => !r.passed).length} of ${results.length} tests failed.`,
    tests: results,
  };
});
