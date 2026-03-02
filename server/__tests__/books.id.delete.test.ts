import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockedGetRouterParam, mockedUseRuntimeConfig } = vi.hoisted(() => {
  (globalThis as any).defineEventHandler = vi.fn((handler: any) => handler);
  (globalThis as any).createError = vi.fn((err: any) => {
    const error = new Error(err.message || "Error");
    (error as any).statusCode = err.statusCode;
    return error;
  });

  const getRouterParamMock = vi.fn();
  (globalThis as any).getRouterParam = getRouterParamMock;

  const useRuntimeConfigMock = vi.fn(() => ({
    pineconeApiKey: "test-pinecone-key",
    pineconeIndex: "test-index",
    blobToken: "test-blob-token",
  }));
  (globalThis as any).useRuntimeConfig = useRuntimeConfigMock;

  return {
    mockedGetRouterParam: getRouterParamMock,
    mockedUseRuntimeConfig: useRuntimeConfigMock,
  };
});

const {
  mockDeleteMany,
  mockDel,
  mockGetBook,
  mockDeleteBook,
  mockDeleteHashesByBlobUrl,
  mockGetUserSession,
  mockPublishEvent,
} = vi.hoisted(() => ({
  mockDeleteMany: vi.fn(),
  mockDel: vi.fn(),
  mockGetBook: vi.fn(),
  mockDeleteBook: vi.fn(),
  mockDeleteHashesByBlobUrl: vi.fn(),
  mockGetUserSession: vi.fn(() => Promise.resolve({ user: { id: "test-user" } })),
  mockPublishEvent: vi.fn(),
}));

// Mock h3 global session
(globalThis as any).getUserSession = mockGetUserSession;

// Mock 3rd-party services & local utils
vi.mock("@pinecone-database/pinecone", () => {
  class MockPineconeIndex {
    deleteMany = mockDeleteMany;
  }
  class MockPinecone {
    index() {
      return new MockPineconeIndex();
    }
  }
  return { Pinecone: MockPinecone };
});

vi.mock("@vercel/blob", () => ({
  del: mockDel,
}));

vi.mock("../utils/bookStore", () => ({
  getBook: mockGetBook,
  deleteBook: mockDeleteBook,
}));

vi.mock("../utils/hashStore", () => ({
  deleteHashesByBlobUrl: mockDeleteHashesByBlobUrl,
}));

vi.mock("../utils/events", () => ({
  publishEvent: mockPublishEvent,
}));

