import { describe, it, expect, vi, beforeEach } from "vitest";

// =======================
// Имитации для импортов Nuxt (Mocks for Nuxt Imports)
// =======================
const { mockedGetUserSession, mockedReadBody } = vi.hoisted(() => {
  const sessionMock = vi.fn();
  const readBodyMock = vi.fn();

  (globalThis as any).defineEventHandler = vi.fn((handler: any) => handler);
  (globalThis as any).createError = vi.fn((errorData: { statusCode: number; message: string }) => {
    const error = new Error(errorData.message || "Ошибка сервера");
    (error as any).statusCode = errorData.statusCode;
    return error;
  });
  (globalThis as any).getUserSession = sessionMock;
  (globalThis as any).readBody = readBodyMock;

  return {
    mockedGetUserSession: sessionMock,
    mockedReadBody: readBodyMock,
  };
});

// =======================
// Имитации локальных утилит (Mocks for Local Utils)
// =======================
const mockSearchBookKnowledge = vi.fn();
const mockGenerateSearchQueries = vi.fn();
vi.mock("../utils/retrieval", () => ({
  searchBookKnowledge: (...args: any[]) => mockSearchBookKnowledge(...args),
  generateSearchQueries: (...args: any[]) => mockGenerateSearchQueries(...args),
}));

const mockStreamAnswer = vi.fn();
vi.mock("../utils/generateAnswer", () => ({
  streamAnswer: (...args: any[]) => mockStreamAnswer(...args),
}));

const mockGetBookFromStore = vi.fn();
vi.mock("../utils/bookStore", () => ({
  getBook: (...args: any[]) => mockGetBookFromStore(...args),
}));

