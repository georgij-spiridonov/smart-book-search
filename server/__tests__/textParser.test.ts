import { describe, it, expect, vi, beforeEach } from "vitest";

// =======================
// Имитации библиотек (Mocks for Libraries)
// =======================

// Имитация pdfjs-dist
const mockPdfGetTextContent = vi.fn();
const mockPdfGetPage = vi.fn(() => ({ getTextContent: mockPdfGetTextContent }));
const mockPdfGetDocument = vi.fn();

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  getDocument: (options: any) => ({ promise: mockPdfGetDocument(options) }),
}));

// Имитация epub2
const mockEpubGetChapterAsync = vi.fn();
const mockEpubCreateAsync = vi.fn();

vi.mock("epub2", () => ({
  EPub: {
    createAsync: (filePath: string) => mockEpubCreateAsync(filePath),
  },
}));

// Имитация html-to-text
const mockHtmlConvert = vi.fn();
vi.mock("html-to-text", () => ({
  convert: (htmlContent: string, options: any) => mockHtmlConvert(htmlContent, options),
}));

// Имитация fs для работы с временными файлами EPUB
const mockFsWriteFileSync = vi.fn((_path: string, _data: any) => {});
const mockFsUnlinkSync = vi.fn((_path: string) => {});
const mockFsExistsSync = vi.fn((_path: string) => true);

vi.mock("fs", () => ({
  default: {
    writeFileSync: (path: string, data: any) => mockFsWriteFileSync(path, data),
    unlinkSync: (path: string) => mockFsUnlinkSync(path),
    existsSync: (path: string) => mockFsExistsSync(path),
  },
  writeFileSync: (path: string, data: any) => mockFsWriteFileSync(path, data),
  unlinkSync: (path: string) => mockFsUnlinkSync(path),
  existsSync: (path: string) => mockFsExistsSync(path),
}));

import { extractText } from "../utils/textParser";
import type { PageText } from "../utils/textParser";

