import { serve } from "inngest/nuxt";
import { inngest, vectorizeBook } from "../utils/inngest";

const isProd = process.env.NODE_ENV === "production";

export default defineEventHandler(
  serve({
    client: inngest,
    // Only enforce signing key in production to avoid blocking local Dev Server
    signingKey: isProd ? process.env.INNGEST_SIGNING_KEY : undefined,
    functions: [vectorizeBook],
  }),
);
