export default defineEventHandler(async (event) => {
  try {
    const config = useRuntimeConfig();

    if (!config.aiGatewayApiKey) {
      throw new Error("Missing AI Gateway configuration (AI_GATEWAY_API_KEY).");
    }

    // Since AI Gateway usually wraps another provider and requires an endpoint URL to test effectively,
    // we simply verify that the key is successfully loaded from the environment.
    return {
      status: "success",
      message: "Vercel AI Gateway key is loaded and accessible!",
    };
  } catch (error: any) {
    return {
      status: "error",
      message: "Failed to verify AI Gateway configuration",
      error: error.message,
    };
  }
});
