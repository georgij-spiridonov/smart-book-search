import { db, schema } from "hub:db";
import { publishEvent } from "../../utils/events";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = session.user?.id || session.id;

  if (!userId) {
    throw createError({ statusCode: 401, message: "Не авторизован" });
  }

  const requestBody = await readBody(event);
  const associatedBookIds = Array.isArray(requestBody.bookIds) ? requestBody.bookIds : [];
  const newChatId = crypto.randomUUID();

  // Логика повторных попыток для операций с базой данных
  async function performDatabaseInsertWithRetry() {
    let remainingRetries = 3;
    let delayMilliseconds = 500;
    
    while (remainingRetries > 0) {
      try {
        return await db.insert(schema.chats).values({
          id: newChatId,
          title: "",
          userId: userId as string,
          bookIds: associatedBookIds,
        });
      } catch (databaseError) {
        remainingRetries--;
        if (remainingRetries === 0) throw databaseError;
        await new Promise(resolve => setTimeout(resolve, delayMilliseconds));
        delayMilliseconds *= 2; 
      }
    }
  }

  await performDatabaseInsertWithRetry();

  // Уведомляем клиента о новом чате
  await publishEvent(userId as string, "chat:updated", {
    chatId: newChatId,
    status: "created",
  });

  return { id: newChatId };
});
