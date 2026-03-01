import { db, schema } from "hub:db";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = session.user?.id || session.id;

  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }

  const body = await readBody(event);
  const bookIds = Array.isArray(body.bookIds) ? body.bookIds : [];
  const chatId = crypto.randomUUID();

  await db.insert(schema.chats).values({
    id: chatId,
    title: "",
    userId: userId,
    bookIds,
  });

  return { id: chatId };
});
