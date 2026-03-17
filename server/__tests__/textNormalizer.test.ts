import { describe, it, expect } from "vitest";
import { normalizePageText, checkIfEndsMidSentence } from "../utils/textNormalizer";

describe("Нормализация текста (textNormalizer)", () => {
  it("должен правильно определять конец предложения", () => {
    expect(checkIfEndsMidSentence("")).toBe(false);
    expect(checkIfEndsMidSentence("  ")).toBe(false);
    expect(checkIfEndsMidSentence("Конец.")).toBe(false);
    expect(checkIfEndsMidSentence("Не конец")).toBe(true);
    expect(checkIfEndsMidSentence("Пере-")).toBe(true);
  });

  it("должен объединять разорванные строки в середине предложения", () => {
    const inputText = "Это предложение, которое\nпродолжается на следующей строке.";
    const resultText = normalizePageText(inputText);
    expect(resultText).toBe("Это предложение, которое продолжается на следующей строке.");
  });

  it("должен сохранять разрывы абзацев (двойные переносы строк)", () => {
    const inputText = "Первый абзац.\n\nВторой абзац.";
    const resultText = normalizePageText(inputText);
    expect(resultText).toContain("Первый абзац.");
    expect(resultText).toContain("Второй абзац.");
    expect(resultText).toContain("\n");
  });

  it("должен оставлять полные предложения на разных строках", () => {
    const inputText = "Первое предложение.\nВторое предложение.";
    const resultText = normalizePageText(inputText);
    // После точки или другого знака конца предложения строки НЕ должны объединяться
    expect(resultText).not.toBe("Первое предложение. Второе предложение.");
  });

  it("должен корректно обрабатывать переносы слов со знаком дефиса", () => {
    const inputText = "Это слово с пере-\nносом.";
    const resultText = normalizePageText(inputText);
    expect(resultText).toContain("пере-");
    expect(resultText).toContain("носом");
  });

  it("должен удалять избыточные пустые строки", () => {
    const inputText = "Текст.\n\n\n\n\nЕще текст.";
    const resultText = normalizePageText(inputText);
    expect(resultText).not.toContain("\n\n\n");
  });

  it("должен корректно обрабатывать пустой ввод", () => {
    expect(normalizePageText("")).toBe("");
    expect(normalizePageText("   ")).toBe("");
    expect(normalizePageText("\n\n")).toBe("");
  });

  it("должен сохранять пустые строки между абзацами, если буфер пуст", () => {
    const inputText = "\n\n\nПервый абзац.\n\n\nВторой абзац.\n\n\n";
    const resultText = normalizePageText(inputText);
    expect(resultText).toBe("Первый абзац.\n\nВторой абзац.");
  });

  it("должен проверять все терминаторы предложений", () => {
    const terminators = [".", "!", "?", ":", ";", "\"", "'", ")", "]", "»", "…", "”"];
    for (const char of terminators) {
      const input = `Конец${char}\nНачало.`;
      const output = normalizePageText(input);
      expect(output).toBe(`Конец${char}\nНачало.`);
    }
  });

  it("должен объединять строки, если в конце запятая или буква", () => {
    const nonTerminators = [",", "а", "Б", "1", "0"];
    for (const char of nonTerminators) {
      const input = `Текст${char}\nПродолжение.`;
      const output = normalizePageText(input);
      expect(output).toBe(`Текст${char} Продолжение.`);
    }
  });

  it("должен объединять строки, если предложение заканчивается на дефис или тире (перенос)", () => {
    const dashes = ["-", "–", "—"];
    for (const char of dashes) {
      const input = `Слово с пере${char}\nносом.`;
      const output = normalizePageText(input);
      expect(output).toBe(`Слово с пере${char} носом.`);
    }
  });
});
