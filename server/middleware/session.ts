import { defineEventHandler } from "h3";
import { db, schema } from "hub:db";

/**
 * Промежуточное ПО для управления сессиями пользователей.
 * Обеспечивает наличие стабильного ID для каждого посетителя и определяет права администратора.
 */
export default defineEventHandler(async (event) => {
  const userSession = await getUserSession(event);

  // Если у пользователя нет постоянного идентификатора, генерируем новый и сохраняем в БД
  if (!userSession.id) {
    const newUserId = crypto.randomUUID();

    // Регистрируем нового пользователя в базе данных
    await db.insert(schema.users).values({ id: newUserId });

    // Сохраняем идентификатор в зашифрованной сессии
    await setUserSession(event, {
      ...userSession,
      id: newUserId,
    });
  }

  // Устанавливаем флаг администратора в контекст запроса для последующего использования в API
  event.context.isAdmin = !!userSession.user?.isAdmin;
});
