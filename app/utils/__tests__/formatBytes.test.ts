import { describe, it, expect } from "vitest";
import { formatBytes } from "../formatBytes";

describe("Функция formatBytes (Форматирование байтов)", () => {
  it("должна корректно форматировать 0 байт", () => {
    expect(formatBytes(0)).toBe("0 Б");
  });

  it("должна корректно форматировать небольшое количество байт", () => {
    expect(formatBytes(100)).toBe("100 Б");
  });

  it("должна корректно форматировать Килобайты (КБ)", () => {
    expect(formatBytes(1024)).toBe("1 КБ");
    expect(formatBytes(1024 * 1.5)).toBe("1.5 КБ");
  });

  it("должна корректно форматировать Мегабайты (МБ)", () => {
    expect(formatBytes(1024 * 1024)).toBe("1 МБ");
  });

  it("должна корректно обрабатывать пользовательское количество знаков после запятой", () => {
    expect(formatBytes(1234, 1)).toBe("1.2 КБ");
    expect(formatBytes(1234, 3)).toBe("1.205 КБ");
  });

  it("должна корректно обрабатывать отрицательные значения", () => {
    expect(formatBytes(-1024)).toBe("-1 КБ");
  });

  it("должна корректно работать с крупными единицами измерения (ТБ+)", () => {
    expect(formatBytes(1024 ** 4)).toBe("1 ТБ");
    // Проверка самого крупного поддерживаемого индекса (ИБ)
    expect(formatBytes(1024 ** 8)).toBe("1 ИБ");
  });

  it("должна возвращать '0 Б' для некорректных чисел (Infinity, NaN)", () => {
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("0 Б");
    expect(formatBytes(Number.NaN)).toBe("0 Б");
  });

  it("не должна добавлять лишние нули при избыточной точности", () => {
    expect(formatBytes(1024, 5)).toBe("1 КБ");
    expect(formatBytes(1024 * 1.1, 5)).toBe("1.1 КБ");
  });
});
