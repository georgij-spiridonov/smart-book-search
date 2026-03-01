import { db, schema } from "hub:db";
import { and, asc, eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = session.user?.id || session.id;

  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }

  const { id } = getRouterParams(event);

  // If admin, we search by ID only; otherwise we require ownership.
  const whereClause = session.user?.isAdmin
    ? eq(schema.chats.id, id as string)
    : and(eq(schema.chats.id, id as string), eq(schema.chats.userId, userId));

  const chat = await db.query.chats.findFirst({
    where: whereClause,
    with: {
      messages: {
        orderBy: () => asc(schema.messages.createdAt),
      },
    },
  });

  if (!chat) {
    throw createError({ statusCode: 404, statusMessage: "Chat not found" });
  }

  return chat;
});
