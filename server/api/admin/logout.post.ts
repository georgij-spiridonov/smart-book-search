export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = session.id || session.user?.id;

  // We overwrite the entire session with only the ID.
  // We explicitly set user to an object with isAdmin: false to override any reactive state.
  await setUserSession(event, {
    id: userId,
    user: {
      isAdmin: false
    }
  });

  return { status: "success", message: "Logged out" };
});
