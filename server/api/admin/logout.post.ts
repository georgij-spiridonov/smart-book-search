export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const currentId = session.id;

  // We overwrite the entire session with only the ID.
  // We explicitly set user to an object with isAdmin: false to revoke elevated access.
  await setUserSession(event, {
    id: currentId,
    user: {
      id: currentId,
      isAdmin: false
    }
  });

  return { status: "success", message: "Logged out" };
});
