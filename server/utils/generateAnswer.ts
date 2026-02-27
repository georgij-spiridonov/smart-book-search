import { generateText, streamText } from "ai";
import {
  CHAT_CONFIG,
  type ChatMessage,
  type RetrievedChunk,
} from "./chatConfig";
import { log } from "./logger";

export interface AnswerResult {
  /** The generated answer text. */
  text: string;
  /** The model used for generation. */
  model: string;
  /** Token usage statistics. */
  usage: {
    inputTokens: number | undefined;
    outputTokens: number | undefined;
  };
}

/**
 * Formats retrieved chunks into a context block for the model prompt.
 */
function formatContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return "No relevant text fragments were found in the books.";
  }

  return chunks
    .map((chunk, i) => {
      const location = [
        chunk.chapterTitle && `Chapter: ${chunk.chapterTitle}`,
        chunk.pageNumber > 0 && `Page: ${chunk.pageNumber}`,
        chunk.bookId && `Book ID: ${chunk.bookId}`,
      ]
        .filter(Boolean)
        .join(" | ");

      return `--- Fragment [${i + 1}] (${location}) ---\n${chunk.text}`;
    })
    .join("\n\n");
}

/**
 * Converts chat history into the messages format expected by the AI SDK.
 */
function buildMessages(
  query: string,
  chunks: RetrievedChunk[],
  history: ChatMessage[],
): Array<{ role: "user" | "assistant"; content: string }> {
  // Take only the most recent messages to stay within context limits
  const recentHistory = history.slice(-CHAT_CONFIG.maxHistoryMessages);

  const contextBlock = formatContext(chunks);

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

  // Add conversation history
  for (const msg of recentHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // Add current query with context
  messages.push({
    role: "user",
    content: `Context from books:\n\n${contextBlock}\n\n---\n\nUser question: ${query}`,
  });

  return messages;
}

/**
 * Generates an answer to the user's question based on retrieved book chunks
 * and conversation history.
 *
 * @param query - The user's current question.
 * @param chunks - Retrieved text chunks providing context.
 * @param history - Previous messages in the conversation.
 * @returns The generated answer with usage metadata.
 */
export async function generateAnswer(
  query: string,
  chunks: RetrievedChunk[],
  history: ChatMessage[] = [],
): Promise<AnswerResult> {
  log.info("generation", "Generating complete answer", {
    queryLength: query.length,
    chunksCount: chunks.length,
    historyLength: history.length,
    model: CHAT_CONFIG.answerModel,
  });

  const messages = buildMessages(query, chunks, history);

  const result = await generateText({
    model: CHAT_CONFIG.answerModel,
    system: CHAT_CONFIG.answerSystemPrompt,
    messages,
  });

  const answer = {
    text: result.text,
    model: CHAT_CONFIG.answerModel,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    },
  };

  log.info("generation", "Answer generated successfully", {
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  });

  return answer;
}

/**
 * Streams an answer to the user's question based on retrieved book chunks
 * and conversation history.
 *
 * Returns the `streamText` result object — use `.toUIMessageStream()` to
 * pipe it into a `createUIMessageStream` writer.
 *
 * @param query - The user's current question.
 * @param chunks - Retrieved text chunks providing context.
 * @param history - Previous messages in the conversation.
 */
export function streamAnswer(
  query: string,
  chunks: RetrievedChunk[],
  history: ChatMessage[] = [],
) {
  log.info("generation", "Starting answer stream", {
    queryLength: query.length,
    chunksCount: chunks.length,
    historyLength: history.length,
    model: CHAT_CONFIG.answerModel,
  });

  const messages = buildMessages(query, chunks, history);

  return streamText({
    model: CHAT_CONFIG.answerModel,
    system: CHAT_CONFIG.answerSystemPrompt,
    messages,
  });
}
