import { db, schema } from "hub:db";
import { and, asc, eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = session.user?.id || session.id;

  if (!userId) {
    throw createError({ statusCode: 401, message: "Не авторизован" });
  }

  const { id } = getRouterParams(event);

  // Если пользователь является администратором, ищем только по ID; иначе требуем совпадения владельца
  const chatSearchCondition = session.user?.isAdmin
    ? eq(schema.chats.id, id as string)
    : and(eq(schema.chats.id, id as string), eq(schema.chats.userId, userId));

  const targetChat = await db.query.chats.findFirst({
    where: chatSearchCondition,
    with: {
      messages: {
        orderBy: () => asc(schema.messages.createdAt),
      },
    },
  });

  if (!targetChat) {
    throw createError({ statusCode: 404, message: "Чат не найден" });
  }

  return targetChat;
});
