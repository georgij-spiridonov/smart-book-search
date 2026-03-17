import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";
import vectorizeHandler from "../api/books/vectorize.post";

vi.hoisted(() => {
  (globalThis as any).defineEventHandler = vi.fn((handler: any) => handler);
  (globalThis as any).createError = vi.fn((errorData: { statusCode: number; message: string }) => {
    const error = new Error(errorData.message || "Ошибка сервера");
    (error as any).statusCode = errorData.statusCode;
    return error;
  });
  (globalThis as any).readBody = vi.fn();
  (globalThis as any).setResponseStatus = vi.fn();

  const useRuntimeConfigMock = vi.fn(() => ({
    pineconeApiKey: "test-api-key",
    pineconeIndex: "test-index",
  }));
  (globalThis as any).useRuntimeConfig = useRuntimeConfigMock;
});

const {
  mockGetUserSession,
  mockGetBook,
  mockGetBookByBlobUrl,
  mockCreateJob,
  mockInngestSend,
  mockGenerateJobId,
} = vi.hoisted(() => ({
  mockGetUserSession: vi.fn(),
  mockGetBook: vi.fn(),
  mockGetBookByBlobUrl: vi.fn(),
  mockCreateJob: vi.fn(),
  mockInngestSend: vi.fn(),
  mockGenerateJobId: vi.fn(() => "job-123"),
}));

(globalThis as any).getUserSession = mockGetUserSession;

vi.mock("../utils/inngest", () => ({
  inngest: {
    send: (...args: any[]) => mockInngestSend(...args),
  },
}));

vi.mock("../utils/jobStore", () => ({
  generateJobId: () => mockGenerateJobId(),
  createJob: (...args: any[]) => mockCreateJob(...args),
}));

vi.mock("../utils/bookStore", () => ({
  getBook: (...args: any[]) => mockGetBook(...args),
  getBookByBlobUrl: (...args: any[]) => mockGetBookByBlobUrl(...args),
}));

vi.mock("../utils/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe("POST /api/books/vectorize", () => {
  const dummyEvent = {} as unknown as H3Event;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserSession.mockResolvedValue({ user: { id: "test-user" } });
  });

  it("должен возвращать 401, если пользователь не авторизован", async () => {
    mockGetUserSession.mockResolvedValueOnce({});
    await expect(vectorizeHandler(dummyEvent)).rejects.toThrow("Не авторизован");
  });

  it("должен возвращать 400 при неверном теле запроса (Zod validation)", async () => {
    (globalThis as any).readBody.mockResolvedValueOnce({
      // missing blobUrl and bookName
    });
    await expect(vectorizeHandler(dummyEvent)).rejects.toThrow();
  });

  it("должен возвращать 404, если книга не найдена", async () => {
    (globalThis as any).readBody.mockResolvedValueOnce({
      blobUrl: "https://blob.url/missing.pdf",
      bookName: "Missing Book",
    });
    mockGetBookByBlobUrl.mockResolvedValueOnce(null);

    await expect(vectorizeHandler(dummyEvent)).rejects.toThrow("Книга не найдена");
  });

  it("должен возвращать 403, если пользователь не является владельцем и не админ", async () => {
    (globalThis as any).readBody.mockResolvedValueOnce({
      bookId: "other-book",
      bookName: "Other Book",
      blobUrl: "https://blob.url/other.pdf",
    });
    mockGetBook.mockResolvedValueOnce({ id: "other-book", userId: "other-user" });

    await expect(vectorizeHandler(dummyEvent)).rejects.toThrow("Отказано в доступе");
  });

  it("должен успешно ставить задачу в очередь (202 Accepted) для владельца", async () => {
    const requestBody = {
      bookId: "my-book",
      bookName: "My Book",
      blobUrl: "https://blob.url/my.pdf",
      author: "Me",
    };
    (globalThis as any).readBody.mockResolvedValueOnce(requestBody);
    mockGetBook.mockResolvedValueOnce({ id: "my-book", userId: "test-user" });

    const result = await vectorizeHandler(dummyEvent);

    expect(mockCreateJob).toHaveBeenCalledWith("job-123", "my-book", "My Book", "test-user");
    expect(mockInngestSend).toHaveBeenCalledWith({
      name: "book/vectorize",
      data: expect.objectContaining({
        jobId: "job-123",
        bookId: "my-book",
        userId: "test-user",
        blobUrl: "https://blob.url/my.pdf",
        bookName: "My Book",
        author: "Me",
      }),
    });
    expect(result.status).toBe("accepted");
    expect(result.jobId).toBe("job-123");
  });

  it("должен успешно ставить задачу в очередь для администратора даже если он не владелец", async () => {
    mockGetUserSession.mockResolvedValueOnce({ user: { id: "admin-id", isAdmin: true } });
    (globalThis as any).readBody.mockResolvedValueOnce({
      bookId: "user-book",
      bookName: "User Book",
      blobUrl: "https://blob.url/user.pdf",
    });
    mockGetBook.mockResolvedValueOnce({ id: "user-book", userId: "user-id" });

    const result = await vectorizeHandler(dummyEvent);

    expect(result.status).toBe("accepted");
    expect(mockInngestSend).toHaveBeenCalled();
  });

  it("должен разрешать bookId по blobUrl, если он не предоставлен", async () => {
    (globalThis as any).readBody.mockResolvedValueOnce({
      bookName: "Implicit Book",
      blobUrl: "https://blob.url/implicit.pdf",
    });
    mockGetBookByBlobUrl.mockResolvedValueOnce({ id: "implicit-id", userId: "test-user" });

    const result = await vectorizeHandler(dummyEvent);

    expect(mockCreateJob).toHaveBeenCalledWith("job-123", "implicit-id", "Implicit Book", "test-user");
    expect(result.status).toBe("accepted");
  });
});
