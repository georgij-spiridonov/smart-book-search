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
const { mockDbFindFirstChat, mockDbDeleteReturning, mockDbDeleteWhere, mockDbDelete } =
  vi.hoisted(() => {
    const findFirstMock = vi.fn();
    const deleteReturningMock = vi.fn();
    const deleteWhereMock = vi.fn(() => ({
      returning: deleteReturningMock,
    }));
    const deleteMock = vi.fn(() => ({
      where: deleteWhereMock,
    }));

    return {
      mockDbFindFirstChat: findFirstMock,
      mockDbDeleteReturning: deleteReturningMock,
      mockDbDeleteWhere: deleteWhereMock,
      mockDbDelete: deleteMock,
    };
  });

vi.mock("hub:db", () => ({
  db: {
    query: {
      chats: {
        findFirst: (...args: any[]) => mockDbFindFirstChat(...args),
      },
    },
    delete: mockDbDelete,
  },
  schema: {
    chats: {
      id: "chats.id",
      userId: "chats.userId",
    },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

import chatDeleteByIdHandler from "../api/chats/[id].delete";

describe("Удаление конкретного чата: DELETE /api/chats/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("должен возвращать ошибку 401, если пользователь не авторизован", async () => {
    mockedGetUserSession.mockResolvedValueOnce({});

    await expect(chatDeleteByIdHandler({} as any)).rejects.toThrowError(
      "Не авторизован",
    );
  });

  it("должен возвращать ошибку 404, если чат не найден", async () => {
    mockedGetUserSession.mockResolvedValueOnce({ user: { id: "user-id-123" } });
    mockedGetRouterParams.mockReturnValue({ id: "unknown-chat-id" });
    mockDbFindFirstChat.mockResolvedValueOnce(undefined);

    await expect(chatDeleteByIdHandler({} as any)).rejects.toThrowError(
      "Чат не найден",
    );
  });

  it("должен возвращать ошибку 400, если ID чата отсутствует", async () => {
    mockedGetUserSession.mockResolvedValueOnce({ user: { id: "user-id-123" } });
    mockedGetRouterParams.mockReturnValue({});

    await expect(chatDeleteByIdHandler({} as any)).rejects.toThrowError(
      "Неверный запрос: Отсутствует параметр id",
    );
  });

  it("должен возвращать ошибку 403, если пользователь пытается удалить чужой чат", async () => {
    mockedGetUserSession.mockResolvedValueOnce({ user: { id: "user-id-1" } });
    mockedGetRouterParams.mockReturnValue({ id: "chat-1" });
    mockDbFindFirstChat.mockResolvedValueOnce({ id: "chat-1", userId: "user-id-2" });

    await expect(chatDeleteByIdHandler({} as any)).rejects.toThrowError(
      "Отказано в доступе: Вы можете удалять только свои чаты",
    );
  });

  it("должен разрешать удаление чужого чата, если пользователь — администратор", async () => {
    const mockChatData = {
      id: "chat-1",
      userId: "user-id-2",
    };

    mockedGetUserSession.mockResolvedValueOnce({ user: { id: "admin-1", isAdmin: true } });
    mockedGetRouterParams.mockReturnValue({ id: "chat-1" });
    mockDbFindFirstChat.mockResolvedValueOnce(mockChatData);
    mockDbDeleteReturning.mockResolvedValueOnce([mockChatData]);

    const result = await chatDeleteByIdHandler({} as any);

    expect(result).toEqual([mockChatData]);
    expect(mockDbDelete).toHaveBeenCalled();
  });

  it("должен успешно удалять и возвращать данные удаленного чата, если запрос валиден", async () => {
    const mockChatData = {
      id: "chat-to-delete-id",
      title: "Удаляемый чат",
      userId: "user-id-123",
    };

    mockedGetUserSession.mockResolvedValueOnce({ user: { id: "user-id-123" } });
    mockedGetRouterParams.mockReturnValue({ id: "chat-to-delete-id" });
    mockDbFindFirstChat.mockResolvedValueOnce(mockChatData);
    mockDbDeleteReturning.mockResolvedValueOnce([mockChatData]);

    const result = await chatDeleteByIdHandler({} as any);

    expect(mockedGetUserSession).toHaveBeenCalledOnce();
    expect(mockedGetRouterParams).toHaveBeenCalledOnce();
    expect(mockDbDelete).toHaveBeenCalled();
    expect(mockDbDeleteWhere).toHaveBeenCalledOnce();
    expect(mockDbDeleteReturning).toHaveBeenCalledOnce();

    expect(result).toEqual([mockChatData]);
  });
});
