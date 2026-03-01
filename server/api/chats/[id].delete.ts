import { db, schema } from "hub:db";
import { and, eq } from "drizzle-orm";

import { publishEvent } from "../../utils/events";

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

  // Find the chat first to know the owner for notification if admin is deleting
  const chatToCompare = await db.query.chats.findFirst({
    where: eq(schema.chats.id, id),
  });

  if (!chatToCompare) {
    throw createError({
      statusCode: 404,
      statusMessage: "Chat not found",
    });
  }

  // Ownership check
  if (!session.user?.isAdmin && chatToCompare.userId !== userId) {
    throw createError({
      statusCode: 403,
      statusMessage: "Forbidden: You can only delete your own chats.",
    });
  }

  const [deletedChat] = await db
    .delete(schema.chats)
    .where(eq(schema.chats.id, id))
    .returning();

  // Notify original owner about chat deletion
  const ownerId = deletedChat?.userId;
  if (ownerId) {
    await publishEvent(ownerId, "chat:updated", {
      deletedChatId: id,
    });
  }

  return [deletedChat];
});
