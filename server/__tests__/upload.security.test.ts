import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";

vi.hoisted(() => {
  (globalThis as any).defineEventHandler = vi.fn((handler: any) => handler);
  (globalThis as any).createError = vi.fn((errorData: { statusCode: number; message: string }) => {
    const error = new Error(errorData.message || "Ошибка сервера");
    (error as any).statusCode = errorData.statusCode;
    return error;
  });

  const useRuntimeConfigMock = vi.fn(() => ({
    blobToken: "test-blob-token",
    upstashRedisUrl: "http://dummy-redis",
    upstashRedisToken: "dummy-token",
  }));
  (globalThis as any).useRuntimeConfig = useRuntimeConfigMock;
});

const {
  mockGetUserSession,
  mockReadMultipartFormData,
  mockVercelBlobPut,
  mockValidateFileType,
  mockGetFileHash,
  mockGetExistingBlobUrl,
  mockAddBook,
  mockSlugifyBookId,
} = vi.hoisted(() => ({
  mockGetUserSession: vi.fn(),
  mockReadMultipartFormData: vi.fn(),
  mockVercelBlobPut: vi.fn(),
  mockValidateFileType: vi.fn(),
  mockGetFileHash: vi.fn(),
  mockGetExistingBlobUrl: vi.fn(),
  mockAddBook: vi.fn(),
  mockGetBook: vi.fn(),
  mockSlugifyBookId: vi.fn(),
}));

(globalThis as any).getUserSession = mockGetUserSession;
(globalThis as any).readMultipartFormData = mockReadMultipartFormData;

vi.mock("@vercel/blob", () => ({
  put: mockVercelBlobPut,
}));

vi.mock("../utils/fileValidator", () => ({
  validateFileType: (...args: any[]) => mockValidateFileType(...args),
}));

vi.mock("../utils/hashStore", () => ({
  getFileHash: (...args: any[]) => mockGetFileHash(...args),
  getExistingBlobUrl: (...args: any[]) => mockGetExistingBlobUrl(...args),
  markFileAsUploaded: vi.fn(),
}));

vi.mock("../utils/bookStore", () => ({
  addBook: (...args: any[]) => mockAddBook(...args),
  getBook: vi.fn(),
  slugifyBookId: (...args: any[]) => mockSlugifyBookId(...args),
}));

vi.mock("../utils/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock Redis to prevent configuration errors
vi.mock("@upstash/redis", () => {
  return {
    Redis: class {
      pipeline() {
        return {
          hset: vi.fn().mockReturnThis(),
          sadd: vi.fn().mockReturnThis(),
          exec: vi.fn().mockResolvedValue([]),
        };
      }
      hget = vi.fn();
      hset = vi.fn();
    },
  };
});

import uploadHandler from "../api/books/upload.post";

describe("Безопасность загрузки: POST /api/books/upload", () => {
  const dummyEvent = {} as unknown as H3Event;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserSession.mockResolvedValue({ user: { id: "test-user" } });
  });

  it("должен очищать имя файла от символов перехода по путям (Path Traversal)", async () => {
    const maliciousFilename = "../../../etc/passwd.pdf";
    const expectedFilename = "passwd.pdf";

    mockReadMultipartFormData.mockResolvedValueOnce([
      {
        name: "file",
        filename: maliciousFilename,
        data: Buffer.from("%PDF-1.4 test content"),
        type: "application/pdf",
      },
    ]);

    mockValidateFileType.mockReturnValue({ valid: true, detectedType: "pdf", message: "OK" });
    mockGetFileHash.mockReturnValue("fake-hash");
    mockGetExistingBlobUrl.mockResolvedValue(null);
    mockSlugifyBookId.mockReturnValue("sanitized-id");

    mockVercelBlobPut.mockResolvedValue({
      url: "https://blob.test/books/passwd.pdf",
      pathname: "books/passwd.pdf",
      contentType: "application/pdf",
    });

    const result = await uploadHandler(dummyEvent);

    // Проверяем, что в Vercel Blob загружается очищенное имя
    expect(mockVercelBlobPut).toHaveBeenCalledWith(
      `books/${expectedFilename}`,
      expect.any(Buffer),
      expect.any(Object),
    );

    // Проверяем, что в базу данных сохраняется очищенное имя
    expect(mockAddBook).toHaveBeenCalledWith(expect.objectContaining({
      filename: expectedFilename,
    }));

    expect(result.status).toBe("success");
    expect(result.message).toContain(expectedFilename);
    expect(result.message).not.toContain("../");
  });

  it("должен корректно извлекать расширение из очищенного имени файла", async () => {
    const filenameWithDots = "my.book.with.dots.pdf";

    mockReadMultipartFormData.mockResolvedValueOnce([
      {
        name: "file",
        filename: filenameWithDots,
        data: Buffer.from("%PDF-1.4 content"),
      },
    ]);

    mockValidateFileType.mockReturnValue({ valid: true, detectedType: "pdf", message: "OK" });
    mockGetFileHash.mockReturnValue("hash");
    mockGetExistingBlobUrl.mockResolvedValue(null);
    mockVercelBlobPut.mockResolvedValue({ url: "url" });

    await uploadHandler(dummyEvent);

    expect(mockValidateFileType).toHaveBeenCalledWith(expect.any(Buffer), "pdf");
  });

  it("должен корректно обрабатывать dotfiles и файлы с несколькими точками", async () => {
    const edgeCaseFilename = ".config.pdf";

    mockReadMultipartFormData.mockResolvedValueOnce([
      {
        name: "file",
        filename: edgeCaseFilename,
        data: Buffer.from("%PDF-1.4 content"),
      },
    ]);

    mockValidateFileType.mockReturnValue({ valid: true, detectedType: "pdf", message: "OK" });
    mockGetFileHash.mockReturnValue("hash");
    mockGetExistingBlobUrl.mockResolvedValue(null);
    mockVercelBlobPut.mockResolvedValue({ url: "url" });

    await uploadHandler(dummyEvent);

    // Проверяем расширение
    expect(mockValidateFileType).toHaveBeenCalledWith(expect.any(Buffer), "pdf");

    // Проверяем извлеченный заголовок (без расширения)
    expect(mockAddBook).toHaveBeenCalledWith(expect.objectContaining({
      title: ".config",
    }));
  });
});
