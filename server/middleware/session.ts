import { defineEventHandler } from "h3";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);

  if (!session.user && !session.id) {
    // Generate a new random session ID if they don't have one
    await setUserSession(event, { id: crypto.randomUUID() });
  }
});
