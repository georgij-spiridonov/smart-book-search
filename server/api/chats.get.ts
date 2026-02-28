import { db, schema } from "hub:db";
import { eq, desc } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);

  // Users without explicit login will have their session ID mapped to userId
  const userId = session.user?.id || session.id;

  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }

  return await db.query.chats.findMany({
    where: () => eq(schema.chats.userId, userId),
    orderBy: () => desc(schema.chats.createdAt),
  });
});
