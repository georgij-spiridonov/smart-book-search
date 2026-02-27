// @ts-check
import withNuxt from "./.nuxt/eslint.config.mjs";

export default withNuxt(
  // Relaxed rules for test files (Vitest patterns)
  {
    files: ["server/__tests__/**/*.test.ts"],
    rules: {
      // vi.mock() must be called before imports in Vitest (hoisted)
      "import/first": "off",
      // Mock return types often need `as any`
      "@typescript-eslint/no-explicit-any": "off",
      // In-memory mock stores use dynamic delete
      "@typescript-eslint/no-dynamic-delete": "off",
    },
  },
);
