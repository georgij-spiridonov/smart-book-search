import { serve } from "inngest/nuxt";
import { inngest, vectorizeBook } from "../utils/inngest";

const isProductionEnvironment = process.env.NODE_ENV === "production";

export default defineEventHandler(
  serve({
    client: inngest,
    // Требуем ключ подписи только в production-окружении, чтобы не блокировать локальный Dev Server
    signingKey: isProductionEnvironment ? process.env.INNGEST_SIGNING_KEY : undefined,
    functions: [vectorizeBook],
  }),
);
