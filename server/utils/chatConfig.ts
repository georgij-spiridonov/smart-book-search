import { z } from "zod";
import "zod-openapi";

/**
 * Централизованная конфигурация для цепочки обработки чата с книгами.
 * 
 * Изменяйте названия моделей, лимиты или системные промпты здесь —
 * каждый компонент системы использует этот единый источник истины.
 */

export const CHAT_CONFIG = {
  /** Основная модель для генерации итогового ответа */
  answerModel: "gemini-2.5-flash-lite",

  /** Модель для генерации поисковых запросов */
  queryModel: "gemini-2.5-flash-lite",

  /** Максимальное количество фрагментов, извлекаемых из векторного хранилища на один запрос */
  retrievalLimit: 10,

  /** Максимальное количество предыдущих сообщений для контекста беседы */
  maxHistoryMessages: 10,

  /**
   * Системный промпт для модели генерации поисковых запросов.
   */
  querySystemPrompt: [
    "You are an expert search query generator for a book knowledge base.",
    "Your goal is to generate 3-5 distinct semantic (RAG-style) search queries that will help find the most relevant information in the book(s) to answer the user's question.",
    "Consider the book title and author if provided.",
    "The queries should be in the same language as the user's question.",
    "Output ONLY a JSON array of strings. No markdown, no explanations.",
  ].join("\n"),

  /**
   * Системный промпт для модели генерации ответа.
   */
  answerSystemPrompt: [
    "You are a knowledgeable assistant that answers questions about books.",
    "You should answer based on the provided context fragments.",
    "Before providing the final answer, think step-by-step about the information available in the context.",
    "Analyze character relationships and plot points carefully as they are described in the fragments.",
    "If the context doesn't contain a specific fact, relationship, or answer, say so honestly —",
    "do NOT make up information or assume relationships that are not explicitly stated.",
    'If the answer is missing, say: "К сожалению, в тексте книги я не нашёл ответа на этот вопрос."',
    "",
    "Adapt your response to the user's intent:",
    "- If the user is looking for a specific quote or text fragment, return the exact passage(s).",
    "- If the user asks a question, synthesise a natural, concise answer in your own words based on the context.",
    "",
    "Keep your answer concise, well-structured, and in the same language as the user's question.",
    "Keep your answer in 3-5 sentences.",
  ].join("\n"),
} as const;

/** Схема для одного сообщения в истории чата */
export const ChatMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]).meta({ description: "Роль отправителя сообщения." }),
    content: z.string().min(1).meta({ description: "Текстовое содержимое сообщения." }),
  })
  .meta({
    id: "ChatMessage",
    description: "Одно сообщение в истории переписки.",
  });

/** Тип данных для сообщения чата */
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/** Схема тела запроса к /api/chat */
export const ChatRequestSchema = z
  .object({
    chatId: z.string().optional().meta({
      description: "Необязательный ID чата для продолжения существующей беседы.",
      example: "123e4567-e89b-12d3-a456-426614174000",
    }),
    query: z.string().min(1, "Поле 'query' отсутствует или пустое.").meta({
      description: "Поисковый запрос или вопрос пользователя.",
      example: "Что произошло с Наташей в эпилоге?",
    }),
    bookIds: z
      .array(z.string())
      .min(1, "Массив 'bookIds' отсутствует или пуст.")
      .meta({
        description: "Список ID книг, по которым нужно провести поиск.",
        example: ["war-and-peace"],
      }),
  })
  .meta({
    id: "ChatRequest",
    description: "Тело запроса для системы чата по книгам.",
  });

/** Фрагмент извлеченного текста с метаданными расположения */
export interface RetrievedChunk {
  /** Содержимое фрагмента */
  text: string;
  /** Номер страницы */
  pageNumber: number;
  /** Заголовок главы */
  chapterTitle: string;
  /** Оценка релевантности */
  score: number;
  /** ID источника (книги) */
  bookId: string;
}

/** Схема для одного шага в SSE-событии `data-step` */
export const DataStepSchema = z
  .object({
    text: z.string().meta({ description: "Описание текущего шага обработки." }),
    state: z
      .enum(["active", "done"])
      .meta({ description: "Текущее состояние шага." }),
  })
  .meta({
    id: "DataStep",
    description: "Информационный шаг процесса обработки запроса.",
  });

// ─── Схемы SSE-ответов (для документации OpenAPI) ───

/** Схема полезной нагрузки для SSE-события `data-meta` */
export const DataMetaSchema = z
  .object({
    bookIds: z
      .array(z.string())
      .meta({ description: "Список ID книг, в которых велся поиск." }),
    hasContext: z
      .boolean()
      .meta({ description: "Были ли найдены релевантные фрагменты." }),
    notVectorized: z
      .array(z.string())
      .meta({ description: "Список ID книг, которые еще не проиндексированы." }),
  })
  .meta({
    id: "DataMeta",
    description: "Метаданные, отправляемые первым событием в потоке чата.",
  });

/** Схема отдельного фрагмента для SSE-события `data-chunks` */
export const ChunkItemSchema = z
  .object({
    index: z
      .number()
      .int()
      .meta({ description: "Индекс фрагмента (начиная с 1).", example: 1 }),
    text: z.string().meta({ description: "Текст фрагмента." }),
    pageNumber: z
      .number()
      .int()
      .meta({ description: "Номер страницы (0, если неизвестно).", example: 42 }),
    chapterTitle: z.string().meta({
      description: "Название главы (пустая строка, если неизвестно).",
      example: "Эпилог",
    }),
    score: z.number().meta({
      description: "Оценка косинусного сходства (0.0–1.0).",
      example: 0.87,
    }),
    bookId: z.string().meta({
      description: "ID исходной книги.",
      example: "war-and-peace",
    }),
  })
  .meta({
    id: "ChunkItem",
    description: "Найденный текстовый фрагмент с метаданными источника.",
  });
