import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { normalizePageText } from "./textNormalizer";

/**
 * Фрагмент текста с номером страницы/главы и необязательными метаданными.
 */
export interface PageText {
  /** Номер страницы или главы */
  pageNumber: number;
  /** Извлеченный текстовый контент */
  text: string;
  /** Заголовок главы (для EPUB) */
  title?: string;
}

/**
 * Извлекает текст из буфера файла, возвращая массив страниц или глав.
 * Поддерживаемые форматы: .txt, .pdf, .epub
 * 
 * @param {Buffer} fileBuffer Содержимое файла.
 * @param {string} fileName Имя файла (используется для определения расширения).
 * @returns {Promise<PageText[]>} Массив извлеченных страниц.
 * @throws {Error} Если формат файла не поддерживается.
 */
export async function extractText(
  fileBuffer: Buffer,
  fileName: string,
): Promise<PageText[]> {
  const fileExtension = fileName.split(".").pop()?.toLowerCase();

  switch (fileExtension) {
    case "txt":
      return extractTextFromTxt(fileBuffer);

    case "pdf":
      return extractTextFromPdf(fileBuffer);

    case "epub":
      return extractTextFromEpub(fileBuffer);

    default:
      throw new Error(`Unsupported file format: .${fileExtension} (Неподдерживаемый формат файла)`);
  }
}

/**
 * Извлечение из TXT: весь текст считается одной страницей.
 */
function extractTextFromTxt(buffer: Buffer): PageText[] {
  const textContent = buffer.toString("utf-8");
  if (!textContent.trim()) {
    return [];
  }
  return [{ pageNumber: 1, text: textContent }];
}

/**
 * Извлечение из PDF: построничное извлечение с нормализацией строк.
 * Использует pdfjs-dist для работы с PDF в Node.js.
 */
async function extractTextFromPdf(buffer: Buffer): Promise<PageText[]> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // В среде Node.js необходимо предоставить пути к стандартным шрифтам и cmaps
  const { createRequire } = await import("node:module");
  const { pathToFileURL } = await import("node:url");
  const require = createRequire(import.meta.url);
  const pdfjsPackagePath = path.dirname(require.resolve("pdfjs-dist/package.json"));

  // PDF.js ожидает URL, заканчивающиеся слешем
  const fontDataUrl = pathToFileURL(
    path.join(pdfjsPackagePath, "standard_fonts", path.sep),
  ).toString();
  const cMapDataUrl = pathToFileURL(
    path.join(pdfjsPackagePath, "cmaps", path.sep),
  ).toString();

  const uint8ArrayData = new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({
    data: uint8ArrayData,
    standardFontDataUrl: fontDataUrl,
    cMapUrl: cMapDataUrl,
    cMapPacked: true,
  });

  const pdfDocument = await loadingTask.promise;
  const extractedPages: PageText[] = [];

  for (let pageIdx = 1; pageIdx <= pdfDocument.numPages; pageIdx++) {
    const page = await pdfDocument.getPage(pageIdx);
    const textContent = await page.getTextContent();
    
    // Собираем текст из элементов страницы
    const rawPageText = textContent.items
      .filter((item: Record<string, unknown>) => "str" in item)
      .map((item: Record<string, unknown>) => item.str as string)
      .join(" ");

    if (rawPageText.trim()) {
      // Нормализуем текст: исправляем разрывы строк, характерные для PDF
      const normalizedText = normalizePageText(rawPageText.trim());
      extractedPages.push({ pageNumber: pageIdx, text: normalizedText });
    }
  }

  return extractedPages;
}

/**
 * Извлечение из EPUB: поглавное извлечение с конвертацией HTML в текст.
 * Использует временный файл, так как библиотека epub2 работает с путями к файлам.
 */
async function extractTextFromEpub(buffer: Buffer): Promise<PageText[]> {
  const systemTmpDir = os.tmpdir();
  const temporaryFilePath = path.join(systemTmpDir, `epub-parser-${Date.now()}.epub`);

  try {
    fs.writeFileSync(temporaryFilePath, buffer);

    const { EPub } = await import("epub2");
    const { convert } = await import("html-to-text");

    const epubInstance = await EPub.createAsync(temporaryFilePath);
    const extractedChapters: PageText[] = [];
    const contentFlow = epubInstance.flow || [];

    for (let chapterIdx = 0; chapterIdx < contentFlow.length; chapterIdx++) {
      const chapterMetadata = contentFlow[chapterIdx]!;
      try {
        const chapterHtml = await epubInstance.getChapterAsync(chapterMetadata.id);
        
        // Очищаем HTML и конвертируем в чистый текст
        const cleanText = convert(chapterHtml, {
          wordwrap: false,
          selectors: [
            { selector: "img", format: "skip" },
            { selector: "a", options: { ignoreHref: true } },
          ],
        });

        if (cleanText.trim()) {
          extractedChapters.push({
            pageNumber: chapterIdx + 1,
            text: cleanText.trim(),
            title: chapterMetadata.title,
          });
        }
      } catch {
        // Пропускаем главы, которые не удалось прочитать (например, из-за поврежденного XML)
        continue;
      }
    }

    return extractedChapters;
  } finally {
    // Обязательно удаляем временный файл
    try {
      if (fs.existsSync(temporaryFilePath)) {
        fs.unlinkSync(temporaryFilePath);
      }
    } catch {
      // Ошибки очистки временных файлов можно игнорировать
    }
  }
}
