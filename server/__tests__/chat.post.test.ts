import { describe, it, expect, vi, beforeEach } from "vitest";

// =======================
// Mocks for Nuxt Imports
// =======================
const { mockedGetUserSession, mockedReadBody } = vi.hoisted(() => {
  const sessionMock = vi.fn();
  const readBodyMock = vi.fn();

  (globalThis as any).defineEventHandler = vi.fn((handler: any) => handler);
  (globalThis as any).createError = vi.fn((err: any) => {
    const error = new Error(err.statusMessage || "Error");
    (error as any).statusCode = err.statusCode;
    return error;
  });
  (globalThis as any).getUserSession = sessionMock as any;
  (globalThis as any).readBody = readBodyMock as any;

  return {
    mockedGetUserSession: sessionMock,
    mockedReadBody: readBodyMock,
  };
});

// =======================
// Mocks for Local Utils
// =======================
const mockSearchBookKnowledge = vi.fn();
vi.mock("../utils/retrieval", () => ({
  searchBookKnowledge: (...args: any[]) => mockSearchBookKnowledge(...args),
}));

const mockStreamAnswer = vi.fn();
vi.mock("../utils/generateAnswer", () => ({
  streamAnswer: (...args: any[]) => mockStreamAnswer(...args),
}));

const mockGetBook = vi.fn();
vi.mock("../utils/bookStore", () => ({
  getBook: (...args: any[]) => mockGetBook(...args),
}));

