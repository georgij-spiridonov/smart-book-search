import { generateText, streamText } from "ai";
import {
  CHAT_CONFIG,
  type ChatMessage,
  type RetrievedChunk,
} from "./chatConfig";
import { logger } from "./logger";

/** Результат генерации ответа моделью */
export interface AnswerResult {
  /** Текст сгенерированного ответа */
  text: string;
  /** Название использованной модели */
  model: string;
  /** Статистика использования токенов */
  usage: {
    inputTokens: number | undefined;
    outputTokens: number | undefined;
  };
}

/**
 * Форматирует найденные фрагменты текста в блок контекста для промпта модели.
 * 
 * @param {RetrievedChunk[]} contextChunks Список найденных релевантных фрагментов.
 * @returns {string} Отформатированная строка контекста.
 */
function formatKnowledgeContext(contextChunks: RetrievedChunk[]): string {
  if (contextChunks.length === 0) {
    return "No relevant text fragments were found in the books.";
  }

  return contextChunks
    .map((chunk, index) => {
      const metadataParts = [
        chunk.chapterTitle && `Chapter: ${chunk.chapterTitle}`,
        chunk.pageNumber > 0 && `Page: ${chunk.pageNumber}`,
        chunk.bookId && `Book ID: ${chunk.bookId}`,
      ]
        .filter(Boolean)
        .join(" | ");

      return `--- Fragment [${index + 1}] (${metadataParts}) ---\n${chunk.text}`;
    })
    .join("\n\n");
}

/**
 * Формирует список сообщений для AI SDK на основе истории и нового контекста.
 * 
 * @param {string} userQuery Текущий вопрос пользователя.
 * @param {RetrievedChunk[]} contextChunks Фрагменты текста из книг.
 * @param {ChatMessage[]} chatHistory История переписки.
 * @returns {Array<{ role: "user" | "assistant"; content: string }>} Список сообщений для LLM.
 */
function buildLlmMessages(
  userQuery: string,
  contextChunks: RetrievedChunk[],
  chatHistory: ChatMessage[],
): Array<{ role: "user" | "assistant"; content: string }> {
  // Ограничиваем историю сообщений согласно конфигурации
  const limitedHistory = chatHistory.slice(-CHAT_CONFIG.maxHistoryMessages);
  const knowledgeContext = formatKnowledgeContext(contextChunks);

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

  // Добавляем историю беседы
  for (const message of limitedHistory) {
    messages.push({ role: message.role, content: message.content });
  }

  // Добавляем текущий вопрос вместе с контекстом из книг
  messages.push({
    role: "user",
    content: `Context from books:\n\n${knowledgeContext}\n\n---\n\nUser question: ${userQuery}`,
  });

  return messages;
}

/**
 * Генерирует полный ответ на вопрос пользователя на основе найденных фрагментов и истории.
 * 
 * @param {string} userQuery Вопрос пользователя.
 * @param {RetrievedChunk[]} contextChunks Релевантные фрагменты книг.
 * @param {ChatMessage[]} chatHistory История чата.
 * @returns {Promise<AnswerResult>} Сгенерированный ответ с метаданными.
 */
export async function generateAnswer(
  userQuery: string,
  contextChunks: RetrievedChunk[],
  chatHistory: ChatMessage[] = [],
): Promise<AnswerResult> {
  logger.info("generation", "Generating complete answer", {
    queryLength: userQuery.length,
    chunksCount: contextChunks.length,
    historyLength: chatHistory.length,
    model: CHAT_CONFIG.answerModel,
  });

  const llmMessages = buildLlmMessages(userQuery, contextChunks, chatHistory);

  const generationResult = await generateText({
    model: CHAT_CONFIG.answerModel,
    system: CHAT_CONFIG.answerSystemPrompt,
    messages: llmMessages,
    temperature: 0.9,
  });

  const finalAnswer: AnswerResult = {
    text: generationResult.text,
    model: CHAT_CONFIG.answerModel,
    usage: {
      inputTokens: generationResult.usage.inputTokens,
      outputTokens: generationResult.usage.outputTokens,
    },
  };

  logger.info("generation", "Answer generated successfully", {
    inputTokens: generationResult.usage.inputTokens,
    outputTokens: generationResult.usage.outputTokens,
  });

  return finalAnswer;
}

/**
 * Запускает потоковую генерацию (стриминг) ответа на вопрос пользователя.
 * 
 * @param {string} userQuery Вопрос пользователя.
 * @param {RetrievedChunk[]} contextChunks Релевантные фрагменты книг.
 * @param {ChatMessage[]} chatHistory История чата.
 * @returns Возвращает объект потока от AI SDK.
 */
export function streamAnswer(
  userQuery: string,
  contextChunks: RetrievedChunk[],
  chatHistory: ChatMessage[] = [],
) {
  logger.info("generation", "Starting answer stream", {
    queryLength: userQuery.length,
    chunksCount: contextChunks.length,
    historyLength: chatHistory.length,
    model: CHAT_CONFIG.answerModel,
  });

  const llmMessages = buildLlmMessages(userQuery, contextChunks, chatHistory);

  return streamText({
    model: CHAT_CONFIG.answerModel,
    system: CHAT_CONFIG.answerSystemPrompt,
    messages: llmMessages,
    temperature: 0.9,
  });
}