describe("Извлечение текста (textParser)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ──────── TXT ────────
  describe("Извлечение из TXT", () => {
    it("должен извлекать содержимое TXT как одну запись PageText", async () => {
      const textContent = "Привет, мир! Это тестовое содержимое книги.";
      const textBuffer = Buffer.from(textContent, "utf-8");
      const extractedPages: PageText[] = await extractText(textBuffer, "test.txt");

      expect(extractedPages).toHaveLength(1);
      expect(extractedPages[0]!.pageNumber).toBe(1);
      expect(extractedPages[0]!.text).toBe(textContent);
    });

    it("должен корректно обрабатывать TXT с символами Unicode", async () => {
      const unicodeContent = "Привет мир! 你好世界! مرحبا بالعالم";
      const textBuffer = Buffer.from(unicodeContent, "utf-8");
      const extractedPages = await extractText(textBuffer, "unicode.txt");

      expect(extractedPages).toHaveLength(1);
      expect(extractedPages[0]!.text).toBe(unicodeContent);
    });

    it("должен возвращать пустой массив для пустого TXT файла", async () => {
      const emptyBuffer = Buffer.from("", "utf-8");
      const extractedPages = await extractText(emptyBuffer, "empty.txt");
      expect(extractedPages).toHaveLength(0);
    });

    it("должен возвращать пустой массив для TXT, содержащего только пробелы", async () => {
      const whitespaceBuffer = Buffer.from("   \n\t  \n  ", "utf-8");
      const extractedPages = await extractText(whitespaceBuffer, "blank.txt");
      expect(extractedPages).toHaveLength(0);
    });
  });

  // ──────── Обработка ошибок (Error handling) ────────
  describe("Обработка ошибок", () => {
    it("должен выбрасывать ошибку для неподдерживаемого формата файла", async () => {
      const dummyBuffer = Buffer.from("данные", "utf-8");
      await expect(extractText(dummyBuffer, "file.docx")).rejects.toThrow(
        "Unsupported file format",
      );
    });

    it("должен выбрасывать ошибку для файлов без расширения", async () => {
      const dummyBuffer = Buffer.from("данные", "utf-8");
      await expect(extractText(dummyBuffer, "noextension")).rejects.toThrow(
        "Unsupported file format",
      );
    });
  });

  // ──────── PDF ────────
  describe("Извлечение из PDF", () => {
    it("должен извлекать текст из нескольких страниц PDF", async () => {
      mockPdfGetDocument.mockResolvedValue({
        numPages: 2,
        getPage: mockPdfGetPage,
      });

      // Страница 1
      mockPdfGetTextContent
        .mockResolvedValueOnce({
          items: [{ str: "Привет " }, { str: "Мир" }],
        })
        // Страница 2
        .mockResolvedValueOnce({
          items: [{ str: "Содержимое второй страницы" }],
        });

      const pdfBuffer = Buffer.from("fake-pdf-data");
      const extractedPages = await extractText(pdfBuffer, "book.pdf");

      expect(extractedPages).toHaveLength(2);
      expect(extractedPages[0]!.pageNumber).toBe(1);
      expect(extractedPages[0]!.text).toContain("Привет");
      expect(extractedPages[1]!.pageNumber).toBe(2);
      expect(extractedPages[1]!.text).toContain("Содержимое второй страницы");
    });

    it("должен пропускать пустые страницы PDF", async () => {
      mockPdfGetDocument.mockResolvedValue({
        numPages: 3,
        getPage: mockPdfGetPage,
      });

      mockPdfGetTextContent
        .mockResolvedValueOnce({ items: [{ str: "Страница один" }] })
        .mockResolvedValueOnce({ items: [{ str: "   " }] }) // пустая страница
        .mockResolvedValueOnce({ items: [{ str: "Страница три" }] });

      const pdfBuffer = Buffer.from("fake-pdf");
      const extractedPages = await extractText(pdfBuffer, "test.pdf");

      expect(extractedPages).toHaveLength(2);
      expect(extractedPages[0]!.pageNumber).toBe(1);
      expect(extractedPages[1]!.pageNumber).toBe(3);
    });

    it("должен фильтровать нетекстовые элементы в содержимом PDF", async () => {
      mockPdfGetDocument.mockResolvedValue({
        numPages: 1,
        getPage: mockPdfGetPage,
      });

      mockPdfGetTextContent.mockResolvedValueOnce({
        items: [
          { str: "Текстовый элемент" },
          { width: 100, height: 50 }, // нетекстовый элемент (без поля 'str')
          { str: " продолжается" },
        ],
      });

      const pdfBuffer = Buffer.from("fake-pdf");
      const extractedPages = await extractText(pdfBuffer, "mixed.pdf");

      expect(extractedPages).toHaveLength(1);
      expect(extractedPages[0]!.text).toContain("Текстовый элемент");
      expect(extractedPages[0]!.text).toContain("продолжается");
    });

    it("должен возвращать пустой массив для PDF без текстового содержимого", async () => {
      mockPdfGetDocument.mockResolvedValue({
        numPages: 1,
        getPage: mockPdfGetPage,
      });

      mockPdfGetTextContent.mockResolvedValueOnce({ items: [] });

      const pdfBuffer = Buffer.from("empty-pdf");
      const extractedPages = await extractText(pdfBuffer, "empty.pdf");

      expect(extractedPages).toHaveLength(0);
    });
  });

  // ──────── EPUB ────────
  describe("Извлечение из EPUB", () => {
    it("должен извлекать текст из глав EPUB", async () => {
      mockEpubCreateAsync.mockResolvedValue({
        flow: [
          { id: "ch1", title: "Глава 1" },
          { id: "ch2", title: "Глава 2" },
        ],
        getChapterAsync: mockEpubGetChapterAsync,
      });

      mockEpubGetChapterAsync
        .mockResolvedValueOnce("<p>HTML первой главы</p>")
        .mockResolvedValueOnce("<p>HTML второй главы</p>");

      mockHtmlConvert
        .mockReturnValueOnce("Текст первой главы")
        .mockReturnValueOnce("Текст второй главы");

      const epubBuffer = Buffer.from("fake-epub-data");
      const extractedPages = await extractText(epubBuffer, "book.epub");

      expect(extractedPages).toHaveLength(2);
      expect(extractedPages[0]!.pageNumber).toBe(1);
      expect(extractedPages[0]!.text).toBe("Текст первой главы");
      expect(extractedPages[0]!.title).toBe("Глава 1");
      expect(extractedPages[1]!.pageNumber).toBe(2);
      expect(extractedPages[1]!.text).toBe("Текст второй главы");
      expect(extractedPages[1]!.title).toBe("Глава 2");
    });

    it("должен пропускать главы с пустым текстом", async () => {
      mockEpubCreateAsync.mockResolvedValue({
        flow: [
          { id: "ch1", title: "Глава 1" },
          { id: "ch2", title: "Пустая глава" },
        ],
        getChapterAsync: mockEpubGetChapterAsync,
      });

      mockEpubGetChapterAsync
        .mockResolvedValueOnce("<p>Реальный контент</p>")
        .mockResolvedValueOnce("<p></p>");

      mockHtmlConvert
        .mockReturnValueOnce("Реальный контент")
        .mockReturnValueOnce("   "); // пусто после обрезки пробелов

      const epubBuffer = Buffer.from("fake-epub");
      const extractedPages = await extractText(epubBuffer, "test.epub");

      expect(extractedPages).toHaveLength(1);
      expect(extractedPages[0]!.title).toBe("Глава 1");
    });

    it("должен игнорировать главы, при чтении которых возникла ошибка", async () => {
      mockEpubCreateAsync.mockResolvedValue({
        flow: [
          { id: "ch1", title: "Хорошая глава" },
          { id: "ch2", title: "Плохая глава" },
          { id: "ch3", title: "Еще одна хорошая" },
        ],
        getChapterAsync: mockEpubGetChapterAsync,
      });

      mockEpubGetChapterAsync
        .mockResolvedValueOnce("<p>Контент 1</p>")
        .mockRejectedValueOnce(new Error("Ошибка чтения главы"))
        .mockResolvedValueOnce("<p>Контент 3</p>");

      mockHtmlConvert
        .mockReturnValueOnce("Контент 1")
        .mockReturnValueOnce("Контент 3");

      const epubBuffer = Buffer.from("fake-epub");
      const extractedPages = await extractText(epubBuffer, "broken.epub");

      expect(extractedPages).toHaveLength(2);
      expect(extractedPages[0]!.pageNumber).toBe(1);
      expect(extractedPages[1]!.pageNumber).toBe(3);
    });

    it("должен удалять временный файл даже при ошибке парсинга", async () => {
      mockEpubCreateAsync.mockRejectedValue(new Error("Невалидный EPUB"));

      const epubBuffer = Buffer.from("bad-epub");
      await expect(extractText(epubBuffer, "bad.epub")).rejects.toThrow(
        "Невалидный EPUB",
      );

      // Временный файл должен быть записан и затем удален
      expect(mockFsWriteFileSync).toHaveBeenCalledOnce();
      expect(mockFsUnlinkSync).toHaveBeenCalledOnce();
    });

    it("должен игнорировать ошибки при удалении временного файла", async () => {
      mockEpubCreateAsync.mockResolvedValue({ flow: [] });
      mockFsUnlinkSync.mockImplementationOnce(() => {
        throw new Error("Disk read-only");
      });

      const epubBuffer = Buffer.from("fake-epub");
      const extractedPages = await extractText(epubBuffer, "test.epub");

      expect(extractedPages).toHaveLength(0);
      expect(mockFsUnlinkSync).toHaveBeenCalled();
    });

    it("должен корректно обрабатывать EPUB с пустым списком flow", async () => {
      mockEpubCreateAsync.mockResolvedValue({
        flow: [],
        getChapterAsync: mockEpubGetChapterAsync,
      });

      const epubBuffer = Buffer.from("empty-epub");
      const extractedPages = await extractText(epubBuffer, "empty.epub");

      expect(extractedPages).toHaveLength(0);
    });
  });
});
