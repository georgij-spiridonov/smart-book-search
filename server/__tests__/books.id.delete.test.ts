import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";

/**
 * Глобальные имитации (Mocks) для окружения Nuxt/H3.
 * Используем vi.hoisted для обеспечения доступности моков до импорта обработчика.
 */
const { mockedGetRouterParam, mockedUseRuntimeConfig } = vi.hoisted(() => {
  (globalThis as any).defineEventHandler = vi.fn((handler: any) => handler);
  (globalThis as any).createError = vi.fn((errorData: { statusCode: number; message: string }) => {
    const error = new Error(errorData.message || "Ошибка сервера");
    (error as any).statusCode = errorData.statusCode;
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

/**
 * Имитации внутренних сервисов и утилит.
 */
const {
  mockPineconeDeleteMany,
  mockVercelBlobDelete,
  mockGetBookFromStore,
  mockDeleteBookFromStore,
  mockDeleteHashesByBlobUrl,
  mockGetUserSession,
  mockPublishEvent,
} = vi.hoisted(() => ({
  mockPineconeDeleteMany: vi.fn(),
  mockVercelBlobDelete: vi.fn(),
  mockGetBookFromStore: vi.fn(),
  mockDeleteBookFromStore: vi.fn(),
  mockDeleteHashesByBlobUrl: vi.fn(),
  mockGetUserSession: vi.fn(() => Promise.resolve({ user: { id: "test-user" } })),
  mockPublishEvent: vi.fn(),
}));

// Привязка сессии пользователя к глобальному объекту
(globalThis as any).getUserSession = mockGetUserSession;

// Настройка моков для сторонних библиотек и локальных модулей
vi.mock("@pinecone-database/pinecone", () => {
  class MockPineconeIndex {
    deleteMany = mockPineconeDeleteMany;
  }
  class MockPinecone {
    index() {
      return new MockPineconeIndex();
    }
  }
  return { Pinecone: MockPinecone };
});

vi.mock("@vercel/blob", () => ({
  del: mockVercelBlobDelete,
}));

vi.mock("../utils/bookStore", () => ({
  getBook: mockGetBookFromStore,
  deleteBook: mockDeleteBookFromStore,
}));

vi.mock("../utils/hashStore", () => ({
  deleteHashesByBlobUrl: mockDeleteHashesByBlobUrl,
}));

vi.mock("../utils/events", () => ({
  publishEvent: mockPublishEvent,
}));

vi.mock("../utils/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import deleteBookHandler from "../api/books/[id].delete";

describe("Удаление книги: DELETE /api/books/[id]", () => {
  const dummyEvent = {} as unknown as H3Event;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("должен возвращать 400, если ID книги отсутствует", async () => {
    mockedGetRouterParam.mockReturnValueOnce(undefined);

    await expect(deleteBookHandler(dummyEvent)).rejects.toThrowError(
      "Требуется ID книги",
    );
  });

  it("должен возвращать 404, если книга не найдена в хранилище", async () => {
    mockedGetRouterParam.mockReturnValueOnce("unknown-book-id");
    mockGetBookFromStore.mockResolvedValueOnce(null);

    await expect(deleteBookHandler(dummyEvent)).rejects.toThrowError(
      "Книга не найдена",
    );
  });

  it("должен успешно удалить книгу из Pinecone, Blob и Redis", async () => {
    const mockBookData = {
      id: "valid-book-id",
      userId: "test-user",
      title: "Тестовая книга",
      blobUrl: "https://blob.test/book.txt",
    };

    mockedGetRouterParam.mockReturnValueOnce("valid-book-id");
    mockGetBookFromStore.mockResolvedValueOnce(mockBookData);
    mockPineconeDeleteMany.mockResolvedValueOnce(undefined);
    mockVercelBlobDelete.mockResolvedValueOnce(undefined);
    mockDeleteBookFromStore.mockResolvedValueOnce(undefined);

    const result = await deleteBookHandler(dummyEvent);

    expect(mockGetBookFromStore).toHaveBeenCalledWith("valid-book-id");
    expect(mockPineconeDeleteMany).toHaveBeenCalledWith({
      filter: { bookId: "valid-book-id" },
    });
    expect(mockVercelBlobDelete).toHaveBeenCalledWith("https://blob.test/book.txt", {
      token: "test-blob-token",
    });
    expect(mockDeleteHashesByBlobUrl).toHaveBeenCalledWith(
      "https://blob.test/book.txt",
    );
    expect(mockDeleteBookFromStore).toHaveBeenCalledWith("valid-book-id");

    expect(result).toEqual({
      status: "success",
      message: 'Книга "Тестовая книга" была полностью удалена.',
    });
  });

  it("должен продолжать удаление, даже если Pinecone вернул ошибку", async () => {
    const mockBookData = {
      id: "pc-fail-id",
      userId: "test-user",
      title: "Книга с ошибкой Pinecone",
      blobUrl: "https://blob.test/book.txt",
    };

    mockedGetRouterParam.mockReturnValueOnce("pc-fail-id");
    mockGetBookFromStore.mockResolvedValueOnce(mockBookData);
    mockPineconeDeleteMany.mockRejectedValueOnce(new Error("Ошибка сети Pinecone"));
    mockVercelBlobDelete.mockResolvedValueOnce(undefined);
    mockDeleteBookFromStore.mockResolvedValueOnce(undefined);

    const result = await deleteBookHandler(dummyEvent);

    expect(mockVercelBlobDelete).toHaveBeenCalledOnce();
    expect(mockDeleteHashesByBlobUrl).toHaveBeenCalledOnce();
    expect(mockDeleteBookFromStore).toHaveBeenCalledOnce();
    expect(result.status).toBe("success");
  });

  it("должен продолжать удаление, даже если Vercel Blob вернул ошибку", async () => {
    const mockBookData = {
      id: "blob-fail-id",
      userId: "test-user",
      title: "Книга с ошибкой Blob",
      blobUrl: "https://blob.test/book.txt",
    };

    mockedGetRouterParam.mockReturnValueOnce("blob-fail-id");
    mockGetBookFromStore.mockResolvedValueOnce(mockBookData);
    mockPineconeDeleteMany.mockResolvedValueOnce(undefined);
    mockVercelBlobDelete.mockRejectedValueOnce(new Error("Blob не найден"));
    mockDeleteBookFromStore.mockResolvedValueOnce(undefined);

    const result = await deleteBookHandler(dummyEvent);

    expect(mockPineconeDeleteMany).toHaveBeenCalledOnce();
    expect(mockDeleteBookFromStore).toHaveBeenCalledOnce();
    expect(result.status).toBe("success");
  });

  it("должен пропускать удаление из Vercel Blob, если у книги нет blobUrl", async () => {
    const mockBookData = {
      id: "no-blob-id",
      userId: "test-user",
      title: "Книга без Blob",
      blobUrl: "", 
    };

    mockedGetRouterParam.mockReturnValueOnce("no-blob-id");
    mockGetBookFromStore.mockResolvedValueOnce(mockBookData);
    mockPineconeDeleteMany.mockResolvedValueOnce(undefined);
    mockDeleteBookFromStore.mockResolvedValueOnce(undefined);

    const result = await deleteBookHandler(dummyEvent);

    expect(mockVercelBlobDelete).not.toHaveBeenCalled();
    expect(mockDeleteHashesByBlobUrl).not.toHaveBeenCalled();
    expect(mockDeleteBookFromStore).toHaveBeenCalledWith("no-blob-id");
    expect(result.status).toBe("success");
  });

  it("должен возвращать 500 при возникновении непредвиденной внутренней ошибки", async () => {
    const mockBookData = {
      id: "internal-error-id",
      userId: "test-user",
      title: "Книга с ошибкой",
      blobUrl: "https://blob.test/err.txt",
    };

    mockedGetRouterParam.mockReturnValueOnce("internal-error-id");
    mockGetBookFromStore.mockResolvedValueOnce(mockBookData);
    mockDeleteBookFromStore.mockRejectedValueOnce(new Error("Ошибка соединения с Redis"));

    await expect(deleteBookHandler(dummyEvent)).rejects.toThrowError(
      "Не удалось полностью удалить книгу",
    );
  });

  it("должен корректно обрабатывать не-Error объекты в блоке catch", async () => {
    const mockBookData = {
      id: "primitive-fail-id",
      userId: "test-user",
      title: "Книга с примитивной ошибкой",
      blobUrl: "https://blob.test/err2.txt",
    };

    mockedGetRouterParam.mockReturnValueOnce("primitive-fail-id");
    mockGetBookFromStore.mockResolvedValueOnce(mockBookData);
    mockDeleteBookFromStore.mockRejectedValueOnce("Неизвестный сбой");

    await expect(deleteBookHandler(dummyEvent)).rejects.toThrowError(
      "Не удалось полностью удалить книгу",
    );
  });

  it("должен пропускать удаление из Pinecone, если конфигурация отсутствует", async () => {
    const mockBookData = {
      id: "no-config-id",
      userId: "test-user",
      title: "Без конфигурации",
      blobUrl: "",
    };
    mockedGetRouterParam.mockReturnValueOnce("no-config-id");
    mockGetBookFromStore.mockResolvedValueOnce(mockBookData);

    // Имитируем отсутствие конфигурации
    mockedUseRuntimeConfig.mockReturnValueOnce({
      pineconeApiKey: "",
      pineconeIndex: "",
      blobToken: "test-token",
    });

    const result = await deleteBookHandler(dummyEvent);

    expect(mockPineconeDeleteMany).not.toHaveBeenCalled();
    expect(result.status).toBe("success");
  });

  it("должен возвращать 403, если пользователь не является владельцем книги", async () => {
    const mockBookData = {
      id: "other-user-book-id",
      userId: "other-user-id",
      title: "Чужая книга",
      blobUrl: "https://blob.test/other.txt",
    };

    mockedGetRouterParam.mockReturnValueOnce("other-user-book-id");
    mockGetBookFromStore.mockResolvedValueOnce(mockBookData);

    await expect(deleteBookHandler(dummyEvent)).rejects.toThrowError(
      "Отказано в доступе: Вы можете удалять только загруженные вами книги.",
    );
  });

  it("должен разрешать удаление книги администратору, даже если он не владелец", async () => {
    const mockBookData = {
      id: "other-book-id",
      userId: "other-user-id",
      title: "Чужая книга",
      blobUrl: "",
    };

    mockedGetRouterParam.mockReturnValueOnce("other-book-id");
    mockGetBookFromStore.mockResolvedValueOnce(mockBookData);
    
    // Имитируем сессию администратора
    mockGetUserSession.mockResolvedValueOnce({ 
      user: { id: "admin-id", isAdmin: true } 
    } as any);

    const result = await deleteBookHandler(dummyEvent);
    expect(result.status).toBe("success");
    expect(mockDeleteBookFromStore).toHaveBeenCalledWith("other-book-id");
  });

  it("должен корректно работать для анонимных пользователей (использовать session.id)", async () => {
    const mockBookData = {
      id: "anon-book-id",
      userId: "anon-session-123",
      title: "Анонимная книга",
      blobUrl: "",
    };

    mockedGetRouterParam.mockReturnValueOnce("anon-book-id");
    mockGetBookFromStore.mockResolvedValueOnce(mockBookData);
    
    // Имитируем анонимную сессию (нет user.id, но есть session.id)
    mockGetUserSession.mockResolvedValueOnce({ 
      id: "anon-session-123"
    } as any);

    const result = await deleteBookHandler(dummyEvent);
    expect(result.status).toBe("success");
    expect(mockDeleteBookFromStore).toHaveBeenCalledWith("anon-book-id");
  });
});
