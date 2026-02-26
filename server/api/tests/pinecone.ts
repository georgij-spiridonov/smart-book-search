import { Pinecone } from "@pinecone-database/pinecone";

export default defineEventHandler(async (event) => {
  try {
    const config = useRuntimeConfig();

    if (
      !config.pineconeApiKey ||
      !config.pineconeIndex ||
      !config.pineconeHost
    ) {
      throw new Error(
        "Missing Pinecone configuration (PINECONE_API_KEY, PINECONE_INDEX, or PINECONE_HOST).",
      );
    }

    const pc = new Pinecone({
      apiKey: config.pineconeApiKey,
    });

    const indexName = config.pineconeIndex;
    const index = pc.index(indexName);

    // Attempt to get stats to verify the connection and index existence
    const stats = await index.describeIndexStats();

    return {
      status: "success",
      message: "Pinecone Database is accessible!",
    };
  } catch (error: any) {
    return {
      status: "error",
      message: "Failed to access Pinecone Database",
      error: error.message,
    };
  }
});
