import process from "process";

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  future: {
    compatibilityVersion: 4,
  },
  devtools: {
    enabled: true,

    timeline: {
      enabled: true,
    },
  },
  modules: [
    "@nuxt/ui",
    "@nuxt/eslint",
    "@nuxthub/core",
    "nuxt-auth-utils",
    "@nuxtjs/i18n",
    "@nuxtjs/mdc",
  ],
  css: ["~/assets/css/main.css"],
  i18n: {
    locales: [
      {
        code: "ru",
        file: "ru.json",
        name: "Русский",
      },
    ],
    langDir: "locales",
    defaultLocale: "ru",
    strategy: "no_prefix",
  },
  mdc: {
    headings: {
      anchorLinks: false,
    },
    highlight: {
      shikiEngine: "javascript",
    },
  },
  experimental: {
    viewTransition: true,
  },
  hub: {
    db: "sqlite",
  },
  vite: {
    optimizeDeps: {
      include: ["striptags"],
    },
  },
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
