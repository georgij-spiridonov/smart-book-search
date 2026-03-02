import { describe, it, expect, vi } from "vitest";
import { createBookChatTransport } from "../BookChatTransport";
import { ref, type Ref } from "vue";
import type { UIMessage, HttpChatTransportInitOptions } from "ai";

/**
 * Интерфейс для перехваченных опций транспорта в моке.
 */
interface InterceptedTransport {
  options: HttpChatTransportInitOptions<UIMessage>;
}

/**
 * Мокаем библиотеку 'ai' для перехвата параметров, передаваемых в DefaultChatTransport.
 * Это позволяет нам тестировать логику функции prepareSendMessagesRequest без выполнения реальных запросов.
 */
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    DefaultChatTransport: vi.fn().mockImplementation(function (this: InterceptedTransport, options: HttpChatTransportInitOptions<UIMessage>) {
      this.options = options;
    }),
  };
});

describe("Транспорт для чата BookChatTransport", () => {
  /**
   * Вспомогательная функция для получения перехваченных опций транспорта.
   */
  const getTransportOptions = (bookIds: string[] | Ref<string[]>) => {
    const transport = createBookChatTransport(bookIds) as unknown as InterceptedTransport;
    const { prepareSendMessagesRequest } = transport.options;

    if (!prepareSendMessagesRequest) {
      throw new Error("Метод prepareSendMessagesRequest не определен в опциях транспорта");
    }

    return prepareSendMessagesRequest;
  };

  it("должен корректно формировать тело запроса на основе последнего сообщения пользователя", async () => {
    const bookIds = ref<string[]>(["book-1", "book-2"]);
    const prepareRequest = getTransportOptions(bookIds);

    const messages: UIMessage[] = [
      { id: "1", role: "user", parts: [{ type: "text", text: "Привет" }] },
      { id: "2", role: "assistant", parts: [{ type: "text", text: "Здравствуйте" }] },
      { id: "3", role: "user", parts: [{ type: "text", text: "Расскажи про эти книги" }] },
    ];

    const result = (await prepareRequest({
      messages,
      id: "chat-123",
      requestMetadata: {},
      body: {},
      credentials: "omit",
      headers: {},
      api: "",
      trigger: "submit-message",
      messageId: undefined,
    })) as { body: { query: string; bookIds: string[]; chatId: string } };

    expect(result.body.query).toBe("Расскажи про эти книги");
    expect(result.body.bookIds).toEqual(["book-1", "book-2"]);
    expect(result.body.chatId).toBe("chat-123");
  });

  it("должен объединять несколько текстовых фрагментов в одном сообщении", async () => {
    const prepareRequest = getTransportOptions(["book-1"]);

    const messages: UIMessage[] = [
      {
        id: "1",
        role: "user",
        parts: [
          { type: "text", text: "Часть 1 " },
          { type: "text", text: "Часть 1 " },
          { type: "text", text: "Часть 2" },
        ],
      },
    ];

    const result = (await prepareRequest({
      messages,
      id: "chat-456",
      requestMetadata: {},
      body: {},
      credentials: "omit",
      headers: {},
      api: "",
      trigger: "submit-message",
      messageId: undefined,
    })) as { body: { query: string; bookIds: string[]; chatId: string } };

    expect(result.body.query).toBe("Часть 1 Часть 1 Часть 2");
  });

  it("должен возвращать пустой запрос, если сообщений пользователя нет", async () => {
    const prepareRequest = getTransportOptions([]);

    const messages: UIMessage[] = [
      { id: "1", role: "assistant", parts: [{ type: "text", text: "Привет" }] },
    ];

    const result = (await prepareRequest({
      messages,
      id: "chat-789",
      requestMetadata: {},
      body: {},
      credentials: "omit",
      headers: {},
      api: "",
      trigger: "submit-message",
      messageId: undefined,
    })) as { body: { query: string; bookIds: string[]; chatId: string } };

    expect(result.body.query).toBe("");
  });

  it("должен корректно обрабатывать сообщения без текстовых частей", async () => {
    const prepareRequest = getTransportOptions(["book-xyz"]);

    const messages: UIMessage[] = [
      {
        id: "1",
        role: "user",
        // Сообщение без текстовых частей (например, только результат работы инструмента)
        parts: [{ type: "tool-invocation", toolCallId: "call-1", state: "output-available", input: {}, output: {} }],
      },
    ];

    const result = (await prepareRequest({
      messages,
      id: "chat-999",
      requestMetadata: {},
      body: {},
      credentials: "omit",
      headers: {},
      api: "",
      trigger: "submit-message",
      messageId: undefined,
    })) as { body: { query: string; bookIds: string[]; chatId: string } };

    expect(result.body.query).toBe("");
  });

  it("должен корректно работать при пустом массиве сообщений", async () => {
    const prepareRequest = getTransportOptions(["book-xyz"]);

    const result = (await prepareRequest({
      messages: [],
      id: "chat-empty",
      requestMetadata: {},
      body: {},
      credentials: "omit",
      headers: {},
      api: "",
      trigger: "submit-message",
      messageId: undefined,
    })) as { body: { query: string; bookIds: string[]; chatId: string } };

    expect(result.body.query).toBe("");
  });
});
