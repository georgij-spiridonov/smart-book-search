/**
 * Валидация типов файлов на основе "магических байтов" (Magic Bytes).
 * Проверяет реальный бинарный заголовок буфера файла, не полагаясь только на расширение.
 */

/** Поддерживаемые типы файлов для обработки */
export type DetectedFileType = "pdf" | "epub" | "txt" | "unknown";

/** Результат проверки файла */
interface ValidationResult {
  /** Флаг успешной проверки (содержимое соответствует расширению) */
  valid: boolean;
  /** Обнаруженный тип файла */
  detectedType: DetectedFileType;
  /** Сообщение с результатом (на русском языке для пользователя) */
  message: string;
}

/** Сигнатуры магических байтов */
const MAGIC_BYTES_PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
const MAGIC_BYTES_ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // PK\x03\x04

/**
 * Проверяет, соответствует ли содержимое буфера файла его заявленному расширению.
 * 
 * @param {Buffer} fileBuffer Бинарное содержимое файла.
 * @param {string} declaredExtension Заявленное расширение (например, "pdf" или ".epub").
 * @returns {ValidationResult} Объект с результатом валидации.
 */
export function validateFileType(
  fileBuffer: Buffer,
  declaredExtension: string,
): ValidationResult {
  const detectedType = detectFileType(fileBuffer);
  const normalizedExtension = declaredExtension.toLowerCase().replace(/^\./, "");

  if (detectedType === "unknown") {
    return {
      valid: false,
      detectedType,
      message: `Не удалось определить тип файла по его содержимому. Заявлено: .${normalizedExtension}`,
    };
  }

  if (detectedType !== normalizedExtension) {
    return {
      valid: false,
      detectedType,
      message: `Несоответствие содержимого расширению: заявлено .${normalizedExtension}, но обнаружено ${detectedType}`,
    };
  }

  return {
    valid: true,
    detectedType,
    message: `Тип файла успешно подтвержден: .${normalizedExtension}`,
  };
}

/**
 * Определяет тип файла по сигнатурам в начале буфера.
 * 
 * @param {Buffer} fileBuffer Бинарное содержимое файла.
 * @returns {DetectedFileType} Обнаруженный тип файла.
 */
export function detectFileType(fileBuffer: Buffer): DetectedFileType {
  // Минимальная длина заголовка для проверки
  if (fileBuffer.length < 4) {
    return "unknown";
  }

  // Проверка на PDF: начинается с %PDF-
  if (fileBuffer.subarray(0, 5).equals(MAGIC_BYTES_PDF)) {
    return "pdf";
  }

  // Проверка на ZIP (EPUB — это ZIP-архив с файлом mimetype): начинается с PK\x03\x04
  if (fileBuffer.subarray(0, 4).equals(MAGIC_BYTES_ZIP)) {
    /** 
     * Дополнительная проверка для EPUB:
     * EPUB-архивы содержат строку "application/epub+zip" обычно начиная с 30-го байта.
     * Файл mimetype обычно является первым и идет без сжатия.
     */
    const mimetypeIdentifier = fileBuffer.subarray(30, 58).toString("ascii");
    if (mimetypeIdentifier.includes("application/epub+zip")) {
      return "epub";
    }
    // Это ZIP, но не EPUB
    return "unknown";
  }

  // Проверка на TXT: эвристика — отсутствие бинарных байтов в первых 512 байтах
  if (isLikelyTextContent(fileBuffer)) {
    return "txt";
  }

  return "unknown";
}

/**
 * Проверяет, является ли содержимое текстовым, сканируя буфер на наличие бинарных символов.
 * Допускает стандартные пробелы и печатные символы ASCII/UTF-8.
 * 
 * @param {Buffer} buffer Буфер для проверки.
 * @returns {boolean} true, если содержимое похоже на текст.
 */
function isLikelyTextContent(buffer: Buffer): boolean {
  const bytesToCheck = Math.min(buffer.length, 512);
  let nonTextByteCount = 0;

  for (let i = 0; i < bytesToCheck; i++) {
    const currentByte = buffer[i]!;
    
    // Допустимые символы: Tab(9), LF(10), CR(13), печатные ASCII(32-126)
    // А также байты продолжения UTF-8 (128-255)
    const isTextByte =
      currentByte === 9 ||
      currentByte === 10 ||
      currentByte === 13 ||
      (currentByte >= 32 && currentByte <= 126) ||
      currentByte >= 128;

    if (!isTextByte) {
      nonTextByteCount++;
    }
  }

  // Допускаем небольшое количество "нетекстовых" байтов (например, BOM)
  return nonTextByteCount <= 2;
}
