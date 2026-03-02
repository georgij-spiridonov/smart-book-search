import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Nuxt auto-imports
const { mockedGetUserSession } = vi.hoisted(() => {
  const sessionMock = vi.fn();

  (globalThis as any).defineEventHandler = vi.fn((handler: any) => handler);
  (globalThis as any).createError = vi.fn((err: any) => {
    const error = new Error(err.message || "Error");
    (error as any).statusCode = err.statusCode;
    return error;
  });
  (globalThis as any).getUserSession = sessionMock as any;

  return { mockedGetUserSession: sessionMock };
});

// Mock DB
const mockFindMany = vi.fn();
vi.mock("hub:db", () => ({
  db: {
    query: {
      chats: {
        findMany: (...args: any[]) => mockFindMany(...args),
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

describe("GET /api/chats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should throw 401 Unauthorized if user is not logged in", async () => {
    mockedGetUserSession.mockResolvedValueOnce({}); // No user, no id

    await expect(chatsGetHandler({} as any)).rejects.toThrowError(
      "Не авторизован",
    );
  });

  it("should return a list of chats for the logged-in user", async () => {
    const mockDbChats = [
      { id: "chat-1", title: "Test Chat 1", userId: "user-123" },
      { id: "chat-2", title: "Test Chat 2", userId: "user-123" },
    ];

    mockedGetUserSession.mockResolvedValueOnce({
      user: { id: "user-123" },
    });
    mockFindMany.mockImplementationOnce((args: any) => {
      if (typeof args?.where === "function") args.where();
      if (typeof args?.orderBy === "function") args.orderBy();
      return Promise.resolve(mockDbChats);
    });
    const result = await chatsGetHandler({} as any);

    expect(mockedGetUserSession).toHaveBeenCalledOnce();
    expect(mockFindMany).toHaveBeenCalledOnce();
    expect(result).toEqual(mockDbChats);
  });

  it("should use session id fallback if user.id is not available", async () => {
    const mockDbChats = [
      { id: "chat-3", title: "Fallback Session Chat", userId: "session-456" },
    ];

    // Auth-utils gives us a session.id even if not logged in via oauth
    mockedGetUserSession.mockResolvedValueOnce({
      id: "session-456",
    });
    mockFindMany.mockResolvedValueOnce(mockDbChats);

    const result = await chatsGetHandler({} as any);

    expect(mockedGetUserSession).toHaveBeenCalledOnce();
    expect(mockFindMany).toHaveBeenCalledOnce();
    expect(result).toEqual(mockDbChats);
  });
});
