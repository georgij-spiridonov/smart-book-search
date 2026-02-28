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
const mockFindFirst = vi.fn();
vi.mock("hub:db", () => ({
  db: {
    query: {
      chats: {
        findFirst: (...args: any[]) => mockFindFirst(...args),
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

import chatGetHandler from "../api/chats/[id].get";

describe("GET /api/chats/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should throw 401 Unauthorized if user is not logged in", async () => {
    mockedGetUserSession.mockResolvedValueOnce({});

    await expect(chatGetHandler({} as any)).rejects.toThrowError(
      "Unauthorized",
    );
  });

  it("should throw 404 Not Found if chat doesn't exist", async () => {
    mockedGetUserSession.mockResolvedValueOnce({ user: { id: "user-123" } });
    mockedGetRouterParams.mockReturnValue({ id: "chat-unknown" });
    mockFindFirst.mockResolvedValueOnce(null);

    await expect(chatGetHandler({} as any)).rejects.toThrowError(
      "Chat not found",
    );
  });

  it("should return the chat and messages if chat exists and belongs to user", async () => {
    const mockChat = {
      id: "chat-yes",
      title: "Valid Chat",
      userId: "user-123",
      messages: [{ id: "msg-1", role: "user", text: "hello" }],
    };

    mockedGetUserSession.mockResolvedValueOnce({ user: { id: "user-123" } });
    mockedGetRouterParams.mockReturnValue({ id: "chat-yes" });
    mockFindFirst.mockImplementationOnce((args: any) => {
      if (typeof args?.where === "function") args.where();
      if (typeof args?.with?.messages?.orderBy === "function")
        args.with.messages.orderBy();
      return Promise.resolve(mockChat);
    });
    const result = await chatGetHandler({} as any);

    expect(mockedGetUserSession).toHaveBeenCalledOnce();
    expect(mockedGetRouterParams).toHaveBeenCalledOnce();
    expect(mockFindFirst).toHaveBeenCalledOnce();

    expect(result).toEqual(mockChat);
  });
});
