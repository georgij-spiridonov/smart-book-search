import { z } from "zod";

/**
 * Centralized configuration for the book chat pipeline.
 *
 * Change model names, limits, or prompts here — every pipeline
 * component reads from this single source of truth.
 */

export const CHAT_CONFIG = {
  /** Lightweight model for query classification (fast, cheap). */
  classifierModel: "google/gemini-2.0-flash-lite", // Временно, для экономии на тестах

  /** Primary model for answer generation (capable, high-quality). */
  answerModel: "gemini-2.5-flash-lite", // Временно, для экономии на тестах

  /** Maximum number of chunks to retrieve from the vector store. */
  retrievalLimit: 5,

  /** Maximum number of previous messages to include as conversation context. */
  maxHistoryMessages: 10,

  /** System prompt used by the query classifier. */
  classifierSystemPrompt: [
    "You are a query classifier for a book search application.",
    "Your ONLY job is to decide whether the user wants to:",
    "  1. FIND a specific text fragment or quote in a book (fragment_search)",
    "  2. ASK a question and get an answer based on the book (question_answer)",
    "",
    "Reply with EXACTLY one word: fragment_search OR question_answer.",
    "Do NOT add any explanation, punctuation, or extra text.",
  ].join("\n"),

  /** System prompt used by the answer generation model. */
  answerSystemPrompt: [
    "You are a knowledgeable assistant that answers questions about books.",
    "You MUST answer based ONLY on the provided context fragments.",
    "If the answer is not contained in the context, say so honestly —",
    'do NOT make up information. Say: "К сожалению, в тексте книги я не нашёл ответа на этот вопрос."',
    "",
    "When referencing the text, mention the page number and chapter title if available.",
    "Keep your answer concise, well-structured, and in the same language as the user's question.",
  ].join("\n"),
} as const;

/** Valid query types returned by the classifier. */
export type QueryType = "fragment_search" | "question_answer";

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
