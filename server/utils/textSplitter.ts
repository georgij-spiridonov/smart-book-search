import type { PageText } from "./textParser";

/** Фрагмент текста после разделения (чанк) */
export interface TextChunk {
  /** Текстовое содержимое фрагмента */
  text: string;
  /** Глобальный индекс фрагмента в документе */
  chunkIndex: number;
  /** Номер страницы или главы, из которой взят текст */
  pageNumber: number;
  /** Заголовок раздела (если есть) */
  title?: string;
}

/** Параметры разделения текста */
interface SplitOptions {
  /** Целевой размер фрагмента в символах (по умолчанию 800) */
  chunkSize?: number;
  /** Размер перекрытия между соседними фрагментами в символах (по умолчанию 200) */
  chunkOverlap?: number;
}

/**
 * Разделяет массив страниц на мелкие перекрывающиеся фрагменты (чанки),
 * сохраняя номер страницы и метаданные для каждого фрагмента.
 * 
 * Каждая запись PageText обычно представляет главу (EPUB) или страницу (PDF).
 * Чтобы избежать "разрыва смысла", каждая страница/глава обрабатывается независимо —
 * фрагменты никогда не пересекают границы глав.
 * 
 * @param {PageText[]} pages Массив страниц/глав для разделения.
 * @param {SplitOptions} [options] Параметры разделения.
 * @returns {TextChunk[]} Массив готовых для индексации фрагментов.
 */
export function splitPages(
  pages: PageText[],
  options?: SplitOptions,
): TextChunk[] {
  const resultChunks: TextChunk[] = [];
  let globalChunkCounter = 0;

  for (const page of pages) {
    const pageChunks = splitText(page.text, options);
    
    for (const chunk of pageChunks) {
      resultChunks.push({
        text: chunk.text,
        chunkIndex: globalChunkCounter++,
        pageNumber: page.pageNumber,
        title: page.title,
      });
    }
  }

  return resultChunks;
}

/**
 * Разделяет одну строку текста на фрагменты, основываясь на границах предложений.
 * 
 * Ключевые особенности:
 * 1. Фрагмент всегда начинается с начала предложения.
 * 2. Если предложение длиннее chunkSize, оно берется целиком как один фрагмент.
 * 3. Сохраняются оригинальные разрывы строк, пробелы и пунктуация.
 * 4. Поддерживается "умное" перекрытие на основе предложений.
 * 
 * @param {string} text Исходный текст для разделения.
 * @param {SplitOptions} [options] Параметры разделения.
 * @returns {Omit<TextChunk, "pageNumber">[]} Массив фрагментов без привязки к странице.
 */
export function splitText(
  text: string,
  options?: SplitOptions,
): Omit<TextChunk, "pageNumber">[] {
  const targetChunkSize = options?.chunkSize ?? 800;
  const targetChunkOverlap = options?.chunkOverlap ?? 200;

  if (!text.trim()) {
    return [];
  }

  /** 
   * Используем Intl.Segmenter для надежного разделения на предложения.
   * Это работает корректно для разных языков, включая русский и английский.
   */
  const sentenceSegmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
  const segments = sentenceSegmenter.segment(text);
  const sentencesList = Array.from(segments).map((s) => s.segment);

  const finalChunks: string[] = [];
  let currentAccumulatedSentences: string[] = [];
  let currentAccumulatedLength = 0;

  for (let i = 0; i < sentencesList.length; i++) {
    const currentSentence = sentencesList[i]!;

    // Случай 1: Само предложение длиннее целевого размера фрагмента.
    // Берем его целиком, чтобы не разрывать смысл в случайном месте.
    if (currentSentence.length >= targetChunkSize) {
      // Сначала "сбрасываем" текущий накопленный фрагмент, если он есть
      if (currentAccumulatedSentences.length > 0) {
        finalChunks.push(currentAccumulatedSentences.join(""));
        currentAccumulatedSentences = [];
        currentAccumulatedLength = 0;
      }
      // Добавляем длинное предложение как отдельный чанк
      finalChunks.push(currentSentence);
      continue;
    }

    // Случай 2: Добавление этого предложения превысит лимит размера фрагмента.
    if (currentAccumulatedLength + currentSentence.length > targetChunkSize) {
      // Завершаем текущий фрагмент
      const finishedChunk = currentAccumulatedSentences.join("");
      finalChunks.push(finishedChunk);

      /**
       * Реализация перекрытия (Overlap):
       * Мы берем несколько предыдущих предложений, которые помещаются в лимит перекрытия,
       * чтобы сохранить контекст в следующем фрагменте.
       */
      const overlapSentences: string[] = [];
      let overlapLengthCounter = 0;
      
      for (let j = currentAccumulatedSentences.length - 1; j >= 0; j--) {
        const previousSentence = currentAccumulatedSentences[j]!;
        if (overlapLengthCounter + previousSentence.length <= targetChunkOverlap) {
          overlapSentences.unshift(previousSentence);
          overlapLengthCounter += previousSentence.length;
        } else {
          break;
        }
      }

      // Начинаем новый фрагмент с "хвоста" предыдущего и текущего предложения
      currentAccumulatedSentences = [...overlapSentences, currentSentence];
      currentAccumulatedLength = overlapLengthCounter + currentSentence.length;
    } else {
      // Случай 3: Предложение помещается в текущий фрагмент
      currentAccumulatedSentences.push(currentSentence);
      currentAccumulatedLength += currentSentence.length;
    }
  }

  // Добавляем последний оставшийся фрагмент
  if (currentAccumulatedSentences.length > 0) {
    const lastChunkText = currentAccumulatedSentences.join("");
    // Избегаем дублирования, если последний фрагмент полностью совпадает с перекрытием
    if (finalChunks.length === 0 || finalChunks[finalChunks.length - 1] !== lastChunkText) {
      finalChunks.push(lastChunkText);
    }
  }

  return finalChunks.map((chunkText, index) => ({ 
    text: chunkText, 
    chunkIndex: index 
  }));
}
