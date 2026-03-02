import type { chats, messages } from "hub:db:schema";

export type Chat = typeof chats.$inferSelect;
export type Message = typeof messages.$inferSelect;

declare module "nuxt-auth-utils" {
  interface User {
    id: string;
    isAdmin: boolean;
  }
}

declare module "#auth-utils" {
  interface User {
    id: string;
    isAdmin: boolean;
  }
}
