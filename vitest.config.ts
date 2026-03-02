import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { resolve } from "path";

export default defineConfig(({ mode }) => {
  // Load ALL env vars from .env (not just VITE_*) into process.env
  const env = loadEnv(mode, process.cwd(), "");

  return {
    test: {
      globals: true,
      environment: "node",
      include: ["server/__tests__/**/*.test.ts", "app/utils/__tests__/**/*.test.ts"],
      env,
    },
    resolve: {
      alias: {
        "~": resolve(__dirname, "."),
        "#imports": resolve(__dirname, ".nuxt/imports.d.ts"),
      },
    },
  };
});
