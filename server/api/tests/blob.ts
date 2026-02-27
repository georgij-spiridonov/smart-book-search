export default defineEventHandler(async (_event) => {
  try {
    const { list } = await import("@vercel/blob");

    const config = useRuntimeConfig();

    // Attempt to list blobs to verify the token works
    const _response = await list({
      token: config.blobToken,
    });

    return {
      status: "success",
      message: "Vercel Blob storage is accessible!",
    };
  } catch (error: unknown) {
    return {
      status: "error",
      message: "Failed to access Vercel Blob storage",
      error: error instanceof Error ? error.message : String(error),
    };
  }
});
