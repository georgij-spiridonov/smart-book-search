import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";

/**
 * Глобальные имитации (Mocks) для окружения Nuxt/H3.
 */
const { mockedGetRouterParam, mockedReadBody } = vi.hoisted(() => {
  (globalThis as any).defineEventHandler = vi.fn((handler: any) => handler);
  (globalThis as any).createError = vi.fn((errorData: { statusCode: number; message: string; data?: any }) => {
    const error = new Error(errorData.message || "Ошибка сервера");
    (error as any).statusCode = errorData.statusCode;
    (error as any).data = errorData.data;
    return error;
  });

  const getRouterParamMock = vi.fn();
  (globalThis as any).getRouterParam = getRouterParamMock;

  const readBodyMock = vi.fn();
  (globalThis as any).readBody = readBodyMock;

  (globalThis as any).getUserSession = vi.fn(async () => ({
    user: { id: "test-user-id" },
  }));

  return {
    mockedGetRouterParam: getRouterParamMock,
    mockedReadBody: readBodyMock,
  };
});

/**
 * Имитации внутренних сервисов: хранилище книг и события.
 */
const { mockGetBookFromStore, mockUpdateBookInStore, mockPublishEvent } = vi.hoisted(() => ({
  mockGetBookFromStore: vi.fn(),
  mockUpdateBookInStore: vi.fn(),
  mockPublishEvent: vi.fn(),
}));

vi.mock("../utils/bookStore", () => ({
  getBook: mockGetBookFromStore,
  updateBook: mockUpdateBookInStore,
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

import patchBookHandler from "../api/books/[id].patch";

describe("Обновление метаданных книги: PATCH /api/books/[id]", () => {
  const dummyEvent = {} as unknown as H3Event;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("должен возвращать 400, если ID книги отсутствует", async () => {
    mockedGetRouterParam.mockReturnValueOnce(undefined);

    await expect(patchBookHandler(dummyEvent)).rejects.toThrowError(
      "Требуется ID книги",
    );
  });

  it("должен возвращать 400, если тело запроса некорректно", async () => {
    mockedGetRouterParam.mockReturnValueOnce("valid-id");
    // Пустое название книги, если оно передано, считается невалидным согласно Zod схеме в обработчике
    mockedReadBody.mockResolvedValueOnce({ title: "" }); 

    await expect(patchBookHandler(dummyEvent)).rejects.toThrowError(
      "Неверное тело запроса",
    );
  });

  it("должен возвращать 404, если книга не найдена", async () => {
    mockedGetRouterParam.mockReturnValueOnce("unknown-book-id");
    mockedReadBody.mockResolvedValueOnce({ title: "Новое название" });
    mockGetBookFromStore.mockResolvedValueOnce(null);

    await expect(patchBookHandler(dummyEvent)).rejects.toThrowError(
      "Книга не найдена",
    );
  });

  it("должен успешно обновлять метаданные и публиковать событие", async () => {
    const mockBookData = {
      id: "valid-book-id",
      userId: "test-user-id",
      title: "Старое название",
      author: "Старый автор",
    };

    mockedGetRouterParam.mockReturnValueOnce("valid-book-id");
    mockedReadBody.mockResolvedValueOnce({
      title: "Новое название",
      author: "Новый автор",
    });
    mockGetBookFromStore.mockResolvedValueOnce(mockBookData);
    mockUpdateBookInStore.mockResolvedValueOnce(undefined);
    mockPublishEvent.mockResolvedValueOnce(undefined);

    const result = await patchBookHandler(dummyEvent);

    expect(mockGetBookFromStore).toHaveBeenCalledWith("valid-book-id");
    expect(mockUpdateBookInStore).toHaveBeenCalledWith("valid-book-id", {
      title: "Новое название",
      author: "Новый автор",
    });
    expect(mockPublishEvent).toHaveBeenCalledWith(
      "test-user-id",
      "book:updated",
      expect.objectContaining({
        bookId: "valid-book-id",
        status: "updated",
        title: "Новое название",
        author: "Новый автор",
      }),
    );

    expect(result).toEqual({
      status: "success",
      message: "Метаданные книги обновлены.",
    });
  });

  it("должен возвращать 403, если пользователь не является владельцем", async () => {
    const mockBookData = {
      id: "other-user-book-id",
      userId: "someone-else-id",
      title: "Чужая книга",
    };

    mockedGetRouterParam.mockReturnValueOnce("other-user-book-id");
    mockedReadBody.mockResolvedValueOnce({ title: "Попытка изменения" });
    mockGetBookFromStore.mockResolvedValueOnce(mockBookData);

    await expect(patchBookHandler(dummyEvent)).rejects.toThrowError(
      "Отказано в доступе: Вы можете редактировать только загруженные вами книги.",
    );
  });

  it("должен возвращать 500, если обновление в хранилище завершилось ошибкой", async () => {
    const mockBookData = {
      id: "error-book-id",
      userId: "test-user-id",
      title: "Книга",
    };
    mockedGetRouterParam.mockReturnValueOnce("error-book-id");
    mockedReadBody.mockResolvedValueOnce({ title: "Новое название" });
    mockGetBookFromStore.mockResolvedValueOnce(mockBookData);
    mockUpdateBookInStore.mockRejectedValueOnce(new Error("Ошибка Redis"));

    await expect(patchBookHandler(dummyEvent)).rejects.toThrowError(
      "Не удалось обновить метаданные книги",
    );
  });
});
