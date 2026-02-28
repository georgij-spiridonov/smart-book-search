import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "turso",
  schema: "./server/db/schema.ts",
  out: "./server/db/migrations/sqlite",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL || "file:.data/hub/data.sqlite",
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});