vi.mock("../utils/logger", () => ({
  log: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import deleteBookHandler from "../api/books/[id].delete";

describe("DELETE /api/books/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should throw 400 if ID is missing", async () => {
    mockedGetRouterParam.mockReturnValueOnce(undefined);

    await expect(deleteBookHandler({} as any)).rejects.toThrowError(
      "Требуется ID книги",
    );
  });

  it("should throw 404 if book is not found in store", async () => {
    mockedGetRouterParam.mockReturnValueOnce("unknown-book");
    mockGetBook.mockResolvedValueOnce(null);

    await expect(deleteBookHandler({} as any)).rejects.toThrowError(
      "Книга не найдена",
    );
  });

  it("should successfully delete a book from Pinecone, Blob, and Redis", async () => {
    const mockBook = {
      id: "valid-book",
      userId: "test-user",
      title: "My Book",
      blobUrl: "https://blob.test/valid-book.txt",
    };

    mockedGetRouterParam.mockReturnValueOnce("valid-book");
    mockGetBook.mockResolvedValueOnce(mockBook);
    mockDeleteMany.mockResolvedValueOnce(undefined);
    mockDel.mockResolvedValueOnce(undefined);
    mockDeleteBook.mockResolvedValueOnce(undefined);

    const result = await deleteBookHandler({} as any);

    expect(mockGetBook).toHaveBeenCalledWith("valid-book");
    expect(mockDeleteMany).toHaveBeenCalledWith({
      filter: { bookId: "valid-book" },
    });
    expect(mockDel).toHaveBeenCalledWith("https://blob.test/valid-book.txt", {
      token: "test-blob-token",
    });
    expect(mockDeleteHashesByBlobUrl).toHaveBeenCalledWith(
      "https://blob.test/valid-book.txt",
    );
    expect(mockDeleteBook).toHaveBeenCalledWith("valid-book");

    expect(result).toEqual({
      status: "success",
      message: 'Книга "My Book" была полностью удалена.',
    });
  });

  it("should continue deletion even if Pinecone fails", async () => {
    const mockBook = {
      id: "valid-book-pinecone-fail",
      userId: "test-user",
      title: "My Book",
      blobUrl: "https://blob.test/valid-book.txt",
    };

    mockedGetRouterParam.mockReturnValueOnce("valid-book-pinecone-fail");
    mockGetBook.mockResolvedValueOnce(mockBook);
    mockDeleteMany.mockRejectedValueOnce(new Error("Pinecone network error"));
    mockDel.mockResolvedValueOnce(undefined);
    mockDeleteBook.mockResolvedValueOnce(undefined);

    const result = await deleteBookHandler({} as any);

    // Ensure it still deleted from Blob and DB
    expect(mockDel).toHaveBeenCalledOnce();
    expect(mockDeleteHashesByBlobUrl).toHaveBeenCalledOnce();
    expect(mockDeleteBook).toHaveBeenCalledOnce();

    expect(result.status).toBe("success");
  });

  it("should continue deletion even if Vercel Blob fails", async () => {
    const mockBook = {
      id: "valid-book-blob-fail",
      userId: "test-user",
      title: "My Book",
      blobUrl: "https://blob.test/valid-book.txt",
    };

    mockedGetRouterParam.mockReturnValueOnce("valid-book-blob-fail");
    mockGetBook.mockResolvedValueOnce(mockBook);
    mockDeleteMany.mockResolvedValueOnce(undefined);
    mockDel.mockRejectedValueOnce(new Error("Blob not found"));
    mockDeleteBook.mockResolvedValueOnce(undefined);

    const result = await deleteBookHandler({} as any);

    // Ensure it still deleted from Pinecone and DB
    expect(mockDeleteMany).toHaveBeenCalledOnce();
    expect(mockDeleteBook).toHaveBeenCalledOnce();

    expect(result.status).toBe("success");
  });

  it("should skip Vercel Blob deletion if book has no blobUrl", async () => {
    const mockBook = {
      id: "no-blob-book",
      userId: "test-user",
      title: "My Book",
      blobUrl: "", // Emulate a book with no blob mapping
    };

    mockedGetRouterParam.mockReturnValueOnce("no-blob-book");
    mockGetBook.mockResolvedValueOnce(mockBook);
    mockDeleteMany.mockResolvedValueOnce(undefined);
    mockDeleteBook.mockResolvedValueOnce(undefined);

    const result = await deleteBookHandler({} as any);

    expect(mockDel).not.toHaveBeenCalled();
    expect(mockDeleteHashesByBlobUrl).not.toHaveBeenCalled();
    expect(mockDeleteBook).toHaveBeenCalledWith("no-blob-book");
    expect(result.status).toBe("success");
  });

  it("should throw 500 if an unexpected internal error occurs", async () => {
    const mockBook = {
      id: "error-book",
      userId: "test-user",
      title: "My Book",
      blobUrl: "https://blob.test/err.txt",
    };

    mockedGetRouterParam.mockReturnValueOnce("error-book");
    mockGetBook.mockResolvedValueOnce(mockBook);
    mockDeleteBook.mockRejectedValueOnce(new Error("Redis connection failure"));

    await expect(deleteBookHandler({} as any)).rejects.toThrowError(
      "Не удалось полностью удалить книгу",
    );
  });

  it("should handle non-Error objects thrown in catch block", async () => {
    const mockBook = {
      id: "error-book-2",
      userId: "test-user",
      title: "My Book",
      blobUrl: "https://blob.test/err2.txt",
    };

    mockedGetRouterParam.mockReturnValueOnce("error-book-2");
    mockGetBook.mockResolvedValueOnce(mockBook);
    mockDeleteBook.mockRejectedValueOnce("Unknown primitive failure");

    await expect(deleteBookHandler({} as any)).rejects.toThrowError(
      "Не удалось полностью удалить книгу",
    );
  });

  it("should skip Pinecone deletion if config is missing", async () => {
    const mockBook = {
      id: "no-pc-config",
      userId: "test-user",
      title: "No PC",
      blobUrl: "",
    };
    mockedGetRouterParam.mockReturnValueOnce("no-pc-config");
    mockGetBook.mockResolvedValueOnce(mockBook);

    // Simulate missing config
    mockedUseRuntimeConfig.mockReturnValueOnce({
      pineconeApiKey: "",
      pineconeIndex: "",
      blobToken: "test",
    });

    const result = await deleteBookHandler({} as any);

    expect(mockDeleteMany).not.toHaveBeenCalled();
    expect(result.status).toBe("success");
  });

  it("should handle non-Error objects when Pinecone deletion fails", async () => {
    const mockBook = {
      id: "pc-non-error",
      userId: "test-user",
      title: "PC Error",
      blobUrl: "",
    };
    mockedGetRouterParam.mockReturnValueOnce("pc-non-error");
    mockGetBook.mockResolvedValueOnce(mockBook);
    mockDeleteMany.mockRejectedValueOnce("Pinecone crashed");

    const result = await deleteBookHandler({} as any);
    expect(result.status).toBe("success");
  });

  it("should throw 403 if user is not the owner", async () => {
    const mockBook = {
      id: "other-user-book",
      userId: "other-user",
      title: "Other Book",
      blobUrl: "https://blob.test/other.txt",
    };

    mockedGetRouterParam.mockReturnValueOnce("other-user-book");
    mockGetBook.mockResolvedValueOnce(mockBook);

    await expect(deleteBookHandler({} as any)).rejects.toThrowError(
      "Отказано в доступе: Вы можете удалять только загруженные вами книги.",
    );
  });

  it("should handle non-Error objects when Vercel Blob deletion fails", async () => {
    const mockBook = {
      id: "blob-non-error",
      userId: "test-user",
      title: "Blob Error",
      blobUrl: "http://blob",
    };
    mockedGetRouterParam.mockReturnValueOnce("blob-non-error");
    mockGetBook.mockResolvedValueOnce(mockBook);
    mockDel.mockRejectedValueOnce("Blob crashed");

    const result = await deleteBookHandler({} as any);
    expect(result.status).toBe("success");
  });
});
