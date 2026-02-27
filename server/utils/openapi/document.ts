/**
 * OpenAPI 3.1.1 Document — generated from Zod schemas.
 *
 * This is the SINGLE SOURCE OF TRUTH for the API specification.
 * All schemas imported here carry `.meta()` annotations that
 * `zod-openapi` transforms into proper OpenAPI components.
 *
 * To view the rendered result:
 *   • JSON spec — GET /api/openapi
 *   • Interactive UI — GET /api/docs  (Scalar)
 */

import { z } from "zod";
import { createDocument } from "zod-openapi";

import {
  ChatRequestSchema,
  ChunkItemSchema,
  DataMetaSchema,
} from "../chatConfig";
import { RATE_LIMITS } from "../rateLimiter";
import {
  BookItemSchema,
  Error400Schema,
  Error404Schema,
  Error429Schema,
  Error500Schema,
  GetBooksResponseSchema,
  JobStatusResponseSchema,
  UploadResponseSchema,
  VectorizeRequestSchema,
  VectorizeResponseSchema,
} from "./schemas";

export const openApiDocument = createDocument({
  openapi: "3.1.1",
  info: {
    title: "Smart Book Search API",
    version: "1.0.0",
    description: [
      "API сервиса «Умный поиск по книгам».",
      "",
      "Позволяет загружать книги (.txt, .pdf, .epub), индексировать их содержимое",
      "в векторном хранилище (Pinecone) и задавать вопросы по тексту — система находит",
      "релевантные фрагменты и генерирует ответ с цитатами (RAG-пайплайн).",
      "",
      "### Основные сценарии",
      "1. **Загрузка** → `POST /api/books/upload`",
      "2. **Индексация** → `POST /api/books/vectorize` → поллинг `GET /api/books/jobs/{id}`",
      "3. **Чат** → `POST /api/chat` (SSE-стрим с метаданными и ответом LLM)",
    ].join("\n"),
  },
  servers: [
    { url: "http://localhost:3000", description: "Локальная разработка" },
    { url: "https://book-search.projects.georgijspiridonov.ru", description: "Рабочая версия" },
  ],
  tags: [
    {
      name: "Books",
      description: "Управление книгами: загрузка, просмотр, индексация.",
    },
    { name: "Jobs", description: "Отслеживание фоновых задач индексации." },
    { name: "Chat", description: "Чат с книгами (RAG-пайплайн)." },
  ],

  paths: {
    // ───────────────── GET /api/books ─────────────────
    "/api/books": {
      get: {
        operationId: "listBooks",
        summary: "Получить список всех книг",
        description:
          "Возвращает метаданные всех загруженных книг, отсортированных по дате загрузки (новые первыми).",
        tags: ["Books"],
        responses: {
          "200": {
            description: "Список книг успешно получен.",
            content: {
              "application/json": { schema: GetBooksResponseSchema },
            },
          },
          "429": {
            description: `Слишком много запросов (Общий лимит: ${RATE_LIMITS.default.tokens} запросов в ${RATE_LIMITS.default.window}).`,
            content: {
              "application/json": { schema: Error429Schema },
            },
          },
          "500": {
            description: "Ошибка сервера (Redis недоступен).",
            content: {
              "application/json": { schema: Error500Schema },
            },
          },
        },
      },
    },

    // ───────────────── POST /api/books/upload ─────────────────
    "/api/books/upload": {
      post: {
        operationId: "uploadBook",
        summary: "Загрузить файл книги",
        description: [
          "Принимает файл книги через `multipart/form-data`.",
          "Допустимые форматы: `.txt`, `.pdf`, `.epub`.",
          "Файл валидируется по Magic Bytes и сохраняется в Vercel Blob.",
          "Дубликаты определяются по SHA-256 хешу — повторная загрузка того же файла не создаёт копию.",
        ].join(" "),
        tags: ["Books"],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: z.object({
                file: z.string().meta({
                  description:
                    "Файл книги (.txt, .pdf, .epub). Отправляется как binary.",
                  override: { type: "string", format: "binary" },
                }),
                author: z.string().optional().meta({
                  description: 'Автор книги. По умолчанию: "Unknown".',
                  example: "Л.Н. Толстой",
                }),
                coverUrl: z.string().optional().meta({
                  description: 'URL обложки. По умолчанию: "".',
                  example: "https://example.com/cover.jpg",
                }),
              }),
            },
          },
        },
        responses: {
          "200": {
            description: "Файл успешно загружен (или найден дубликат).",
            content: {
              "application/json": { schema: UploadResponseSchema },
            },
          },
          "400": {
            description:
              "Невалидный запрос: нет файла, неподдерживаемый формат или содержимое не совпадает с расширением.",
            content: {
              "application/json": { schema: Error400Schema },
            },
          },
          "429": {
            description: `Слишком много запросов (Строгий лимит: ${RATE_LIMITS.strict.tokens} запросов в ${RATE_LIMITS.strict.window}).`,
            content: {
              "application/json": { schema: Error429Schema },
            },
          },
          "500": {
            description: "Внутренняя ошибка сервера.",
            content: {
              "application/json": { schema: Error500Schema },
            },
          },
        },
      },
    },

    // ───────────────── POST /api/books/vectorize ─────────────────
    "/api/books/vectorize": {
      post: {
        operationId: "vectorizeBook",
        summary: "Запустить индексацию книги",
        description: [
          "Ставит книгу в очередь на фоновую обработку (разбиение на чанки, генерация эмбеддингов, загрузка в Pinecone).",
          "Возвращает `jobId` для поллинга статуса через `GET /api/books/jobs/{id}`.",
        ].join(" "),
        tags: ["Books"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: VectorizeRequestSchema },
          },
        },
        responses: {
          "202": {
            description: "Задача принята в очередь.",
            content: {
              "application/json": { schema: VectorizeResponseSchema },
            },
          },
          "400": {
            description:
              "Невалидный запрос: отсутствует `blobUrl` или `bookName`.",
            content: {
              "application/json": { schema: Error400Schema },
            },
          },
          "404": {
            description: "Книга не найдена по указанному `blobUrl`.",
            content: {
              "application/json": { schema: Error404Schema },
            },
          },
          "429": {
            description: `Слишком много запросов (Строгий лимит: ${RATE_LIMITS.strict.tokens} запросов в ${RATE_LIMITS.strict.window}).`,
            content: {
              "application/json": { schema: Error429Schema },
            },
          },
        },
      },
    },

    // ───────────────── GET /api/books/jobs/{id} ─────────────────
    "/api/books/jobs/{id}": {
      get: {
        operationId: "getJobStatus",
        summary: "Получить статус задачи индексации",
        description:
          "Возвращает текущий статус и прогресс фоновой задачи. Используется для поллинга после вызова `POST /api/books/vectorize`. Задачи хранятся 1 час (TTL).",
        tags: ["Jobs"],
        requestParams: {
          path: z.object({
            id: z.string().meta({
              description:
                "ID задачи, полученный из `POST /api/books/vectorize`.",
              example: "job-1709035200000-a1b2c3",
            }),
          }),
        },
        responses: {
          "200": {
            description: "Статус задачи.",
            content: {
              "application/json": { schema: JobStatusResponseSchema },
            },
          },
          "400": {
            description: "ID задачи не указан.",
            content: {
              "application/json": { schema: Error400Schema },
            },
          },
          "404": {
            description: "Задача не найдена (или истекла).",
            content: {
              "application/json": { schema: Error404Schema },
            },
          },
          "429": {
            description: `Слишком много запросов (Общий лимит: ${RATE_LIMITS.default.tokens} запросов в ${RATE_LIMITS.default.window}).`,
            content: {
              "application/json": { schema: Error429Schema },
            },
          },
        },
      },
    },

    // ───────────────── POST /api/chat ─────────────────
    "/api/chat": {
      post: {
        operationId: "chatWithBooks",
        summary: "Чат с книгами (SSE-стрим)",
        description: [
          "Основной RAG-пайплайн. Получает запрос пользователя, ищет релевантные фрагменты в Pinecone,",
          "затем стримит ответ LLM через Server-Sent Events (SSE) в формате Vercel AI SDK UI Message Stream.",
          "",
          "### Протокол SSE-ответа",
          "",
          "Поток содержит следующие custom data parts:",
          "",
          "1. **`data-meta`** — метаинформация (bookIds, hasContext, notVectorized)",
          "2. **`data-chunks`** — массив найденных текстовых фрагментов с метаданными источника",
          "3. **`text-start` / `text-delta` / `text-end`** — стриминг ответа LLM",
          "4. **`data-error`** (при ошибке) — сообщение об ошибке генерации",
          "",
          "Если `hasContext: false` — стрим содержит только `data-meta` и пустой `data-chunks` (без LLM).",
          "",
          "### Интеграция с фронтендом",
          "",
          "Рекомендуется использовать хук `useChat` из `@ai-sdk/react` для автоматической обработки стрима.",
        ].join("\n"),
        tags: ["Chat"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: ChatRequestSchema },
          },
        },
        responses: {
          "200": {
            description: [
              "SSE-стрим (UI Message Stream).",
              "Первые два события: `data-meta` и `data-chunks` содержат метаинформацию и найденные фрагменты.",
              "Далее стримится ответ LLM.",
            ].join(" "),
            content: {
              "text/event-stream": {
                schema: z.object({
                  "data-meta": DataMetaSchema.meta({
                    description: "Первое событие — метаинформация о запросе.",
                  }),
                  "data-chunks": z.array(ChunkItemSchema).meta({
                    description:
                      "Второе событие — найденные текстовые фрагменты.",
                  }),
                }),
              },
            },
          },
          "400": {
            description: "Невалидный запрос (Zod-валидация не пройдена).",
            content: {
              "application/json": { schema: Error400Schema },
            },
          },
          "404": {
            description: "Одна из указанных книг не найдена.",
            content: {
              "application/json": { schema: Error404Schema },
            },
          },
          "429": {
            description: `Слишком много запросов (Лимит чата: ${RATE_LIMITS.chat.tokens} запросов в ${RATE_LIMITS.chat.window}).`,
            content: {
              "application/json": { schema: Error429Schema },
            },
          },
        },
      },
    },
  },

  // Register reusable components
  components: {
    schemas: {
      BookItem: BookItemSchema,
      Error400: Error400Schema,
      Error404: Error404Schema,
      Error429: Error429Schema,
      Error500: Error500Schema,
    },
  },
});
