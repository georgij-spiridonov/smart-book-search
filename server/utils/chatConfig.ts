import { z } from "zod";
import "zod-openapi";

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
    "CITATION RULES (very important):",
    "- Reference context fragments using numbered citations: [1], [2], [3], etc.",
    "- The number corresponds to the fragment number in the context (Fragment [1], Fragment [2], ...).",
    "- Place citations inline, right after the claim they support.",
    "- You may cite multiple fragments for one claim: [1][3].",
    "- Every factual claim MUST have at least one citation.",
    "",
    "Adapt your response to the user's intent:",
    "- If the user is looking for a specific quote or text fragment, return the exact passage(s) with citations.",
    "- If the user asks a question, synthesise a concise answer and cite the relevant fragments inline.",
    "",
    "Keep your answer concise, well-structured, and in the same language as the user's question.",
  ].join("\n"),
} as const;

/** Schema for a single message in the chat history. */
export const ChatMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]).meta({ description: "Message role." }),
    content: z.string().min(1).meta({ description: "Message text content." }),
  })
  .meta({
    id: "ChatMessage",
    description: "A single message in the conversation history.",
  });

/** A single message in the chat history. */
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/** Schema for the /api/chat request body. */
export const ChatRequestSchema = z
  .object({
    query: z.string().min(1, "Missing or empty 'query' field.").meta({
      description: "User's search query or question.",
      example: "Что произошло с Наташей в эпилоге?",
    }),
    bookIds: z
      .array(z.string())
      .min(1, "Missing or empty 'bookIds' array.")
      .meta({
        description: "IDs of books to search across.",
        example: ["war-and-peace"],
      }),
    history: z
      .array(ChatMessageSchema)
      .optional()
      .default([])
      .meta({
        description: "Previous conversation messages for multi-turn context.",
      }),
  })
  .meta({
    id: "ChatRequest",
    description: "Request body for the book chat pipeline.",
  });

/** A retrieved text chunk with location metadata. */
export interface RetrievedChunk {
  text: string;
  pageNumber: number;
  chapterTitle: string;
  score: number;
  bookId: string;
}

// ─── SSE response schemas (for OpenAPI documentation) ───

/** Schema for the `data-meta` SSE event payload. */
export const DataMetaSchema = z
  .object({
    bookIds: z
      .array(z.string())
      .meta({ description: "IDs of books that were searched." }),
    hasContext: z
      .boolean()
      .meta({ description: "Whether relevant text fragments were found." }),
    notVectorized: z
      .array(z.string())
      .meta({ description: "Book IDs that have not been indexed yet." }),
  })
  .meta({
    id: "DataMeta",
    description: "Metadata sent as the first SSE event in the chat stream.",
  });

/** Schema for a single chunk in the `data-chunks` SSE event. */
export const ChunkItemSchema = z
  .object({
    index: z
      .number()
      .int()
      .meta({ description: "1-based fragment index.", example: 1 }),
    text: z.string().meta({ description: "Text content of the fragment." }),
    pageNumber: z
      .number()
      .int()
      .meta({ description: "Page number (0 if unknown).", example: 42 }),
    chapterTitle: z
      .string()
      .meta({
        description: "Chapter title (empty string if unknown).",
        example: "Эпилог",
      }),
    score: z
      .number()
      .meta({
        description: "Cosine similarity relevance score (0.0–1.0).",
        example: 0.87,
      }),
    bookId: z
      .string()
      .meta({
        description: "ID of the source book.",
        example: "war-and-peace",
      }),
  })
  .meta({
    id: "ChunkItem",
    description: "A retrieved text fragment with source metadata.",
  });
