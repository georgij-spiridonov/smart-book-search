import { z } from "zod";
import "zod-openapi";

/**
 * Centralized configuration for the book chat pipeline.
 *
 * Change model names, limits, or prompts here — every pipeline
 * component reads from this single source of truth.
 */

export const CHAT_CONFIG = {
  /** Primary model for answer generation. */
  answerModel: "gemini-2.5-flash-lite",

  /** Model for query generation. */
  queryModel: "gemini-2.5-flash-lite",


  /** Maximum number of chunks to retrieve from the vector store per query. */
  retrievalLimit: 5,

  /** Maximum number of previous messages to include as conversation context. */
  maxHistoryMessages: 10,

  /**
   * System prompt for the query generation model.
   */
  querySystemPrompt: [
    "You are an expert search query generator for a book knowledge base.",
    "Your goal is to generate 3-5 distinct search queries that will help find the most relevant information in the book(s) to answer the user's question.",
    "Consider the book title and author if provided.",
    "The queries should be in the same language as the user's question.",
    "Output ONLY a JSON array of strings. No markdown, no explanations.",
    "Example: ['How does Natasha change?', 'Natasha Rostova character development', 'Natasha in the epilogue']",
  ].join("\n"),

  /**
   * System prompt for the answer model.
   */
  answerSystemPrompt: [
    "You are a knowledgeable assistant that answers questions about books.",
    "You MUST answer based ONLY on the provided context fragments.",
    "If the answer is not contained in the context, say so honestly —",
    'do NOT make up information. Say: "К сожалению, в тексте книги я не нашёл ответа на этот вопрос."',
    "",
    "CITATION RULES (very important):",
    "- Reference context fragments using numbered citations in square brackets: [1], [2], [3], etc.",
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
    "Keep your answer in 3-5 sentences.",
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
    chatId: z.string().optional().meta({
      description: "Optional chat ID to continue an existing conversation.",
      example: "123e4567-e89b-12d3-a456-426614174000",
    }),
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

/** Schema for a single step in the `data-step` SSE event. */
export const DataStepSchema = z
  .object({
    text: z.string().meta({ description: "Description of the step." }),
    state: z
      .enum(["active", "done"])
      .meta({ description: "Current state of the step." }),
  })
  .meta({
    id: "DataStep",
    description: "A reasoning step sent during the retrieval pipeline.",
  });

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
    chapterTitle: z.string().meta({
      description: "Chapter title (empty string if unknown).",
      example: "Эпилог",
    }),
    score: z.number().meta({
      description: "Cosine similarity relevance score (0.0–1.0).",
      example: 0.87,
    }),
    bookId: z.string().meta({
      description: "ID of the source book.",
      example: "war-and-peace",
    }),
  })
  .meta({
    id: "ChunkItem",
    description: "A retrieved text fragment with source metadata.",
  });
