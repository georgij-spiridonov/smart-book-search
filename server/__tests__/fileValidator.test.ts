import { describe, it, expect } from "vitest";
import { validateFileType, detectFileType } from "../utils/fileValidator";

describe("Валидатор файлов (fileValidator)", () => {
  it("должен принимать корректный заголовок PDF", () => {
    const pdfBuffer = Buffer.from("%PDF-1.4 тестовое содержимое", "ascii");
    const validationResult = validateFileType(pdfBuffer, "pdf");

    expect(validationResult.valid).toBe(true);
    expect(validationResult.detectedType).toBe("pdf");
  });

  it("должен отклонять содержимое PDF с расширением .txt", () => {
    const pdfBuffer = Buffer.from("%PDF-1.4 тестовое содержимое", "ascii");
    const validationResult = validateFileType(pdfBuffer, "txt");

    expect(validationResult.valid).toBe(false);
    expect(validationResult.detectedType).toBe("pdf");
  });

  it("должен принимать корректный TXT (ASCII)", () => {
    const txtBuffer = Buffer.from(
      "Привет, это обычный текстовый файл.",
      "utf-8",
    );
    const validationResult = validateFileType(txtBuffer, "txt");

    expect(validationResult.valid).toBe(true);
    expect(validationResult.detectedType).toBe("txt");
  });

  it("должен принимать корректный TXT (UTF-8 unicode)", () => {
    const txtBuffer = Buffer.from("Привет мир! 你好世界!", "utf-8");
    const validationResult = validateFileType(txtBuffer, "txt");

    expect(validationResult.valid).toBe(true);
    expect(validationResult.detectedType).toBe("txt");
  });

  it("должен отклонять ZIP-файл, заявленный как EPUB, но без соответствующего mimetype", () => {
    // Минимальный ZIP-заголовок без epub mimetype
    const zipHeader = Buffer.from([
      0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00,
    ]);
    const validationResult = validateFileType(zipHeader, "epub");

    expect(validationResult.valid).toBe(false);
  });

  it("должен корректно распознавать настоящий EPUB файл", () => {
    // Настоящий EPUB - это ZIP, где по смещению 30+ находится строка mimetype
    const buffer = Buffer.alloc(100);
    buffer.write("PK\x03\x04", 0); // ZIP magic
    buffer.write("application/epub+zip", 30);
    
    const detected = detectFileType(buffer);
    expect(detected).toBe("epub");
  });

  it("должен определять ZIP без метаданных EPUB как unknown", () => {
    const buffer = Buffer.alloc(100);
    buffer.write("PK\x03\x04", 0); // ZIP magic
    buffer.write("something/else", 30);
    
    const detected = detectFileType(buffer);
    expect(detected).toBe("unknown");
  });

  it("должен определять бинарный мусор как unknown", () => {
    const binaryBuffer = Buffer.from([
      0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
    ]);
    const detectedType = detectFileType(binaryBuffer);

    expect(detectedType).toBe("unknown");
  });

  it("должен определять пустой буфер как unknown", () => {
    const emptyBuffer = Buffer.alloc(0);
    const detectedType = detectFileType(emptyBuffer);

    expect(detectedType).toBe("unknown");
  });
});
