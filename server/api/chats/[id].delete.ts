import { db, schema } from "hub:db";
import { and, eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = session.user?.id || session.id;

  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }
  const { id } = getRouterParams(event);

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Bad Request: Missing id parameter",
    });
  }

  const [deletedChat] = await db
    .delete(schema.chats)
    .where(and(eq(schema.chats.id, id), eq(schema.chats.userId, userId)))
    .returning();

  if (!deletedChat) {
    throw createError({
      statusCode: 404,
      statusMessage: "Chat not found",
    });
  }

  return [deletedChat];
});