vi.mock("../utils/logger", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// =======================
// Имитации внешних библиотек (Mocks for External Libs)
// =======================
const mockCreateUIMessageStream = vi.fn();
const mockCreateUIMessageStreamResponse = vi.fn();
const mockGenerateText = vi.fn();

vi.mock("ai", () => ({
  createUIMessageStream: (...args: any[]) => mockCreateUIMessageStream(...args),
  createUIMessageStreamResponse: (...args: any[]) =>
    mockCreateUIMessageStreamResponse(...args),
  generateText: (...args: any[]) => mockGenerateText(...args),
}));

// =======================
// Имитации базы данных (Mocks for DB)
// =======================
const {
  mockDbInsert,
  mockDbUpdate,
  mockDbInsertValues,
  mockDbFindManyMessages,
  mockDbFindFirstChat,
} = vi.hoisted(() => {
  const insertValuesMock = vi.fn();
  const updateExecuteMock = vi.fn();
  const updateWhereMock = vi.fn(() => ({ execute: updateExecuteMock }));
  const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
  const findManyMessagesMock = vi.fn();
  const findFirstChatMock = vi.fn();

  return {
    mockDbFindManyMessages: findManyMessagesMock,
    mockDbFindFirstChat: findFirstChatMock,
    mockDbInsertValues: insertValuesMock,
    mockDbUpdateExecute: updateExecuteMock,
    mockDbUpdateWhere: updateWhereMock,
    mockDbUpdateSet: updateSetMock,
    mockDbInsert: vi.fn(() => ({ values: insertValuesMock })),
    mockDbUpdate: vi.fn(() => ({ set: updateSetMock })),
  };
});

vi.mock("hub:db", () => ({
  db: {
    query: {
      messages: {
        findMany: (...args: any[]) => mockDbFindManyMessages(...args),
      },
      chats: {
        findFirst: (...args: any[]) => mockDbFindFirstChat(...args),
      },
    },
    insert: mockDbInsert,
    update: mockDbUpdate,
  },
  schema: {
    chats: { id: "chats.id" },
    messages: {
      chatId: "messages.chatId",
      createdAt: "messages.createdAt",
    },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  asc: vi.fn(),
}));

// =======================
// Тестируемый объект
// =======================
import chatPostHandler from "../api/chat.post";

describe("Обработка сообщений чата: POST /api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("должен возвращать 401, если пользователь не авторизован", async () => {
    mockedGetUserSession.mockResolvedValueOnce({} as any);

    await expect(chatPostHandler({} as any)).rejects.toThrowError(
      "Не авторизован",
    );
  });

  it("должен возвращать 400, если запрос некорректен (например, пустой запрос)", async () => {
    mockedGetUserSession.mockResolvedValueOnce({
      id: "session-id",
      user: { id: "user-id-1" },
    } as any);
    mockedReadBody.mockResolvedValueOnce({
      query: "", // Невалидно!
      bookIds: ["book-id-1"],
    });

    await expect(chatPostHandler({} as any)).rejects.toThrowError(
      "Missing or empty 'query' field.",
    );
  });

  it("должен возвращать 404, если запрашиваемая книга не найдена", async () => {
    mockedGetUserSession.mockResolvedValueOnce({
      id: "session-id",
      user: { id: "user-id-1" },
    } as any);
    mockedReadBody.mockResolvedValueOnce({
      query: "Тестовый вопрос",
      bookIds: ["unknown-book-id"],
    });

    mockGetBookFromStore.mockResolvedValueOnce(null);

    await expect(chatPostHandler({} as any)).rejects.toThrowError("Книга с ID 'unknown-book-id' не найдена.");
  });

  it("должен возвращать ответ сразу, если все книги не векторизованы", async () => {
    mockedGetUserSession.mockResolvedValueOnce({
      id: "session-id",
      user: { id: "user-id-1" },
    } as any);
    mockedReadBody.mockResolvedValueOnce({
      query: "Тестовый вопрос",
      bookIds: ["book-not-vectorized"],
    });

    mockGetBookFromStore.mockResolvedValueOnce({
      id: "book-not-vectorized",
      vectorized: false,
    });

    mockCreateUIMessageStream.mockImplementationOnce((config) => {
      const writer = { write: vi.fn(), merge: vi.fn() };
      config.execute({ writer });
      return "mock-stream-object";
    });

    mockCreateUIMessageStreamResponse.mockImplementationOnce((config) => {
      return `MockResponse-${config.stream}`;
    });

    const result = await chatPostHandler({} as any);

    expect(mockCreateUIMessageStream).toHaveBeenCalledOnce();
    expect(mockCreateUIMessageStreamResponse).toHaveBeenCalledOnce();
    expect(mockSearchBookKnowledge).not.toHaveBeenCalled();
    expect(result).toBe("MockResponse-mock-stream-object");
  });

  it("должен возвращать ответ, даже если контекст не найден", async () => {
    mockedGetUserSession.mockResolvedValueOnce({
      id: "session-id",
      user: { id: "user-id-1" },
    } as any);
    mockedReadBody.mockResolvedValueOnce({
      query: "Случайный текст",
      bookIds: ["book-id-1"],
    });

    mockGetBookFromStore.mockResolvedValueOnce({
      id: "book-id-1",
      vectorized: true,
      title: "Книга 1",
    });

    mockGenerateSearchQueries.mockResolvedValueOnce(["query1"]);
    mockSearchBookKnowledge.mockResolvedValueOnce([]); // Пустой контекст

    mockCreateUIMessageStream.mockImplementationOnce(async (config) => {
      const writer = { write: vi.fn(), merge: vi.fn() };
      await config.execute({ writer });
      return "mock-stream-no-context";
    });

    mockCreateUIMessageStreamResponse.mockImplementationOnce(async (config) => {
      const streamVal = await config.stream;
      return `MockResponse-${streamVal}`;
    });

    const result = await chatPostHandler({} as any);

    expect(mockGenerateSearchQueries).toHaveBeenCalledOnce();
    expect(mockSearchBookKnowledge).toHaveBeenCalledOnce();
    expect(mockCreateUIMessageStream).toHaveBeenCalledOnce();
    expect(mockStreamAnswer).toHaveBeenCalledOnce();
    expect(result).toBe("MockResponse-mock-stream-no-context");
  });

  it("должен генерировать ответ с использованием LLM при наличии контекста", async () => {
    mockedGetUserSession.mockResolvedValueOnce({
      id: "session-id",
      user: { id: "user-id-1" },
    } as any);
    mockedReadBody.mockResolvedValueOnce({
      query: "Что такое ИИ?",
      bookIds: ["book-id-1"],
    });

    mockGetBookFromStore.mockResolvedValueOnce({
      id: "book-id-1",
      vectorized: true,
      title: "Книга про ИИ",
    });

    mockGenerateSearchQueries.mockResolvedValueOnce(["поиск ии"]);
    const mockContextChunks = [{ text: "ИИ — это круто.", score: 0.9, bookId: "book-id-1" }];
    mockSearchBookKnowledge.mockResolvedValueOnce(mockContextChunks);

    mockStreamAnswer.mockReturnValueOnce({
      toUIMessageStream: vi.fn(() => "stream-content"),
    });

    mockGenerateText.mockResolvedValueOnce({ text: "Сгенерированный заголовок" });

    mockCreateUIMessageStream.mockImplementationOnce(async (config: any) => {
      const writer = { write: vi.fn(), merge: vi.fn() };
      await config.execute({ writer });
      if (config.onFinish) {
        await config.onFinish({
          messages: [
            { role: "user", parts: [{ text: "вопрос" }] },
            {
              role: "assistant",
              parts: [{ type: "text", text: "ответ" }],
            } as any,
          ],
        });
      }
      return "mock-stream-with-answer";
    });

    mockCreateUIMessageStreamResponse.mockImplementationOnce(async (config) => {
      const streamVal = await config.stream;
      return `MockResponse-${streamVal}`;
    });

    const mockEvent = { waitUntil: vi.fn() };
    const result = await chatPostHandler(mockEvent as any);

    expect(mockDbInsert).toHaveBeenCalledTimes(3); // Новый чат, сообщение пользователя, сообщение ассистента
    expect(mockDbInsertValues).toHaveBeenCalledTimes(3);
    expect(mockCreateUIMessageStream).toHaveBeenCalledOnce();
    expect(mockStreamAnswer).toHaveBeenCalledOnce();
    
    expect(mockCreateUIMessageStreamResponse).toHaveBeenCalledOnce();
    expect(mockEvent.waitUntil).toHaveBeenCalledOnce();
    expect(result).toBe("MockResponse-mock-stream-with-answer");
  });

  it("должен обрабатывать ошибки в callback-функции создания потока сообщений", async () => {
    mockedGetUserSession.mockResolvedValueOnce({
      user: { id: "user-id-1" },
    } as any);
    mockedReadBody.mockResolvedValueOnce({
      query: "Тест ошибки",
      bookIds: ["book-err-id"],
    });
    mockGetBookFromStore.mockResolvedValueOnce({ id: "book-err-id", vectorized: true });
    mockSearchBookKnowledge.mockResolvedValueOnce([
      { text: "контекст", score: 0.9, bookId: "book-err-id" },
    ]);
    mockStreamAnswer.mockReturnValueOnce({ toUIMessageStream: vi.fn() });

    mockCreateUIMessageStream.mockImplementationOnce((config: any) => {
      if (config.onError) {
        const errorMessage = config.onError(new Error("Сбой потока"));
        expect(errorMessage).toBe("Произошла ошибка при генерации ответа. Попробуйте ещё раз.");
      }
      return "mock-stream-error-handled";
    });

    const mockEvent = { waitUntil: vi.fn() };
    await chatPostHandler(mockEvent as any);
  });

  it("должен возвращать 403, если пользователь запрашивает чат другого пользователя", async () => {
    mockedGetUserSession.mockResolvedValueOnce({
      id: "session-id",
      user: { id: "user-id-1" },
    } as any);
    mockedReadBody.mockResolvedValueOnce({
      query: "Вопрос",
      bookIds: ["book-id-1"],
      chatId: "other-user-chat-id",
    });

    mockDbFindFirstChat.mockResolvedValueOnce({
      id: "other-user-chat-id",
      userId: "user-id-2", // Другой пользователь
    });

    await expect(chatPostHandler({} as any)).rejects.toThrowError("Отказано в доступе");
  });

  it("должен возвращать 404, если запрашиваемый чат не найден", async () => {
    mockedGetUserSession.mockResolvedValueOnce({
      id: "session-id",
      user: { id: "user-id-1" },
    } as any);
    mockedReadBody.mockResolvedValueOnce({
      query: "Вопрос",
      bookIds: ["book-id-1"],
      chatId: "missing-chat-id",
    });

    mockDbFindFirstChat.mockResolvedValueOnce(undefined);

    await expect(chatPostHandler({} as any)).rejects.toThrowError("Чат не найден");
  });

  it("должен использовать существующую историю и не создавать новый чат, если chatId передан", async () => {
    mockedGetUserSession.mockResolvedValueOnce({
      id: "session-id",
      user: { id: "user-id-1" },
    } as any);
    mockedReadBody.mockResolvedValueOnce({
      query: "Второй вопрос",
      bookIds: ["book-id-1"],
      chatId: "existing-chat-id",
    });

    mockDbFindFirstChat.mockResolvedValueOnce({
      id: "existing-chat-id",
      userId: "user-id-1",
    });

    mockDbFindManyMessages.mockResolvedValueOnce([
      { role: "user", parts: [{ text: "Первый вопрос" }] },
    ]);

    mockGetBookFromStore.mockResolvedValueOnce({
      id: "book-id-1",
      vectorized: true,
    });

    mockSearchBookKnowledge.mockResolvedValueOnce([{ text: "контекст", score: 0.8 }]);
    mockStreamAnswer.mockReturnValueOnce({ toUIMessageStream: vi.fn() });

    mockCreateUIMessageStream.mockImplementationOnce((config) => {
      const writer = { write: vi.fn(), merge: vi.fn() };
      config.execute({ writer });
      return "mock-stream-existing-chat";
    });

    mockCreateUIMessageStreamResponse.mockReturnValueOnce("MockResponseObject");

    const _mockEvent = { waitUntil: vi.fn() };
    const _result = await chatPostHandler({} as any);

    expect(mockDbFindManyMessages).toHaveBeenCalledOnce();
    expect(mockDbInsert).toHaveBeenCalledTimes(1); // Только сообщение пользователя (без нового чата)
  });

  it("должен корректно обрабатывать ситуацию, когда чат принадлежит другому пользователю", async () => {
    mockedGetUserSession.mockResolvedValueOnce({ user: { id: "user-1", isAdmin: false } } as any);
    mockedReadBody.mockResolvedValueOnce({ query: "Второй вопрос", bookIds: ["b1"], chatId: "other-chat" });
    
    mockDbFindFirstChat.mockResolvedValueOnce({ 
      id: "other-chat", 
      userId: "user-2" // Другой владелец
    });

    await expect(chatPostHandler({} as any)).rejects.toThrowError("Отказано в доступе");
  });

  it("должен разрешать доступ к чужому чату, если пользователь является администратором", async () => {
    mockedGetUserSession.mockResolvedValueOnce({ user: { id: "admin-1", isAdmin: true } } as any);
    mockedReadBody.mockResolvedValueOnce({ query: "Вопрос админа", bookIds: ["b1"], chatId: "user-chat" });
    
    mockDbFindFirstChat.mockResolvedValueOnce({ 
      id: "user-chat", 
      userId: "user-1" 
    });

    mockDbFindManyMessages.mockResolvedValueOnce([]);
    mockGetBookFromStore.mockResolvedValueOnce({ id: "b1", vectorized: true });
    mockSearchBookKnowledge.mockResolvedValueOnce([]);
    mockCreateUIMessageStream.mockReturnValueOnce("stream");
    mockCreateUIMessageStreamResponse.mockReturnValueOnce("response");

    const result = await chatPostHandler({} as any);
    expect(result).toBe("response");
  });

  it("должен логировать ошибку, если генерация заголовка завершилась неудачей", async () => {
    mockedGetUserSession.mockResolvedValueOnce({ user: { id: "user-1" } } as any);
    mockedReadBody.mockResolvedValueOnce({ query: "Новый чат", bookIds: ["b1"] });
    mockGetBookFromStore.mockResolvedValueOnce({ id: "b1", vectorized: true });
    mockSearchBookKnowledge.mockResolvedValueOnce([]);
    mockStreamAnswer.mockReturnValueOnce({ toUIMessageStream: vi.fn() });
    
    mockGenerateText.mockRejectedValueOnce(new Error("LLM Timeout"));
    mockDbInsertValues.mockReturnValueOnce([{ id: "new-chat-id" }]);

    mockCreateUIMessageStream.mockImplementationOnce(async (config: any) => {
      const writer = { write: vi.fn(), merge: vi.fn() };
      await config.execute({ writer });
      
      if (config.onFinish) {
        await config.onFinish({ 
          messages: [
            { role: "user", parts: [{ text: "вопрос" }] },
            { role: "assistant", parts: [{ text: "ответ" }] }
          ] 
        });
      }
      return "stream";
    });

    const mockEvent = { waitUntil: vi.fn() };
    await chatPostHandler(mockEvent as any);

    const { log } = await import("../utils/logger");
    expect(log.error).toHaveBeenCalledWith("chat-api", expect.stringContaining("failed"), expect.anything());
  });
});