vi.mock("../utils/logger", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// =======================
// Mocks for External Libs
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
// Mocks for DB
// =======================
const {
  mockInsert,
  mockUpdate,
  mockInsertValues,
  mockFindMany,
  mockFindFirstChat,
} = vi.hoisted(() => {
  const mockInsertValues = vi.fn();
  const mockUpdateExecute = vi.fn();
  const mockUpdateWhere = vi.fn(() => ({ execute: mockUpdateExecute }));
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
  const mockFindMany = vi.fn();
  const mockFindFirstChat = vi.fn();

  return {
    mockFindMany,
    mockFindFirstChat,
    mockInsertValues,
    mockUpdateExecute,
    mockUpdateWhere,
    mockUpdateSet,
    mockInsert: vi.fn(() => ({ values: mockInsertValues })),
    mockUpdate: vi.fn(() => ({ set: mockUpdateSet })),
  };
});

vi.mock("hub:db", () => ({
  db: {
    query: {
      messages: {
        findMany: (...args: any[]) => mockFindMany(...args),
      },
      chats: {
        findFirst: (...args: any[]) => mockFindFirstChat(...args),
      },
    },
    insert: mockInsert,
    update: mockUpdate,
  },
  schema: {
    chats: {
      id: "chats.id",
    },
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
// The test target
// =======================
import chatPostHandler from "../api/chat.post";

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should throw 401 Unauthorized if user is not logged in", async () => {
    mockedGetUserSession.mockResolvedValueOnce({} as any);

    await expect(chatPostHandler({} as any)).rejects.toThrowError(
      "Unauthorized",
    );
  });

  it("should throw 400 Bad Request if validation fails (e.g., empty query)", async () => {
    mockedGetUserSession.mockResolvedValueOnce({
      id: "anon",
      user: { id: "user-1" },
    } as any);
    mockedReadBody.mockResolvedValueOnce({
      query: "", // Invalid!
      bookIds: ["book-1"],
    });

    await expect(chatPostHandler({} as any)).rejects.toThrowError(
      "Bad Request",
    );
  });

  it("should throw 404 Not Found if a requested book doesn't exist", async () => {
    mockedGetUserSession.mockResolvedValueOnce({
      id: "anon",
      user: { id: "user-1" },
    } as any);
    mockedReadBody.mockResolvedValueOnce({
      query: "Valid query",
      bookIds: ["non-existent-book"],
    });

    mockGetBook.mockResolvedValueOnce(null); // Book not found

    await expect(chatPostHandler({} as any)).rejects.toThrowError("Not Found");
  });

  it("should short-circuit and stream early if all requested books are unvectorized", async () => {
    mockedGetUserSession.mockResolvedValueOnce({
      id: "anon",
      user: { id: "user-1" },
    } as any);
    mockedReadBody.mockResolvedValueOnce({
      query: "Valid query",
      bookIds: ["book-no-vectors"],
    });

    // Book exists but hasn't been vectorized
    mockGetBook.mockResolvedValueOnce({
      id: "book-no-vectors",
      vectorized: false,
    });

    mockCreateUIMessageStream.mockImplementationOnce((config) => {
      const writer = { write: vi.fn(), merge: vi.fn() };
      config.execute({ writer });
      return "mock-stream";
    });

    mockCreateUIMessageStreamResponse.mockImplementationOnce((config) => {
      return `MockResponse-${config.stream}`;
    });

    const result = await chatPostHandler({} as any);

    expect(mockCreateUIMessageStream).toHaveBeenCalledOnce();
    expect(mockCreateUIMessageStreamResponse).toHaveBeenCalledOnce();
    expect(mockSearchBookKnowledge).not.toHaveBeenCalled();
    expect(result).toBe("MockResponse-mock-stream");
  });

  it("should short-circuit and stream early if no relevant context chunks are found", async () => {
    mockedGetUserSession.mockResolvedValueOnce({
      id: "anon",
      user: { id: "user-1" },
    } as any);
    mockedReadBody.mockResolvedValueOnce({
      query: "Random nonsense",
      bookIds: ["book-1"],
    });

    // Book exists and is vectorized
    mockGetBook.mockResolvedValueOnce({
      id: "book-1",
      vectorized: true,
    });

    // But search returns empty chunks array
    mockSearchBookKnowledge.mockResolvedValueOnce([]);

    mockCreateUIMessageStream.mockImplementationOnce((config) => {
      const writer = { write: vi.fn(), merge: vi.fn() };
      config.execute({ writer });
      return "mock-stream-no-context";
    });

    mockCreateUIMessageStreamResponse.mockImplementationOnce((config) => {
      return `MockResponse-${config.stream}`;
    });

    const result = await chatPostHandler({} as any);

    expect(mockSearchBookKnowledge).toHaveBeenCalledOnce();
    expect(mockCreateUIMessageStream).toHaveBeenCalledOnce();
    expect(mockCreateUIMessageStreamResponse).toHaveBeenCalledOnce();
    expect(mockStreamAnswer).not.toHaveBeenCalled();
    expect(result).toBe("MockResponse-mock-stream-no-context");
  });

  it("should stream answer using LLM when context is found", async () => {
    mockedGetUserSession.mockResolvedValueOnce({
      id: "anon",
      user: { id: "user-1" },
    } as any);
    mockedReadBody.mockResolvedValueOnce({
      query: "What is AI?",
      bookIds: ["book-1"],
    });

    // Book exists and is vectorized
    mockGetBook.mockResolvedValueOnce({
      id: "book-1",
      vectorized: true,
    });

    // Search yields context
    const chunks = [{ text: "AI is cool.", score: 0.9, bookId: "book-1" }];
    mockSearchBookKnowledge.mockResolvedValueOnce(chunks);

    // Mock stream result
    mockStreamAnswer.mockReturnValueOnce({
      toUIMessageStream: vi.fn(() => "merged-stream-content"),
    });

    mockGenerateText.mockResolvedValueOnce({ text: "Generated Title" });

    mockCreateUIMessageStream.mockImplementationOnce(async (config: any) => {
      const writer = { write: vi.fn(), merge: vi.fn() };
      config.execute({ writer });
      if (config.onFinish) {
        await config.onFinish({
          messages: [
            {
              role: "assistant",
              parts: [{ type: "text", text: "answer" }],
            } as any,
          ],
        });
      }
      return "mock-stream-answer";
    });

    mockCreateUIMessageStreamResponse.mockImplementationOnce(async (config) => {
      const streamVal = await config.stream;
      return `MockResponse-${streamVal}`;
    });
    const event = {
      waitUntil: vi.fn(),
    };

    const result = await chatPostHandler(event as any);

    expect(mockSearchBookKnowledge).toHaveBeenCalledOnce();
    expect(mockInsert).toHaveBeenCalledTimes(3); // insert new chat, insert 'user' msg, insert 'assistant' msg
    expect(mockInsertValues).toHaveBeenCalledTimes(3);
    expect(mockCreateUIMessageStream).toHaveBeenCalledOnce();
    expect(mockStreamAnswer).toHaveBeenCalledOnce();
    expect(mockCreateUIMessageStreamResponse).toHaveBeenCalledOnce();

    expect(event.waitUntil).toHaveBeenCalledOnce();
    await event.waitUntil.mock.calls[0]![0]; // wait for generateText
    expect(mockUpdate).toHaveBeenCalledOnce();

    expect(result).toBe("MockResponse-mock-stream-answer");
  });

  it("should handle error in createUIMessageStream callback", async () => {
    mockedGetUserSession.mockResolvedValueOnce({
      user: { id: "user-1" },
    } as any);
    mockedReadBody.mockResolvedValueOnce({
      query: "Test Error",
      bookIds: ["book-err"],
    });
    mockGetBook.mockResolvedValueOnce({ id: "book-err", vectorized: true });
    mockSearchBookKnowledge.mockResolvedValueOnce([
      { text: "ctx", score: 0.9, bookId: "book-err" },
    ]);
    mockStreamAnswer.mockReturnValueOnce({ toUIMessageStream: vi.fn() });

    mockCreateUIMessageStream.mockImplementationOnce((config: any) => {
      if (config.onError) {
        expect(config.onError(new Error("Stream failure"))).toBe(
          "Произошла ошибка при генерации ответа. Попробуйте ещё раз.",
        );
      }
      return "mock-stream";
    });

    const event = { waitUntil: vi.fn() };
    await chatPostHandler(event as any);
  });

  it("should throw 403 Forbidden if user requests chat belonging to another user", async () => {
    mockedGetUserSession.mockResolvedValueOnce({
      id: "anon",
      user: { id: "user-1" },
    } as any);
    mockedReadBody.mockResolvedValueOnce({
      query: "Random question",
      bookIds: ["book-2"],
      chatId: "other-users-chat",
    });

    mockFindFirstChat.mockResolvedValueOnce({
      id: "other-users-chat",
      userId: "user-2", // Different user
    });

    await expect(chatPostHandler({} as any)).rejects.toThrowError("Forbidden");
  });

  it("should throw 404 Not Found if requested chat does not exist", async () => {
    mockedGetUserSession.mockResolvedValueOnce({
      id: "anon",
      user: { id: "user-1" },
    } as any);
    mockedReadBody.mockResolvedValueOnce({
      query: "Random question",
      bookIds: ["book-2"],
      chatId: "nonexistent-chat",
    });

    mockFindFirstChat.mockResolvedValueOnce(undefined);

    await expect(chatPostHandler({} as any)).rejects.toThrowError(
      "Chat not found",
    );
  });

  it("should fetch history and not insert new chat if chatId is provided", async () => {
    mockedGetUserSession.mockResolvedValueOnce({
      id: "anon",
      user: { id: "user-1" },
    } as any);
    mockedReadBody.mockResolvedValueOnce({
      query: "Second question",
      bookIds: ["book-2"],
      chatId: "existing-chat-id",
    });

    mockFindFirstChat.mockResolvedValueOnce({
      id: "existing-chat-id",
      userId: "user-1",
    });

    mockFindMany.mockImplementationOnce((args: any) => {
      args?.where?.();
      args?.orderBy?.();
      return Promise.resolve([
        { role: "user", parts: [{ text: "First question" }] },
      ]);
    });

    mockGetBook.mockResolvedValueOnce({
      id: "book-2",
      vectorized: true,
    });

    mockSearchBookKnowledge.mockResolvedValueOnce([
      { text: "context.", score: 0.8 },
    ]);

    mockStreamAnswer.mockReturnValueOnce({
      toUIMessageStream: vi.fn(),
    });

    mockCreateUIMessageStream.mockImplementationOnce((config) => {
      const writer = { write: vi.fn(), merge: vi.fn() };
      config.execute({ writer });
      return "mock-stream-existing";
    });

    mockCreateUIMessageStreamResponse.mockReturnValueOnce("MockResponse");

    const event = { waitUntil: vi.fn() };
    await chatPostHandler(event as any);

    expect(mockFindMany).toHaveBeenCalledOnce();
    expect(mockInsert).toHaveBeenCalledTimes(1); // insert 'user' msg, but NOT new chat
  });
});
