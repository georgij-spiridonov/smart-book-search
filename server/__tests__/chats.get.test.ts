import { describe, it, expect, vi, beforeEach } from "vitest";

// =======================
// Имитации для Nuxt (Mocks for Nuxt Imports)
// =======================
const { mockedGetUserSession } = vi.hoisted(() => {
  const sessionMock = vi.fn();

  (globalThis as any).defineEventHandler = vi.fn((handler: any) => handler);
  (globalThis as any).createError = vi.fn((errorData: { statusCode: number; message: string }) => {
    const error = new Error(errorData.message || "Ошибка сервера");
    (error as any).statusCode = errorData.statusCode;
    return error;
  });
  (globalThis as any).getUserSession = sessionMock;

  return { mockedGetUserSession: sessionMock };
});

// =======================
// Имитация базы данных (Mocks for DB)
// =======================
const mockDbFindManyChats = vi.fn();
vi.mock("hub:db", () => ({
  db: {
    query: {
      chats: {
        findMany: (...args: any[]) => mockDbFindManyChats(...args),
      },
    },
  },
  schema: {
    chats: {
      userId: "chats.userId",
      createdAt: "chats.createdAt",
    },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  desc: vi.fn(),
}));

import chatsGetHandler from "../api/chats.get";

describe("Получение списка чатов: GET /api/chats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("должен возвращать ошибку 401, если пользователь не авторизован", async () => {
    // Имитируем отсутствие данных пользователя и сессии
    mockedGetUserSession.mockResolvedValueOnce({}); 

    await expect(chatsGetHandler({} as any)).rejects.toThrowError(
      "Не авторизован",
    );
  });

  it("должен возвращать список чатов для авторизованного пользователя", async () => {
    const mockChatsFromDb = [
      { id: "chat-id-1", title: "Тестовый чат 1", userId: "user-id-123" },
      { id: "chat-id-2", title: "Тестовый чат 2", userId: "user-id-123" },
    ];

    mockedGetUserSession.mockResolvedValueOnce({
      user: { id: "user-id-123" },
    });

    mockDbFindManyChats.mockImplementationOnce((args: any) => {
      // Имитируем выполнение внутренних условий Drizzle
      if (typeof args?.where === "function") args.where();
      if (typeof args?.orderBy === "function") args.orderBy();
      return Promise.resolve(mockChatsFromDb);
    });

    const result = await chatsGetHandler({} as any);

    expect(mockedGetUserSession).toHaveBeenCalledOnce();
    expect(mockDbFindManyChats).toHaveBeenCalledOnce();
    expect(result).toEqual(mockChatsFromDb);
  });

  it("должен использовать ID сессии в качестве запасного варианта, если user.id отсутствует", async () => {
    const mockChatsWithSessionId = [
      { id: "chat-id-3", title: "Чат по ID сессии", userId: "session-id-456" },
    ];

    // Nuxt auth-utils предоставляет ID сессии, даже если вход через OAuth не выполнен
    mockedGetUserSession.mockResolvedValueOnce({
      id: "session-id-456",
    });
    mockDbFindManyChats.mockResolvedValueOnce(mockChatsWithSessionId);

    const result = await chatsGetHandler({} as any);

    expect(mockedGetUserSession).toHaveBeenCalledOnce();
    expect(mockDbFindManyChats).toHaveBeenCalledOnce();
    expect(result).toEqual(mockChatsWithSessionId);
  });

  it("должен возвращать все чаты, если пользователь является администратором", async () => {
    mockedGetUserSession.mockResolvedValueOnce({
      user: { id: "admin-id", isAdmin: true },
    });

    mockDbFindManyChats.mockResolvedValueOnce([
      { id: "c1", userId: "u1" },
      { id: "c2", userId: "u2" },
    ]);

    const result = await chatsGetHandler({} as any);

    expect(result).toHaveLength(2);
    // Проверяем, что условие where для findMany пустое (undefined)
    const callArgs = mockDbFindManyChats.mock.calls[0]![0];
    expect(callArgs.where).toBeUndefined();
  });
});
