import { describe, it, expect } from "vitest";
import { splitText, splitPages } from "../utils/textSplitter";
import type { PageText } from "../utils/textParser";

describe("Разделение текста на фрагменты (textSplitter)", () => {
  it("должен создавать один фрагмент для короткого текста", () => {
    const shortText = "Привет, это короткое предложение.";
    const chunks = splitText(shortText);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toBe(shortText);
  });

  it("должен создавать несколько фрагментов для длинного текста", () => {
    const longParagraph = "Предложение номер один. ".repeat(100);
    const chunks = splitText(longParagraph, { chunkSize: 100 });
    
    expect(chunks.length).toBeGreaterThan(1);
    // Каждый фрагмент должен начинаться со слова "Предложение"
    chunks.forEach((chunk) => {
      expect(chunk.text.startsWith("Предложение")).toBe(true);
    });
  });

  it("должен сохранять длинное предложение целиком, даже если оно превышает chunkSize", () => {
    const veryLongSentence = "Это очень длинное предложение без каких-либо знаков завершения, которое значительно превышает лимит размера фрагмента и не должно быть разбито на более мелкие части, несмотря на то, что оно действительно очень длинное";
    const fullText = "Короткое предложение. " + veryLongSentence + ". Еще одно короткое.";
    const limitSize = 50;
    const chunks = splitText(fullText, { chunkSize: limitSize });

    // Длинное предложение (вместе со своим завершителем) должно стать отдельным фрагментом и не разбиваться
    const longChunk = chunks.find(chunk => chunk.text.includes(veryLongSentence));
    expect(longChunk).toBeDefined();
    expect(longChunk!.text).toContain(veryLongSentence);
    expect(longChunk!.text.length).toBeGreaterThan(limitSize);
  });

  it("должен сохранять разрывы строк и пунктуацию", () => {
    const textWithFormatting = "Первое предложение.\nВторое предложение с\nпереносом строки.\nТретье предложение!";
    
    // Объединяем все фрагменты (игнорируя перекрытия для этого теста, установив overlap в 0)
    const chunksWithoutOverlap = splitText(textWithFormatting, { chunkSize: 20, chunkOverlap: 0 });
    const joinedText = chunksWithoutOverlap.map(chunk => chunk.text).join("");
    
    expect(joinedText).toBe(textWithFormatting);
  });

  it("должен корректно обрабатывать перекрытие (overlap) между фрагментами", () => {
    const sequenceText = "S1. S2. S3. S4. S5."; // Каждое "SX. " — 4 символа
    const chunks = splitText(sequenceText, { chunkSize: 10, chunkOverlap: 5 });
    
    // Фрагмент 1: "S1. S2. " (8 символов)
    // Фрагмент 2: перекрытие "S2. " + "S3. " -> "S2. S3. " (8 символов)
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[1]!.text.startsWith("S2.")).toBe(true);
  });

  it("должен передавать заголовок и номер страницы через splitPages и соблюдать границы глав", () => {
    const mockPages: PageText[] = [
      { pageNumber: 1, text: "Предложение главы 1. Еще одно предложение.", title: "Глава 1" },
      { pageNumber: 2, text: "Глава 2 начинается здесь.", title: "Глава 2" },
    ];
    // Используем очень маленький chunkSize, чтобы заставить разбивать текст, если бы он был единым
    const chunks = splitPages(mockPages, { chunkSize: 10 });

    expect(chunks[0]!.pageNumber).toBe(1);
    expect(chunks[0]!.title).toBe("Глава 1");
    
    // Последний фрагмент Главы 1 не должен содержать текста из Главы 2
    const chapter1Chunks = chunks.filter(chunk => chunk.pageNumber === 1);
    const chapter2Chunks = chunks.filter(chunk => chunk.pageNumber === 2);
    
    chapter1Chunks.forEach(chunk => {
        expect(chunk.text).not.toContain("Глава 2");
    });
    chapter2Chunks.forEach(chunk => {
        expect(chunk.text).not.toContain("Глава 1");
    });
  });

  it("должен возвращать пустой массив для пустой строки", () => {
    const chunks = splitText("");
    expect(chunks).toHaveLength(0);
  });

  it("должен корректно обрабатывать русский текст", () => {
    const russianText = "Первое предложение. Второе предложение с запятой, и еще чем-то. Третье!";
    const chunks = splitText(russianText, { chunkSize: 30 });
    
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.text).toContain("Первое предложение.");
  });
});
