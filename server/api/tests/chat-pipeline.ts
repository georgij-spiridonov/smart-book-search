import { CHAT_CONFIG } from "../../utils/chatConfig";
import { classifyQuery } from "../../utils/classifyQuery";
import { searchBookKnowledge } from "../../utils/retrieval";
import { generateAnswer } from "../../utils/generateAnswer";
import { addBook, deleteBook } from "../../utils/bookStore";

/**
 * GET /api/tests/chat-pipeline
 *
 * Integration test for the book chat pipeline.
 * Verifies: config, classifier, retrieval (with bookId), answer generation,
 * and the full pipeline response structure.
 */
export default defineEventHandler(async (event) => {
  const results: { name: string; passed: boolean; detail: string }[] = [];

  // Setup: Create a dummy book record
  await addBook({
    id: "test-book",
    title: "Test Book",
    author: "Test Author",
    coverUrl: "",
    blobUrl: "https://example.com/test-book.pdf",
    filename: "test-book.pdf",
    fileSize: 1024,
    uploadedAt: Date.now(),
    vectorized: true,
  });

  // --- Test 1: Config loads with all expected keys ---
  try {
    const requiredKeys = [
      "classifierModel",
      "answerModel",
      "retrievalLimit",
      "maxHistoryMessages",
      "classifierSystemPrompt",
      "answerSystemPrompt",
    ] as const;

    const missingKeys = requiredKeys.filter(
      (k) => !(k in CHAT_CONFIG) || !CHAT_CONFIG[k],
    );

    results.push({
      name: "Config validation",
      passed: missingKeys.length === 0,
      detail:
        missingKeys.length === 0
          ? `All ${requiredKeys.length} config keys present.`
          : `Missing keys: ${missingKeys.join(", ")}`,
    });
  } catch (e: unknown) {
    results.push({
      name: "Config validation",
      passed: false,
      detail: (e as Error).message,
    });
  }

  // --- Test 2: Classifier returns valid QueryType ---
  try {
    const qaResult = await classifyQuery(
      "Что означает понятие искусственного интеллекта?",
    );
    const qaValid =
      qaResult === "fragment_search" || qaResult === "question_answer";

    const searchResult = await classifyQuery(
      "Найди где в тексте говорится про нейронные сети",
    );
    const searchValid =
      searchResult === "fragment_search" || searchResult === "question_answer";

    results.push({
      name: "Query classifier",
      passed: qaValid && searchValid,
      detail: `QA query → "${qaResult}", Search query → "${searchResult}"`,
    });
  } catch (e: unknown) {
    results.push({
      name: "Query classifier",
      passed: false,
      detail: (e as Error).message,
    });
  }

  // --- Test 3: Retrieval returns chunks with bookId ---
  try {
    const chunks = await searchBookKnowledge(
      "artificial intelligence",
      ["test-book"],
      2,
    );

    // Check that the result is an array (may be empty if no test data exists)
    const isArray = Array.isArray(chunks);
    const hasBookIdField =
      chunks.length === 0 || chunks.every((c) => "bookId" in c);

    results.push({
      name: "Retrieval with bookId",
      passed: isArray && hasBookIdField,
      detail: `${chunks.length} chunk(s) returned. bookId field present: ${hasBookIdField}`,
    });
  } catch (e: unknown) {
    results.push({
      name: "Retrieval with bookId",
      passed: false,
      detail: (e as Error).message,
    });
  }

  // --- Test 4: Answer generation ---
  try {
    const mockChunks = [
      {
        text: "Artificial intelligence is a field of computer science focused on creating intelligent machines.",
        pageNumber: 1,
        chapterTitle: "Introduction",
        score: 0.95,
        bookId: "test-book",
      },
    ];

    const answer = await generateAnswer(
      "What is artificial intelligence?",
      mockChunks,
      [],
    );

    const hasText = typeof answer.text === "string" && answer.text.length > 0;
    const hasModel =
      typeof answer.model === "string" && answer.model.length > 0;

    results.push({
      name: "Answer generation",
      passed: hasText && hasModel,
      detail: `Model: ${answer.model}, answer length: ${answer.text.length} chars, inputTokens: ${answer.usage.inputTokens}`,
    });
  } catch (e: unknown) {
    results.push({
      name: "Answer generation",
      passed: false,
      detail: (e as Error).message,
    });
  }

  // --- Test 5: Full pipeline via /api/chat endpoint (streaming) ---
  try {
    const origin = getRequestURL(event).origin;
    const response = await globalThis.fetch(`${origin}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "What is artificial intelligence?",
        bookIds: ["test-book"],
        history: [],
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(
        `Request failed: ${response.status} ${response.statusText}`,
      );
    }

    // Read the full SSE stream as text
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let sseText = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      sseText += decoder.decode(value, { stream: true });
    }

    // Parse SSE data lines
    const dataLines = sseText
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => line.slice(6));

    const hasMeta = dataLines.some((line) => {
      try {
        const parsed = JSON.parse(line);
        return parsed.type === "data-meta";
      } catch {
        return false;
      }
    });

    const hasChunks = dataLines.some((line) => {
      try {
        const parsed = JSON.parse(line);
        return parsed.type === "data-chunks";
      } catch {
        return false;
      }
    });

    const hasTextDelta = dataLines.some((line) => {
      try {
        const parsed = JSON.parse(line);
        return parsed.type === "text-delta";
      } catch {
        return false;
      }
    });

    results.push({
      name: "Full pipeline (POST /api/chat — streaming)",
      passed: hasMeta && hasChunks && hasTextDelta,
      detail: `SSE parts — data-meta: ${hasMeta}, data-chunks: ${hasChunks}, text-delta: ${hasTextDelta}`,
    });
  } catch (e: unknown) {
    results.push({
      name: "Full pipeline (POST /api/chat — streaming)",
      passed: false,
      detail: (e as Error).message,
    });
  }

  // Teardown
  await deleteBook("test-book");

  // --- Summary ---
  const allPassed = results.every((r) => r.passed);

  return {
    status: allPassed ? "success" : "failure",
    message: allPassed
      ? `All ${results.length} chat pipeline tests passed!`
      : `${results.filter((r) => !r.passed).length} of ${results.length} tests failed.`,
    tests: results,
  };
});
