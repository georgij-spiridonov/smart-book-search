import type { chats, messages } from "hub:db:schema";

/**
 * Объект чата (диалога) из базы данных.
 */
export type Chat = typeof chats.$inferSelect;

/**
 * Объект сообщения из базы данных.
 */
export type Message = typeof messages.$inferSelect;

declare module "nuxt-auth-utils" {
  /** Расширение стандартного интерфейса пользователя для nuxt-auth-utils. */
  interface User {
    /** Уникальный идентификатор пользователя. */
    id: string;
    /** Флаг администратора (имеет доступ к управлению всеми книгами и чатами). */
    isAdmin: boolean;
  }
}

declare module "#auth-utils" {
  /** Расширение стандартного интерфейса пользователя для #auth-utils. */
  interface User {
    /** Уникальный идентификатор пользователя. */
    id: string;
    /** Флаг администратора (имеет доступ к управлению всеми книгами и чатами). */
    isAdmin: boolean;
  }
}
