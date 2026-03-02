import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Nuxt auto-imports
const { mockedGetUserSession, mockedGetRouterParams } = vi.hoisted(() => {
  const sessionMock = vi.fn();
  const paramsMock = vi.fn();

  (globalThis as any).defineEventHandler = vi.fn((handler: any) => handler);
  (globalThis as any).createError = vi.fn((err: any) => {
    const error = new Error(err.statusMessage || "Error");
    (error as any).statusCode = err.statusCode;
    return error;
  });
  (globalThis as any).getUserSession = sessionMock as any;
  (globalThis as any).getRouterParams = paramsMock as any;

  return {
    mockedGetUserSession: sessionMock,
    mockedGetRouterParams: paramsMock,
  };
});

// Mock DB
const { mockFindFirst, mockDeleteReturning, mockDeleteWhere, mockDelete } =
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
      mockFindFirst: findFirstMock,
      mockDeleteReturning: deleteReturningMock,
      mockDeleteWhere: deleteWhereMock,
      mockDelete: deleteMock,
    };
  });

vi.mock("hub:db", () => ({
  db: {
    query: {
      chats: {
        findFirst: (...args: any[]) => mockFindFirst(...args),
      },
    },
    delete: mockDelete,
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

import chatDeleteHandler from "../api/chats/[id].delete";

describe("DELETE /api/chats/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should throw 401 Unauthorized if user is not logged in", async () => {
    mockedGetUserSession.mockResolvedValueOnce({});

    await expect(chatDeleteHandler({} as any)).rejects.toThrowError(
      "Unauthorized",
    );
  });

  it("should throw 404 Not Found if chat doesn't exist", async () => {
    mockedGetUserSession.mockResolvedValueOnce({ user: { id: "user-123" } });
    mockedGetRouterParams.mockReturnValue({ id: "chat-unknown" });

    await expect(chatDeleteHandler({} as any)).rejects.toThrowError(
      "Chat not found",
    );
  });

  it("should delete and return the deleted chat if valid", async () => {
    const mockChat = {
      id: "chat-to-delete",
      title: "Bye Chat",
      userId: "user-123",
    };

    mockedGetUserSession.mockResolvedValueOnce({ user: { id: "user-123" } });
    mockedGetRouterParams.mockReturnValue({ id: "chat-to-delete" });
    mockFindFirst.mockResolvedValueOnce(mockChat);
    mockDeleteReturning.mockResolvedValueOnce([mockChat]);

    const result = await chatDeleteHandler({} as any);

    expect(mockedGetUserSession).toHaveBeenCalledOnce();
    expect(mockedGetRouterParams).toHaveBeenCalledOnce();
    expect(mockDelete).toHaveBeenCalledWith(expect.anything()); // schema.chats
    expect(mockDeleteWhere).toHaveBeenCalledOnce();
    expect(mockDeleteReturning).toHaveBeenCalledOnce();

    expect(result).toEqual([mockChat]);
  });
});
