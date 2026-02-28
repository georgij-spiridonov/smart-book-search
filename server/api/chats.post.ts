import type { UIMessage } from "ai";
import { db, schema } from "hub:db";
import { z } from "zod";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = session.user?.id || session.id;

  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }

  const { id, message } = await readValidatedBody(
    event,
    z.object({
      id: z.string(),
      message: z.custom<UIMessage>(),
    }).parse,
  );

  const [chat] = await db
    .insert(schema.chats)
    .values({
      id,
      title: "",
      userId,
    })
    .returning();

  if (!chat) {
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to create chat",
    });
  }

  await db.insert(schema.messages).values({
    chatId: chat.id,
    role: "user",
    parts: message.parts,
  });

  return chat;
});
