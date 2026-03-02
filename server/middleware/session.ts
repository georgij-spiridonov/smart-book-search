import { defineEventHandler } from "h3";
import { db, schema } from "hub:db";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);

  // If there's no stable identity ID, we must create one.
  if (!session.id) {
    const newId = crypto.randomUUID();

    // Create a database record for this identity
    await db.insert(schema.users).values({ id: newId });

    // Set the new identity in the session while preserving existing user metadata
    await setUserSession(event, {
      ...session,
      id: newId,
    });
    
    // Update local context for the current request
    event.context.isAdmin = session.user?.isAdmin === true;
  } else {
    // Identity is stable, just populate context
    event.context.isAdmin = session.user?.isAdmin === true;
  }
});
