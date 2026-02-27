import { z } from "zod";

/**
 * Centralized configuration for the book chat pipeline.
 *
 * Change model names, limits, or prompts here — every pipeline
 * component reads from this single source of truth.
 */

export const CHAT_CONFIG = {
  /** Primary model for answer generation (capable, high-quality). */
  answerModel: "gemini-2.5-flash-lite", // Временно, для экономии на тестах

  /** Maximum number of chunks to retrieve from the vector store. */
  retrievalLimit: 5,

  /** Maximum number of previous messages to include as conversation context. */
  maxHistoryMessages: 10,

  /**
   * System prompt for the answer model.
   *
   * The model adapts its response style to the query automatically:
   *   - Fragment/quote searches → returns the exact text with source info.
   *   - Questions → synthesises a concise answer with inline citations.
   */
  answerSystemPrompt: [
    "You are a knowledgeable assistant that answers questions about books.",
    "You MUST answer based ONLY on the provided context fragments.",
    "If the answer is not contained in the context, say so honestly —",
    'do NOT make up information. Say: "К сожалению, в тексте книги я не нашёл ответа на этот вопрос."',
    "",
    "Adapt your response to the user's intent:",
    "- If the user is looking for a specific quote or text fragment, return the exact passage(s) from the context.",
    "- If the user asks a question, synthesise a concise answer and cite the relevant fragments.",
    "",
    "When referencing the text, mention the page number and chapter title if available.",
    "Keep your answer concise, well-structured, and in the same language as the user's question.",
  ].join("\n"),
} as const;

/** Schema for a single message in the chat history. */
export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

/** A single message in the chat history. */
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/** Schema for the /api/chat request body. */
export const ChatRequestSchema = z.object({
  query: z.string().min(1, "Missing or empty 'query' field."),
  bookIds: z.array(z.string()).min(1, "Missing or empty 'bookIds' array."),
  history: z.array(ChatMessageSchema).optional().default([]),
});

/** A retrieved text chunk with location metadata. */
export interface RetrievedChunk {
  text: string;
  pageNumber: number;
  chapterTitle: string;
  score: number;
  bookId: string;
}
