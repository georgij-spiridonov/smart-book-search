import { defineEventHandler } from "h3";
import { db, schema } from "hub:db";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);

  if (!session.user && !session.id) {
    // Generate a new random session ID if they don't have one
    const newId = crypto.randomUUID();

    // Create the actual user record in the database
    await db.insert(schema.users).values({ id: newId });

    await setUserSession(event, { id: newId });
  }
});
