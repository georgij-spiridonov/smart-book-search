import { db, schema } from "hub:db";
import { publishEvent } from "../../utils/events";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = session.user?.id || session.id;

  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }

  const body = await readBody(event);
  const bookIds = Array.isArray(body.bookIds) ? body.bookIds : [];
  const chatId = crypto.randomUUID();

  // Simple retry logic for DB operations
  async function performInsert() {
    let retries = 3;
    while (retries > 0) {
      try {
        return await db.insert(schema.chats).values({
          id: chatId,
          title: "",
          userId: userId,
          bookIds,
        });
      } catch (err) {
        retries--;
        if (retries === 0) throw err;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  await performInsert();

  // Notify client about new chat
  await publishEvent(userId, "chat:updated", {
    chatId,
    status: "created",
  });

  return { id: chatId };
});
