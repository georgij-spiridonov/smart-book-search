import { describe, it, expect } from "vitest";
import { ChatRequestSchema } from "../utils/chatConfig";

/**
 * Тесты валидации чата (Chat validation tests).
 * Проверяют корректность работы схемы Zod для запросов к /api/chat.
 */
describe("Валидация запросов чата (chatValidation)", () => {
  it("должен принимать корректный запрос", () => {
    const validationResult = ChatRequestSchema.safeParse({
      query: "Тестовый вопрос",
      bookIds: ["book-id-1"],
    });
    expect(validationResult.success).toBe(true);
  });

  it("должен отклонять запрос без поля query", () => {
    const validationResult = ChatRequestSchema.safeParse({
      bookIds: ["book-id-1"],
    });
    expect(validationResult.success).toBe(false);
  });

  it("должен отклонять запрос с пустой строкой в query", () => {
    const validationResult = ChatRequestSchema.safeParse({
      query: "",
      bookIds: ["book-id-1"],
    });
    expect(validationResult.success).toBe(false);
  });

  it("должен отклонять запрос с пустым массивом bookIds", () => {
    const validationResult = ChatRequestSchema.safeParse({
      query: "Тест",
      bookIds: [],
    });
    expect(validationResult.success).toBe(false);
  });
});
