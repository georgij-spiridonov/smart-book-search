import { db, schema } from "hub:db";
import { and, eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = session.user?.id || session.id;

  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }
  const { id } = getRouterParams(event);

  const chat = await db.query.chats.findFirst({
    where: () =>
      and(eq(schema.chats.id, id as string), eq(schema.chats.userId, userId)),
  });

  if (!chat) {
    throw createError({
      statusCode: 404,
      statusMessage: "Chat not found",
    });
  }

  return await db
    .delete(schema.chats)
    .where(
      and(eq(schema.chats.id, id as string), eq(schema.chats.userId, userId)),
    )
    .returning();
});
