import { describe, it, expect, vi, beforeEach } from "vitest";

// =======================
// Имитации для Nuxt (Mocks for Nuxt Imports)
// =======================
const { mockedGetUserSession, mockedGetRouterParams } = vi.hoisted(() => {
  const sessionMock = vi.fn();
  const paramsMock = vi.fn();

  (globalThis as any).defineEventHandler = vi.fn((handler: any) => handler);
  (globalThis as any).createError = vi.fn((errorData: { statusCode: number; message: string }) => {
    const error = new Error(errorData.message || "Ошибка сервера");
    (error as any).statusCode = errorData.statusCode;
    return error;
  });
  (globalThis as any).getUserSession = sessionMock;
  (globalThis as any).getRouterParams = paramsMock;

  return {
    mockedGetUserSession: sessionMock,
    mockedGetRouterParams: paramsMock,
  };
});

// =======================
// Имитация базы данных (Mocks for DB)
// =======================
const mockDbFindFirstChat = vi.fn();
vi.mock("hub:db", () => ({
  db: {
    query: {
      chats: {
        findFirst: (...args: any[]) => mockDbFindFirstChat(...args),
      },
    },
  },
  schema: {
    chats: {
      id: "chats.id",
      userId: "chats.userId",
    },
    messages: {
      createdAt: "messages.createdAt",
    },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  asc: vi.fn(),
}));

import chatGetByIdHandler from "../api/chats/[id].get";

describe("Получение конкретного чата: GET /api/chats/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("должен возвращать ошибку 401, если пользователь не авторизован", async () => {
    mockedGetUserSession.mockResolvedValueOnce({});

    await expect(chatGetByIdHandler({} as any)).rejects.toThrowError(
      "Не авторизован",
    );
  });

  it("должен возвращать ошибку 404, если чат не найден", async () => {
    mockedGetUserSession.mockResolvedValueOnce({ user: { id: "user-id-123" } });
    mockedGetRouterParams.mockReturnValue({ id: "unknown-chat-id" });
    mockDbFindFirstChat.mockResolvedValueOnce(null);

    await expect(chatGetByIdHandler({} as any)).rejects.toThrowError(
      "Чат не найден",
    );
  });

  it("должен возвращать чат и сообщения, если чат существует и принадлежит пользователю", async () => {
    const mockChatData = {
      id: "valid-chat-id",
      title: "Существующий чат",
      userId: "user-id-123",
      messages: [{ id: "msg-id-1", role: "user", text: "привет" }],
    };

    mockedGetUserSession.mockResolvedValueOnce({ user: { id: "user-id-123" } });
    mockedGetRouterParams.mockReturnValue({ id: "valid-chat-id" });
    
    mockDbFindFirstChat.mockImplementationOnce((args: any) => {
      // Имитируем выполнение условий Drizzle внутри обработчика
      if (typeof args?.where === "function") args.where();
      if (typeof args?.with?.messages?.orderBy === "function")
        args.with.messages.orderBy();
      return Promise.resolve(mockChatData);
    });

    const result = await chatGetByIdHandler({} as any);

    expect(mockedGetUserSession).toHaveBeenCalledOnce();
    expect(mockedGetRouterParams).toHaveBeenCalledOnce();
    expect(mockDbFindFirstChat).toHaveBeenCalledOnce();

    expect(result).toEqual(mockChatData);
  });
});
