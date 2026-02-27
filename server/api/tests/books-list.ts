import {
  addBook,
  getBook,
  getAllBooks,
  updateBook,
  deleteBook,
  markBookVectorized,
  slugifyBookId,
  type BookRecord,
} from "../../utils/bookStore";

/**
 * GET /api/tests/books-list
 *
 * Integration test for the book store (Upstash Redis).
 * Verifies CRUD operations: add, get, list, update, mark vectorized.
 * Cleans up test data after completion.
 */
export default defineEventHandler(async () => {
  const results: { name: string; passed: boolean; detail: string }[] = [];

  const testBookId = `__test-book-${Date.now()}`;
  const testBook: BookRecord = {
    id: testBookId,
    title: "Test Book Title",
    author: "Test Author",
    coverUrl: "https://example.com/cover.jpg",
    blobUrl: "https://example.com/test.txt",
    filename: "test.txt",
    fileSize: 1024,
    uploadedAt: Date.now(),
    vectorized: false,
  };

  try {
    // --- Test 1: slugifyBookId ---
    try {
      const slug = slugifyBookId("My Great Book! (2024)");
      const passed = slug === "my-great-book-2024";
      results.push({
        name: "slugifyBookId",
        passed,
        detail: `Input: "My Great Book! (2024)" → "${slug}"`,
      });
    } catch (e: unknown) {
      results.push({
        name: "slugifyBookId",
        passed: false,
        detail: (e as Error).message,
      });
    }

    // --- Test 2: addBook + getBook ---
    try {
      await addBook(testBook);
      const fetched = await getBook(testBookId);
      const passed =
        fetched !== null &&
        fetched.id === testBookId &&
        fetched.title === "Test Book Title" &&
        fetched.author === "Test Author" &&
        fetched.coverUrl === "https://example.com/cover.jpg" &&
        fetched.vectorized === false;

      results.push({
        name: "addBook + getBook",
        passed,
        detail: fetched
          ? `id=${fetched.id}, author=${fetched.author}, vectorized=${fetched.vectorized}`
          : "Book not found after add",
      });
    } catch (e: unknown) {
      results.push({
        name: "addBook + getBook",
        passed: false,
        detail: (e as Error).message,
      });
    }

    // --- Test 3: getAllBooks includes test book ---
    try {
      const books = await getAllBooks();
      const found = books.find((b) => b.id === testBookId);
      results.push({
        name: "getAllBooks",
        passed: !!found,
        detail: `Total books: ${books.length}, test book found: ${!!found}`,
      });
    } catch (e: unknown) {
      results.push({
        name: "getAllBooks",
        passed: false,
        detail: (e as Error).message,
      });
    }

    // --- Test 4: updateBook ---
    try {
      await updateBook(testBookId, {
        author: "Updated Author",
        coverUrl: "https://example.com/new-cover.jpg",
      });
      const updated = await getBook(testBookId);
      const passed =
        updated !== null &&
        updated.author === "Updated Author" &&
        updated.coverUrl === "https://example.com/new-cover.jpg";

      results.push({
        name: "updateBook",
        passed,
        detail: updated
          ? `author=${updated.author}, coverUrl=${updated.coverUrl}`
          : "Book not found after update",
      });
    } catch (e: unknown) {
      results.push({
        name: "updateBook",
        passed: false,
        detail: (e as Error).message,
      });
    }

    // --- Test 5: markBookVectorized ---
    try {
      await markBookVectorized(testBookId);
      const vectorized = await getBook(testBookId);
      const passed = vectorized !== null && vectorized.vectorized === true;

      results.push({
        name: "markBookVectorized",
        passed,
        detail: `vectorized=${vectorized?.vectorized}`,
      });
    } catch (e: unknown) {
      results.push({
        name: "markBookVectorized",
        passed: false,
        detail: (e as Error).message,
      });
    }

    // --- Test 6: getBookByBlobUrl (Reverse Index) ---
    try {
      const { getBookByBlobUrl } = await import("../../utils/bookStore");
      const found = await getBookByBlobUrl(testBook.blobUrl);
      const passed = found !== null && found.id === testBookId;

      results.push({
        name: "getBookByBlobUrl (O(1) index)",
        passed,
        detail: found
          ? `Found book ID "${found.id}" for blobUrl`
          : "Book not found by blobUrl",
      });
    } catch (e: unknown) {
      results.push({
        name: "getBookByBlobUrl",
        passed: false,
        detail: (e as Error).message,
      });
    }
  } finally {
    // Cleanup: remove test data from Redis using the helper
    try {
      await deleteBook(testBookId);
    } catch {
      // Ignore cleanup errors
    }
  }

  const allPassed = results.every((r) => r.passed);

  return {
    status: allPassed ? "success" : "failure",
    message: allPassed
      ? `All ${results.length} book store tests passed!`
      : `${results.filter((r) => !r.passed).length} of ${results.length} tests failed.`,
    tests: results,
  };
});
