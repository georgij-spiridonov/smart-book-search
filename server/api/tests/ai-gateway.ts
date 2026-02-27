export default defineEventHandler(async (_event) => {
  try {
    const config = useRuntimeConfig();

    if (!config.aiGatewayApiKey) {
      throw new Error("Missing AI Gateway configuration (AI_GATEWAY_API_KEY).");
    }

    return {
      status: "success",
      message: "Vercel AI Gateway key is loaded and accessible!",
    };
  } catch (error: unknown) {
    return {
      status: "error",
      message: "Failed to verify AI Gateway configuration",
      error: error instanceof Error ? error.message : String(error),
    };
  }
});
