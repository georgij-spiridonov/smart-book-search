import { db, schema } from "hub:db";
import { eq, desc } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);

  // Для пользователей без явной авторизации ID их сессии будет использоваться как userId
  const userId = session.user?.id || session.id;

  if (!userId) {
    throw createError({ statusCode: 401, message: "Не авторизован" });
  }

  // Администраторы видят всё, обычные пользователи видят только свои чаты
  const chatSearchCondition = session.user?.isAdmin 
    ? undefined 
    : eq(schema.chats.userId, userId);

  return await db.query.chats.findMany({
    where: chatSearchCondition,
    orderBy: () => desc(schema.chats.createdAt),
  });
});
