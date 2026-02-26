export default defineEventHandler(async (event) => {
  try {
    const { list } = await import("@vercel/blob");

    const config = useRuntimeConfig();

    // Attempt to list blobs to verify the token works
    const response = await list({
      token: config.blobToken,
    });

    return {
      status: "success",
      message: "Vercel Blob storage is accessible!",
    };
  } catch (error: any) {
    return {
      status: "error",
      message: "Failed to access Vercel Blob storage",
      error: error.message,
    };
  }
});
