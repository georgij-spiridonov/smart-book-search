/**
 * GET /api/tests/inngest-check
 *
 * Checks if the Inngest endpoint is reachable and properly configured.
 */
export default defineEventHandler(async () => {
  try {
    // We can't easily trigger a function from here without credentials,
    // but we can check if the endpoint returns the Inngest configuration.
    const response = await $fetch<Record<string, unknown>>("/api/inngest");

    // Inngest /serve endpoint returns function_count on GET
    const count =
      typeof response?.function_count === "number"
        ? response.function_count
        : 0;

    return {
      status: "success",
      message: "Inngest endpoint is reachable.",
      detail: `Found ${count} registered function(s).`,
    };
  } catch (error: unknown) {
    return {
      status: "error",
      message: "Inngest endpoint check failed.",
      error: error instanceof Error ? error.message : String(error),
    };
  }
});
