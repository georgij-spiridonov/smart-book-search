import { z } from "zod";

const LoginSchema = z.object({
  password: z.string(),
});

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { password } = LoginSchema.parse(body);
  const config = useRuntimeConfig(event);

  if (!config.adminPassword) {
    throw createError({
      statusCode: 500,
      statusMessage: "Admin password not configured on server",
    });
  }

  if (password !== config.adminPassword) {
    throw createError({
      statusCode: 401,
      statusMessage: "Invalid password",
    });
  }

  const session = await getUserSession(event);
  
  // Explicitly set the session content, ensuring isAdmin is only in user object.
  // We keep the 'id' (anonymous identity) but replace anything else.
  await setUserSession(event, {
    id: session.id,
    user: {
      isAdmin: true,
    },
  });

  return { 
    status: "success",
    message: "Admin access granted" 
  };
});
