export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const currentSessionId = session.id;

  // Мы перезаписываем всю сессию, оставляя только ID.
  // Мы явно устанавливаем объект пользователя с isAdmin: false, чтобы отозвать расширенные права.
  await setUserSession(event, {
    id: currentSessionId,
    user: {
      id: currentSessionId,
      isAdmin: false
    }
  });

  return { status: "success", message: "Выход выполнен успешно" };
});
