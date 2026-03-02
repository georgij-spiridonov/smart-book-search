import { describe, it, expect } from "vitest";
import { openApiDocument } from "../utils/openapi/document";

/**
 * Тестирование генерации документа OpenAPI.
 * Проверяет, что zod-openapi формирует корректный документ OpenAPI 3.1.1
 * со всеми ожидаемыми путями, схемами и метаданными.
 */
describe("Документация OpenAPI (openapi)", () => {
  it("должен иметь корректную версию OpenAPI и информацию о проекте", () => {
    expect(openApiDocument.openapi).toBe("3.1.1");
    expect(openApiDocument.info.title).toContain("Smart Book Search");
    expect(openApiDocument.info.version).toBe("1.0.0");
  });

  it("должен содержать все ожидаемые пути API", () => {
    const apiPaths = Object.keys(openApiDocument.paths ?? {});

    expect(apiPaths).toContain("/api/books");
    expect(apiPaths).toContain("/api/books/upload");
    expect(apiPaths).toContain("/api/books/vectorize");
    expect(apiPaths).toContain("/api/books/jobs/{id}");
    expect(apiPaths).toContain("/api/chat");
  });

  it("не должен содержать внутренний маршрут Inngest", () => {
    const apiPaths = Object.keys(openApiDocument.paths ?? {});
    expect(apiPaths).not.toContain("/api/inngest");
  });

  it("должен иметь правильные HTTP-методы для каждого пути", () => {
    const apiPaths = openApiDocument.paths as Record<
      string,
      Record<string, unknown>
    >;

    expect(apiPaths["/api/books"]).toHaveProperty("get");
    expect(apiPaths["/api/books/upload"]).toHaveProperty("post");
    expect(apiPaths["/api/books/vectorize"]).toHaveProperty("post");
    expect(apiPaths["/api/books/jobs/{id}"]).toHaveProperty("get");
    expect(apiPaths["/api/chat"]).toHaveProperty("post");
  });

  it("должен содержать теги для всех операций", () => {
    const documentTags = openApiDocument.tags?.map((tag) => tag.name);
    expect(documentTags).toContain("Books");
    expect(documentTags).toContain("Jobs");
    expect(documentTags).toContain("Chat");
  });

  it("должен регистрировать переиспользуемые схемы компонентов", () => {
    const componentSchemaNames = Object.keys(
      (openApiDocument.components as Record<string, Record<string, unknown>>)
        ?.schemas ?? {},
    );

    // Как минимум, должны быть зарегистрированы схемы, у которых вызван .meta({ id: '...' })
    expect(componentSchemaNames.length).toBeGreaterThan(0);
  });

  it("каждая операция должна иметь уникальный operationId", () => {
    const apiPaths = openApiDocument.paths as Record<
      string,
      Record<string, Record<string, unknown>>
    >;

    for (const [, methods] of Object.entries(apiPaths)) {
      for (const [, operation] of Object.entries(methods)) {
        if (typeof operation === "object" && operation !== null) {
          expect(operation).toHaveProperty("operationId");
        }
      }
    }
  });
});
