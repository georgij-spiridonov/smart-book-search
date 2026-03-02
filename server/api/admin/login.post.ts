import { z } from "zod";

const AdministratorLoginSchema = z.object({
  password: z.string(),
});

export default defineEventHandler(async (event) => {
  const requestBody = await readBody(event);
  const { password: providedPassword } = AdministratorLoginSchema.parse(requestBody);
  const applicationConfig = useRuntimeConfig(event);

  if (!applicationConfig.adminPassword) {
    throw createError({
      statusCode: 500,
      message: "Пароль администратора не настроен на сервере",
    });
  }

  if (providedPassword !== applicationConfig.adminPassword) {
    throw createError({
      statusCode: 401,
      message: "Неверный пароль",
    });
  }

  const session = await getUserSession(event);
  
  // Убеждаемся, что у нас есть ID для сохранения идентификации даже после входа
  let userSessionId = session.id;
  if (!userSessionId) {
    userSessionId = crypto.randomUUID();
  }

  // Явно устанавливаем содержимое сессии, гарантируя наличие isAdmin в объекте пользователя.
  await setUserSession(event, {
    id: userSessionId,
    user: {
      id: userSessionId,
      isAdmin: true,
    },
  });

  return { 
    status: "success",
    message: "Доступ администратора предоставлен" 
  };
});
