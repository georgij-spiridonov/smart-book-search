/**
 * PDF text normalizer — reconstructs broken lines from PDF extraction.
 *
 * pdfjs-dist extracts text line-by-line as laid out on the page.
 * This causes mid-sentence line breaks that hurt embedding quality.
 */

/**
 * Merge lines that were broken by PDF layout.
 * If a line does not end with a sentence terminator, merge it with the next line.
 */
export function normalizePageText(rawText: string): string {
  const lines = rawText.split("\n");
  const merged: string[] = [];
  let buffer = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      // Empty line = paragraph break
      if (buffer) {
        merged.push(buffer);
        buffer = "";
      }
      merged.push(""); // preserve paragraph boundary
      continue;
    }

    if (buffer) {
      // Check if previous buffer ended mid-sentence
      if (isMidSentence(buffer)) {
        // Merge: broken line continuation
        buffer += " " + trimmed;
      } else {
        // Previous line was complete sentence, start new
        merged.push(buffer);
        buffer = trimmed;
      }
    } else {
      buffer = trimmed;
    }
  }

  if (buffer) {
    merged.push(buffer);
  }

  return merged
    .join("\n")
    .replace(/\n{3,}/g, "\n\n") // collapse excessive newlines
    .trim();
}

/**
 * Check if text ends mid-sentence (no sentence terminator at the end).
 */
function isMidSentence(text: string): boolean {
  const trimmed = text.trimEnd();
  if (!trimmed) return false;

  const lastChar = trimmed[trimmed.length - 1]!;
  const terminators = new Set([
    ".",
    "!",
    "?",
    ":",
    ";",
    '"',
    "'",
    ")",
    "]",
    "»",
  ]);

  // Ends with a terminator → probably a complete sentence
  if (terminators.has(lastChar)) {
    return false;
  }

  // Ends with a dash or hyphen → word was hyphenated across lines
  if (lastChar === "-" || lastChar === "–" || lastChar === "—") {
    return true;
  }

  // Ends with a letter, digit, or comma → likely mid-sentence
  return true;
}
