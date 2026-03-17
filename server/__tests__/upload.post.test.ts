import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";
import uploadHandler from "../api/books/upload.post";

vi.hoisted(() => {
  (globalThis as any).defineEventHandler = vi.fn((handler: any) => handler);
  (globalThis as any).createError = vi.fn((errorData: { statusCode: number; message: string; data?: any }) => {
    const error = new Error(errorData.message || "Ошибка сервера");
    (error as any).statusCode = errorData.statusCode;
    (error as any).data = errorData.data;
    return error;
  });

  const useRuntimeConfigMock = vi.fn(() => ({
    blobToken: "test-blob-token",
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
  mockGetBook,
  mockSlugifyBookId,
  mockMarkFileAsUploaded,
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
  mockMarkFileAsUploaded: vi.fn(),
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
  markFileAsUploaded: (...args: any[]) => mockMarkFileAsUploaded(...args),
}));

vi.mock("../utils/bookStore", () => ({
  addBook: (...args: any[]) => mockAddBook(...args),
  getBook: (...args: any[]) => mockGetBook(...args),
  slugifyBookId: (...args: any[]) => mockSlugifyBookId(...args),
}));

vi.mock("../utils/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe("POST /api/books/upload", () => {
  const dummyEvent = {} as unknown as H3Event;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserSession.mockResolvedValue({ user: { id: "test-user" } });
    mockSlugifyBookId.mockImplementation((title) => title.toLowerCase().replace(/\s+/g, "-"));
  });

  it("должен возвращать 401, если пользователь не авторизован", async () => {
    mockGetUserSession.mockResolvedValueOnce({});
    await expect(uploadHandler(dummyEvent)).rejects.toThrow("Не авторизован");
  });

  it("должен возвращать 400, если данные формы отсутствуют", async () => {
    mockReadMultipartFormData.mockResolvedValueOnce(null);
    await expect(uploadHandler(dummyEvent)).rejects.toThrow("Файл не предоставлен");
  });

  it("должен возвращать 400, если поле 'file' отсутствует", async () => {
    mockReadMultipartFormData.mockResolvedValueOnce([{ name: "not-a-file", data: Buffer.from("test") }]);
    await expect(uploadHandler(dummyEvent)).rejects.toThrow("Отсутствует поле 'file'");
  });

  it("должен возвращать 400 при неподдерживаемом расширении", async () => {
    mockReadMultipartFormData.mockResolvedValueOnce([
      { name: "file", filename: "test.exe", data: Buffer.from("MZ..."), type: "application/x-msdownload" }
    ]);
    await expect(uploadHandler(dummyEvent)).rejects.toThrow("Неподдерживаемый тип файла");
  });

  it("должен возвращать 400, если валидация магических байтов не прошла", async () => {
    mockReadMultipartFormData.mockResolvedValueOnce([
      { name: "file", filename: "test.pdf", data: Buffer.from("not-a-pdf") }
    ]);
    mockValidateFileType.mockReturnValueOnce({ valid: false, message: "Неверный формат PDF" });

    await expect(uploadHandler(dummyEvent)).rejects.toThrow("Неверный формат PDF");
  });

  it("должен обрабатывать дубликаты файлов", async () => {
    const fileData = Buffer.from("%PDF-1.4 test");
    mockReadMultipartFormData.mockResolvedValueOnce([
      { name: "file", filename: "duplicate.pdf", data: fileData }
    ]);
    mockValidateFileType.mockReturnValueOnce({ valid: true });
    mockGetFileHash.mockReturnValueOnce("hash123");
    mockGetExistingBlobUrl.mockResolvedValueOnce("https://blob.url/existing.pdf");
    mockGetBook.mockResolvedValueOnce(null); // Еще не в базе книг

    const result = await uploadHandler(dummyEvent);

    expect(mockAddBook).toHaveBeenCalled();
    expect(result.status).toBe("success");
    expect(result.message).toContain("уже был загружен ранее");
    expect(result.blob.url).toBe("https://blob.url/existing.pdf");
  });

  it("должен обрабатывать дубликаты файлов, которые уже есть в книжном хранилище", async () => {
    mockReadMultipartFormData.mockResolvedValueOnce([
      { name: "file", filename: "duplicate.pdf", data: Buffer.from("%PDF...") }
    ]);
    mockValidateFileType.mockReturnValueOnce({ valid: true });
    mockGetFileHash.mockReturnValueOnce("hash123");
    mockGetExistingBlobUrl.mockResolvedValueOnce("https://blob.url/existing.pdf");
    mockGetBook.mockResolvedValueOnce({ id: "existing-book" }); // Уже есть в БД

    const result = await uploadHandler(dummyEvent);

    expect(mockAddBook).not.toHaveBeenCalled();
    expect(result.status).toBe("success");
  });

  it("должен успешно загружать новый файл с метаданными", async () => {
    const fileData = Buffer.from("%PDF-1.4 test");
    mockReadMultipartFormData.mockResolvedValueOnce([
      { name: "file", filename: "new.pdf", data: fileData },
      { name: "title", data: Buffer.from("Custom Title") },
      { name: "author", data: Buffer.from("Author Name") },
      { name: "coverUrl", data: Buffer.from("https://cover.url") }
    ]);
    mockValidateFileType.mockReturnValueOnce({ valid: true });
    mockGetFileHash.mockReturnValueOnce("newhash");
    mockGetExistingBlobUrl.mockResolvedValueOnce(null);
    mockVercelBlobPut.mockResolvedValueOnce({
      url: "https://blob.url/new.pdf",
      pathname: "books/new.pdf",
      contentType: "application/pdf"
    });

    const result = await uploadHandler(dummyEvent);

    expect(mockAddBook).toHaveBeenCalledWith(expect.objectContaining({
      title: "Custom Title",
      author: "Author Name",
      coverUrl: "https://cover.url",
      blobUrl: "https://blob.url/new.pdf"
    }));
    expect(mockMarkFileAsUploaded).toHaveBeenCalledWith("newhash", "https://blob.url/new.pdf");
    expect(result.status).toBe("success");
  });

  it("должен выбрасывать 500 при неизвестной ошибке", async () => {
    mockReadMultipartFormData.mockRejectedValueOnce(new Error("Database down"));
    await expect(uploadHandler(dummyEvent)).rejects.toThrow("Ошибка загрузки");
  });

  it("должен корректно обрабатывать не-Error объекты в catch при загрузке", async () => {
    mockReadMultipartFormData.mockRejectedValueOnce("Primitive error");
    await expect(uploadHandler(dummyEvent)).rejects.toThrow("Ошибка загрузки");
  });
});
