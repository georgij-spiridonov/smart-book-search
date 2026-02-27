/**
 * GET /api/tests/run-all
 *
 * Runs all other tests in this directory to conveniently verify
 * the health of all systems and the validity of core application logic.
 */

interface TestEndpointResponse {
  status: string;
  message: string;
  error?: string;
}

// Explicit list of test endpoints.
// import.meta.glob is a Vite-only API that is NOT available in Nuxt server
// routes at runtime, so we enumerate the endpoints manually instead.
const testEndpoints = [
  "/api/tests/ai-gateway",
  "/api/tests/blob",
  "/api/tests/books-list",
  "/api/tests/redis-stores",
  "/api/tests/file-validator",
  "/api/tests/pinecone",
  "/api/tests/rate-limit",
  "/api/tests/text-normalizer",
  "/api/tests/text-parser",
  "/api/tests/text-splitter",
  "/api/tests/vectorize-pipeline",
  "/api/tests/inngest-check",
  "/api/tests/inngest-e2e",
  "/api/tests/chat-pipeline",
  "/api/tests/chat-validation",
];

export default defineEventHandler(async (event) => {
  const results = await Promise.all(
    testEndpoints.map(async (testPath) => {
      const startTime = Date.now();
      try {
        // Use Nitro's internal $fetch to call the endpoint natively without actual HTTP overhead
        // We pass the host header so that internal tests can construct their own full URLs if needed
        const response = await $fetch<TestEndpointResponse>(testPath, {
          headers: {
            host: getRequestHeader(event, "host") || "localhost:3000",
          },
        });
        const duration = Date.now() - startTime;

        return {
          endpoint: testPath,
          status: response?.status || "unknown",
          message: response?.message || "",
          durationMs: duration,
        };
      } catch (e: unknown) {
        const duration = Date.now() - startTime;
        return {
          endpoint: testPath,
          status: "error",
          message: e instanceof Error ? e.message : String(e),
          durationMs: duration,
        };
      }
    }),
  );

  const allPassed = results.every(
    (r) => r.status === "success" || r.status === "ok",
  );

  return {
    status: allPassed ? "success" : "failure",
    message: allPassed
      ? `All ${testEndpoints.length} test suites passed!`
      : `${results.filter((r) => r.status !== "success").length} test suites failed.`,
    totalDurationMs: results.reduce((acc, curr) => acc + curr.durationMs, 0),
    results,
  };
});
