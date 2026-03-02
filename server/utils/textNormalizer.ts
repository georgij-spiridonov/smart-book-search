/**
 * Нормализатор текста PDF — восстанавливает разорванные строки после извлечения из PDF.
 * 
 * Библиотека pdfjs-dist извлекает текст построчно, как он расположен на странице.
 * Это приводит к разрывам строк в середине предложения, что ухудшает качество эмбеддингов.
 */

/** Набор символов, завершающих предложение */
const SENTENCE_TERMINATORS = new Set([
  ".", "!", "?", ":", ";", '"', "'", ")", "]", "»", "…", "”"
]);

/** Набор символов переноса или тире */
const DASH_SYMBOLS = new Set(["-", "–", "—"]);

/**
 * Объединяет строки, которые были разорваны при верстке PDF.
 * Если строка не заканчивается знаком препинания, она объединяется со следующей.
 * 
 * @param {string} rawText "Сырой" текст страницы с разрывами строк.
 * @returns {string} Нормализованный текст с восстановленной структурой предложений.
 */
export function normalizePageText(rawText: string): string {
  const sourceLines = rawText.split("\n");
  const normalizedLines: string[] = [];
  let currentBuffer = "";

  for (const rawLine of sourceLines) {
    const trimmedLine = rawLine.trim();
    
    if (!trimmedLine) {
      // Пустая строка означает разрыв абзаца
      if (currentBuffer) {
        normalizedLines.push(currentBuffer);
        currentBuffer = "";
      }
      normalizedLines.push(""); // Сохраняем пустую строку для обозначения границы абзаца
      continue;
    }

    if (currentBuffer) {
      // Проверяем, закончилось ли предыдущее предложение в буфере
      if (checkIfEndsMidSentence(currentBuffer)) {
        // Если это продолжение разорванной строки — объединяем через пробел
        currentBuffer += " " + trimmedLine;
      } else {
        // Если предыдущая строка была полным предложением — сбрасываем буфер и начинаем новую
        normalizedLines.push(currentBuffer);
        currentBuffer = trimmedLine;
      }
    } else {
      currentBuffer = trimmedLine;
    }
  }

  // Добавляем остаток из буфера
  if (currentBuffer) {
    normalizedLines.push(currentBuffer);
  }

  return normalizedLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n") // Убираем избыточные пустые строки (максимум две подряд)
    .trim();
}

/**
 * Проверяет, заканчивается ли текст на середине предложения (отсутствует терминатор).
 * 
 * @param {string} text Текст для проверки.
 * @returns {boolean} true, если предложение, скорее всего, не закончено.
 */
function checkIfEndsMidSentence(text: string): boolean {
  const trimmedText = text.trimEnd();
  if (!trimmedText) {
    return false;
  }

  const lastCharacter = trimmedText[trimmedText.length - 1]!;

  // Если заканчивается на терминатор — предложение закончено
  if (SENTENCE_TERMINATORS.has(lastCharacter)) {
    return false;
  }

  // Если заканчивается на дефис или тире — слово было перенесено
  if (DASH_SYMBOLS.has(lastCharacter)) {
    return true;
  }

  // Если заканчивается на букву, цифру или запятую — скорее всего, это середина предложения
  return true;
}
