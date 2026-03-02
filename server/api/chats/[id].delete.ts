import { db, schema } from "hub:db";
import { eq } from "drizzle-orm";

import { publishEvent } from "../../utils/events";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = session.user?.id || session.id;

  if (!userId) {
    throw createError({ statusCode: 401, message: "Не авторизован" });
  }
  const { id: chatId } = getRouterParams(event);

  if (!chatId) {
    throw createError({
      statusCode: 400,
      message: "Неверный запрос: Отсутствует параметр id",
    });
  }

  // Сначала находим чат, чтобы узнать владельца для уведомления в случае удаления администратором
  const existingChat = await db.query.chats.findFirst({
    where: eq(schema.chats.id, chatId),
  });

  if (!existingChat) {
    throw createError({
      statusCode: 404,
      message: "Чат не найден",
    });
  }

  // Проверка прав владения
  if (!session.user?.isAdmin && existingChat.userId !== userId) {
    throw createError({
      statusCode: 403,
      message: "Отказано в доступе: Вы можете удалять только свои чаты",
    });
  }

  const [deletedChatRecord] = await db
    .delete(schema.chats)
    .where(eq(schema.chats.id, chatId))
    .returning();

  // Уведомляем изначального владельца об удалении чата
  const originalOwnerId = deletedChatRecord?.userId;
  if (originalOwnerId) {
    await publishEvent(originalOwnerId, "chat:updated", {
      deletedChatId: chatId,
    });
  }

  return [deletedChatRecord];
});
