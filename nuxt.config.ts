import process from "process";

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  future: {
    compatibilityVersion: 4,
  },
  devtools: { enabled: true },
  modules: ["@nuxt/eslint"],
  runtimeConfig: {
    blobToken: process.env.BOOKS_BLOB_READ_WRITE_TOKEN,
    aiGatewayApiKey: process.env.AI_GATEWAY_API_KEY,
    pineconeApiKey: process.env.PINECONE_API_KEY,
    pineconeIndex: process.env.PINECONE_INDEX,
    pineconeHost: process.env.PINECONE_HOST,
    upstashRedisUrl: process.env.KV_REST_API_URL,
    upstashRedisToken: process.env.KV_REST_API_TOKEN,
    inngestEventKey: process.env.INNGEST_EVENT_KEY,
    inngestSigningKey: process.env.INNGEST_SIGNING_KEY,
  },
});
