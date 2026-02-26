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
  },
});
