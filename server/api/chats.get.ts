import { db, schema } from "hub:db";
import { eq, desc } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);

  // Users without explicit login will have their session ID mapped to userId
  const userId = session.user?.id || session.id;

  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }

  // Admins see everything, regular users only see their own
  const whereClause = session.user?.isAdmin 
    ? undefined 
    : eq(schema.chats.userId, userId);

  return await db.query.chats.findMany({
    where: whereClause,
    orderBy: () => desc(schema.chats.createdAt),
  });
});
