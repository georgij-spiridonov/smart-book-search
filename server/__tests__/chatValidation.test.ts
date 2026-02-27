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
      history: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing query", () => {
    const result = ChatRequestSchema.safeParse({
      bookIds: ["book-1"],
      history: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty query", () => {
    const result = ChatRequestSchema.safeParse({
      query: "",
      bookIds: ["book-1"],
      history: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty bookIds array", () => {
    const result = ChatRequestSchema.safeParse({
      query: "Test",
      bookIds: [],
      history: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid history role", () => {
    const result = ChatRequestSchema.safeParse({
      query: "Test",
      bookIds: ["book-1"],
      history: [{ role: "system", content: "Invalid role" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty history content", () => {
    const result = ChatRequestSchema.safeParse({
      query: "Test",
      bookIds: ["book-1"],
      history: [{ role: "user", content: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid history entries", () => {
    const result = ChatRequestSchema.safeParse({
      query: "Test",
      bookIds: ["book-1"],
      history: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("defaults history to empty array when omitted", () => {
    const result = ChatRequestSchema.safeParse({
      query: "Test",
      bookIds: ["book-1"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.history).toEqual([]);
    }
  });
});
