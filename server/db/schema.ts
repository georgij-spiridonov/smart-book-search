import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

/**
 * Стандартные временные метки для таблиц базы данных.
 */
const temporalMetadata = {
  /** Дата и время создания записи. */
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
};

/**
 * Определение структуры отдельной части сообщения в формате AI SDK.
 * Используем широкое определение для обеспечения совместимости с различными типами частей.
 */
export type MessageContentPart = {
  type: string;
  [key: string]: unknown;
};

/**
 * Таблица пользователей системы.
 */
export const users = sqliteTable("users", {
  /** Уникальный идентификатор пользователя (UUID). */
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  ...temporalMetadata,
});

/**
 * Связи таблицы пользователей.
 */
export const usersRelations = relations(users, ({ many }) => ({
  /** Один пользователь может иметь множество чатов. */
  chats: many(chats),
}));

/**
 * Таблица чатов (диалогов).
 */
export const chats = sqliteTable(
  "chats",
  {
    /** Уникальный идентификатор чата (UUID). */
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Заголовок чата, генерируемый автоматически. */
    title: text("title"),
    /** Идентификатор владельца чата. */
    userId: text("user_id").notNull(),
    /** Список идентификаторов книг, по которым ведется поиск в данном чате. */
    bookIds: text("book_ids", { mode: "json" }).$type<string[]>(),
    ...temporalMetadata,
  },
  (table) => [
    /** Индекс для быстрого поиска чатов конкретного пользователя. */
    index("chats_user_id_idx").on(table.userId),
    /** Индекс для сортировки чатов по дате создания. */
    index("chats_created_at_idx").on(table.createdAt),
  ],
);

/**
 * Связи таблицы чатов.
 */
export const chatsRelations = relations(chats, ({ one, many }) => ({
  /** Чат принадлежит одному пользователю. */
  user: one(users, {
    fields: [chats.userId],
    references: [users.id],
  }),
  /** Чат содержит множество сообщений. */
  messages: many(messages),
}));

/**
 * Таблица сообщений внутри чатов.
 */
export const messages = sqliteTable(
  "messages",
  {
    /** Уникальный идентификатор сообщения (UUID). */
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Идентификатор чата, к которому относится сообщение. */
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    /** Роль отправителя сообщения (пользователь, ассистент или система). */
    role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
    /** Содержимое сообщения в виде массива структурированных частей (AI SDK format). */
    parts: text("parts", { mode: "json" }).$type<MessageContentPart[]>(),
    ...temporalMetadata,
  },
  (table) => [
    /** Индекс для быстрого получения всех сообщений конкретного чата. */
    index("messages_chat_id_idx").on(table.chatId),
    /** Индекс для хронологической сортировки сообщений в чате. */
    index("messages_created_at_idx").on(table.createdAt),
  ],
);

/**
 * Связи таблицы сообщений.
 */
export const messagesRelations = relations(messages, ({ one }) => ({
  /** Сообщение относится к одному конкретному чату. */
  chat: one(chats, {
    fields: [messages.chatId],
    references: [chats.id],
  }),
}));
