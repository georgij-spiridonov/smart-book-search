import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockedGetRouterParam, mockedReadBody } = vi.hoisted(() => {
  (globalThis as any).defineEventHandler = vi.fn((handler: any) => handler);
  (globalThis as any).createError = vi.fn((err: any) => {
    const error = new Error(err.statusMessage || "Error");
    (error as any).statusCode = err.statusCode;
    (error as any).data = err.data;
    return error;
  });

  const getRouterParamMock = vi.fn();
  (globalThis as any).getRouterParam = getRouterParamMock;

  const readBodyMock = vi.fn();
  (globalThis as any).readBody = readBodyMock;

  (globalThis as any).getUserSession = vi.fn(async () => ({
    user: { id: "test-user" },
  }));

  return {
    mockedGetRouterParam: getRouterParamMock,
    mockedReadBody: readBodyMock,
  };
});

const { mockGetBook, mockUpdateBook, mockPublishEvent } = vi.hoisted(() => ({
  mockGetBook: vi.fn(),
  mockUpdateBook: vi.fn(),
  mockPublishEvent: vi.fn(),
}));

vi.mock("../utils/bookStore", () => ({
  getBook: mockGetBook,
  updateBook: mockUpdateBook,
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

import patchBookHandler from "../api/books/[id].patch";

describe("PATCH /api/books/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should throw 400 if ID is missing", async () => {
    mockedGetRouterParam.mockReturnValueOnce(undefined);

    await expect(patchBookHandler({} as any)).rejects.toThrowError(
      "Book ID is required",
    );
  });

  it("should throw 400 if body is invalid", async () => {
    mockedGetRouterParam.mockReturnValueOnce("valid-id");
    mockedReadBody.mockResolvedValueOnce({ title: "" }); // Title cannot be empty if provided

    await expect(patchBookHandler({} as any)).rejects.toThrowError(
      "Invalid request body",
    );
  });

  it("should throw 404 if book is not found", async () => {
    mockedGetRouterParam.mockReturnValueOnce("unknown-book");
    mockedReadBody.mockResolvedValueOnce({ title: "New Title" });
    mockGetBook.mockResolvedValueOnce(null);

    await expect(patchBookHandler({} as any)).rejects.toThrowError(
      "Book not found",
    );
  });

  it("should successfully update book metadata and publish event", async () => {
    const mockBook = {
      id: "valid-book",
      title: "Old Title",
      author: "Old Author",
    };

    mockedGetRouterParam.mockReturnValueOnce("valid-book");
    mockedReadBody.mockResolvedValueOnce({
      title: "New Title",
      author: "New Author",
    });
    mockGetBook.mockResolvedValueOnce(mockBook);
    mockUpdateBook.mockResolvedValueOnce(undefined);
    mockPublishEvent.mockResolvedValueOnce(undefined);

    const result = await patchBookHandler({} as any);

    expect(mockGetBook).toHaveBeenCalledWith("valid-book");
    expect(mockUpdateBook).toHaveBeenCalledWith("valid-book", {
      title: "New Title",
      author: "New Author",
    });
    expect(mockPublishEvent).toHaveBeenCalledWith(
      "test-user",
      "book:updated",
      expect.objectContaining({
        bookId: "valid-book",
        status: "updated",
        title: "New Title",
        author: "New Author",
      }),
    );

    expect(result).toEqual({
      status: "success",
      message: "Book metadata updated.",
    });
  });

  it("should throw 500 if updateBook fails", async () => {
    const mockBook = { id: "error-book", title: "Title" };
    mockedGetRouterParam.mockReturnValueOnce("error-book");
    mockedReadBody.mockResolvedValueOnce({ title: "New Title" });
    mockGetBook.mockResolvedValueOnce(mockBook);
    mockUpdateBook.mockRejectedValueOnce(new Error("Redis error"));

    await expect(patchBookHandler({} as any)).rejects.toThrowError(
      "Failed to update book metadata",
    );
  });
});
