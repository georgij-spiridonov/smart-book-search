import { describe, it, expect } from "vitest";
import { normalizePageText } from "../utils/textNormalizer";

describe("textNormalizer", () => {
  it("merges broken mid-sentence lines", () => {
    const input = "This is a sentence that\ncontinues on the next line.";
    const output = normalizePageText(input);
    expect(output).toBe("This is a sentence that continues on the next line.");
  });

  it("preserves paragraph breaks (double newlines)", () => {
    const input = "First paragraph.\n\nSecond paragraph.";
    const output = normalizePageText(input);
    expect(output).toContain("First paragraph.");
    expect(output).toContain("Second paragraph.");
    expect(output).toContain("\n");
  });

  it("keeps complete sentences on separate lines", () => {
    const input = "First sentence.\nSecond sentence.";
    const output = normalizePageText(input);
    // After a sentence terminator, lines should NOT merge
    expect(output).not.toBe("First sentence. Second sentence.");
  });

  it("handles hyphenated line breaks", () => {
    const input = "This is a hyph-\nenated word.";
    const output = normalizePageText(input);
    expect(output).toContain("hyph-");
    expect(output).toContain("enated");
  });

  it("collapses excessive newlines", () => {
    const input = "Text.\n\n\n\n\nMore text.";
    const output = normalizePageText(input);
    expect(output).not.toContain("\n\n\n");
  });
});
