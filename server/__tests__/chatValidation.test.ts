import { describe, it, expect } from "vitest";
import { ChatRequestSchema } from "../utils/chatConfig";

/**
 * Chat validation tests — verifies Zod schema validation for /api/chat
 * without needing to call the real API endpoint.
 */
describe("chatValidation", () => {
  it("accepts a valid request", () => {
    const result = ChatRequestSchema.safeParse({
      query: "Test query",
      bookIds: ["book-1"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing query", () => {
    const result = ChatRequestSchema.safeParse({
      bookIds: ["book-1"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty query", () => {
    const result = ChatRequestSchema.safeParse({
      query: "",
      bookIds: ["book-1"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty bookIds array", () => {
    const result = ChatRequestSchema.safeParse({
      query: "Test",
      bookIds: [],
    });
    expect(result.success).toBe(false);
  });
});
