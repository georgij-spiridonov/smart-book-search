import { serve } from "inngest/nuxt";
import { inngest, vectorizeBook } from "../utils/inngest";

export default defineEventHandler((event) => {
  const config = useRuntimeConfig();
  const isProd = process.env.NODE_ENV === "production";
  
  return serve({
    client: inngest,
    // Only enforce signing key in production to avoid blocking local Dev Server
    signingKey: isProd ? config.inngestSigningKey : undefined,
    functions: [
      vectorizeBook,
    ],
  })(event);
});
