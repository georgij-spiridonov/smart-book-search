/**
 * Tests for the OpenAPI document generation.
 *
 * Verifies that zod-openapi produces a valid OpenAPI 3.1 document
 * with all expected paths, schemas, and metadata.
 */

import { describe, it, expect } from "vitest";
import { openApiDocument } from "../utils/openapi/document";

describe("OpenAPI document", () => {
  it("should have correct OpenAPI version and info", () => {
    expect(openApiDocument.openapi).toBe("3.1.0");
    expect(openApiDocument.info.title).toContain("Smart Book Search");
    expect(openApiDocument.info.version).toBe("1.0.0");
  });

  it("should contain all expected API paths", () => {
    const paths = Object.keys(openApiDocument.paths ?? {});

    expect(paths).toContain("/api/books");
    expect(paths).toContain("/api/books/upload");
    expect(paths).toContain("/api/books/vectorize");
    expect(paths).toContain("/api/books/jobs/{id}");
    expect(paths).toContain("/api/chat");
  });

  it("should NOT expose internal Inngest route", () => {
    const paths = Object.keys(openApiDocument.paths ?? {});
    expect(paths).not.toContain("/api/inngest");
  });

  it("should have correct HTTP methods for each path", () => {
    const paths = openApiDocument.paths as Record<
      string,
      Record<string, unknown>
    >;

    expect(paths["/api/books"]).toHaveProperty("get");
    expect(paths["/api/books/upload"]).toHaveProperty("post");
    expect(paths["/api/books/vectorize"]).toHaveProperty("post");
    expect(paths["/api/books/jobs/{id}"]).toHaveProperty("get");
    expect(paths["/api/chat"]).toHaveProperty("post");
  });

  it("should have tags for all operations", () => {
    const tags = openApiDocument.tags?.map((t) => t.name);
    expect(tags).toContain("Books");
    expect(tags).toContain("Jobs");
    expect(tags).toContain("Chat");
  });

  it("should register reusable component schemas", () => {
    const schemaNames = Object.keys(
      (openApiDocument.components as Record<string, Record<string, unknown>>)
        ?.schemas ?? {},
    );

    // At minimum, schemas with id in .meta() should be registered
    expect(schemaNames.length).toBeGreaterThan(0);
  });

  it("should have operationId for each operation", () => {
    const paths = openApiDocument.paths as Record<
      string,
      Record<string, Record<string, unknown>>
    >;

    for (const [, methods] of Object.entries(paths)) {
      for (const [, operation] of Object.entries(methods)) {
        if (typeof operation === "object" && operation !== null) {
          expect(operation).toHaveProperty("operationId");
        }
      }
    }
  });
});
