import { addBook, deleteBook } from "../../utils/bookStore";

export default defineEventHandler(async (event) => {
  const results: { name: string; passed: boolean; detail: string }[] = [];
  const origin = getRequestURL(event).origin;

  // Setup: Create a dummy book record
  await addBook({
    id: "test-book-validation",
    title: "Test Book",
    author: "Test Author",
    coverUrl: "",
    blobUrl: "https://example.com/test-book.pdf",
    filename: "test-book.pdf",
    fileSize: 1024,
    uploadedAt: Date.now(),
    vectorized: true,
  });

  const runTest = async (
    name: string,
    body: Record<string, any>,
    expectedStatus: number,
  ) => {
    try {
      const response = await globalThis.$fetch.raw(`/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        ignoreResponseError: true,
      });

      const passed = response.status === expectedStatus;
      let detail = `Status: ${response.status} (expected ${expectedStatus})`;

      if (!passed && response.status === 400) {
        const error = response._data as { message?: string };
        detail += `. Error: ${error.message || "Unknown error"}`;
      }

      results.push({ name, passed, detail });
    } catch (e: unknown) {
      results.push({ name, passed: false, detail: (e as Error).message });
    }
  };

  // 1. Valid request
  await runTest(
    "Valid request",
    {
      query: "Test query",
      bookIds: ["test-book-validation"],
      history: [],
    },
    200,
  );

  // 2. Missing query
  await runTest(
    "Missing query",
    {
      bookIds: ["test-book-validation"],
      history: [],
    },
    400,
  );

  // 3. Empty bookIds
  await runTest(
    "Empty bookIds",
    {
      query: "Test",
      bookIds: [],
      history: [],
    },
    400,
  );

  // 4. Invalid history role
  await runTest(
    "Invalid history role",
    {
      query: "Test",
      bookIds: ["test-book-validation"],
      history: [{ role: "system", content: "Invalid role" }],
    },
    400,
  );

  // 5. Invalid history content (empty)
  await runTest(
    "Empty history content",
    {
      query: "Test",
      bookIds: ["test-book-validation"],
      history: [{ role: "user", content: "" }],
    },
    400,
  );

  // 6. Book not found
  await runTest(
    "Book not found",
    {
      query: "Test",
      bookIds: ["non-existent-book"],
      history: [],
    },
    404, // Expecting 404 when book is not found
  );

  // Teardown
  await deleteBook("test-book-validation");

  const allPassed = results.every((r) => r.passed);

  return {
    status: allPassed ? "success" : "failure",
    message: allPassed
      ? "All validation tests passed"
      : `${results.filter((r) => !r.passed).length} of ${results.length} tests failed.`,
    tests: results,
  };
});
