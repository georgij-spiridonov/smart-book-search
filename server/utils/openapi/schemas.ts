/**
 * Централизованные схемы Zod с метаданными OpenAPI.
 * 
 * Эти схемы являются ЕДИНЫМ ИСТОЧНИКОМ ИСТИНЫ для:
 *   1. Валидации запросов и ответов во время выполнения (Runtime)
 *   2. Генерации документации OpenAPI 3.1 (через zod-openapi)
 * 
 * Каждый вызов `.meta()` обогащает генерируемую спецификацию OpenAPI
 * описаниями, примерами и идентификаторами компонентов.
 */

import { z } from "zod";

// ─────────────────────────── Общие примитивы ───────────────────────────

export const BookIdSchema = z.string().meta({
  description: "Уникальный идентификатор книги (slug), пригодный для использования в URL.",
  example: "war-and-peace",
});

// ─────────────────────────── GET /api/books ───────────────────────────

export const BookItemSchema = z
  .object({
    id: BookIdSchema,
    title: z.string().meta({
      description: "Название книги.",
      example: "Война и мир",
    }),
    author: z.string().meta({
      description: 'Имя автора. По умолчанию "Unknown", если не указано при загрузке.',
      example: "Л.Н. Толстой",
    }),
    coverUrl: z.string().meta({
      description: "URL изображения обложки книги (пустая строка, если отсутствует).",
      example: "",
    }),
    blobUrl: z.string().url().meta({
      description: "Публичный URL файла в хранилище Vercel Blob.",
      example: "https://abc.public.blob.vercel-storage.com/books/war-and-peace.txt",
    }),
    filename: z.string().meta({
      description: "Оригинальное имя загруженного файла.",
      example: "war-and-peace.txt",
    }),
    fileSize: z
      .number()
      .int()
      .meta({ description: "Размер файла в байтах.", example: 3200000 }),
    uploadedAt: z.string().datetime().meta({
      description: "Метка времени загрузки в формате ISO 8601.",
      example: "2026-02-27T10:00:00.000Z",
    }),
    vectorized: z.boolean().meta({
      description: "Флаг, указывающий, была ли книга проиндексирована и готова ли она к поиску.",
    }),
  })
  .meta({
    id: "BookItem",
    description: "Метаданные отдельной книги в системе.",
  });

export const GetBooksResponseSchema = z
  .object({
    status: z.literal("success"),
    count: z
      .number()
      .int()
      .meta({ description: "Общее количество найденных книг.", example: 2 }),
    books: z.array(BookItemSchema),
  })
  .meta({ id: "GetBooksResponse" });

// ─────────────────────────── POST /api/books/upload ───────────────────────────

export const UploadResponseSchema = z
  .object({
    status: z.literal("success"),
    message: z.string().meta({
      description: "Текстовое сообщение о результате операции.",
      example: 'Файл "war-and-peace.txt" успешно загружен.',
    }),
    blob: z.object({
      url: z
        .string()
        .url()
        .meta({ description: "Публичный URL загруженного файла." }),
      pathname: z.string().meta({
        description: "Путь к файлу внутри Blob-хранилища.",
        example: "books/war-and-peace.txt",
      }),
      contentType: z
        .string()
        .meta({ description: "MIME-тип файла.", example: "text/plain" }),
      size: z
        .number()
        .int()
        .meta({ description: "Размер файла в байтах.", example: 3200000 }),
    }),
  })
  .meta({ id: "UploadResponse" });

// ─────────────────────────── PATCH /api/books/:id ───────────────────────────

export const UpdateBookRequestSchema = z
  .object({
    title: z
      .string()
      .min(1)
      .optional()
      .meta({
        description: "Новое название книги.",
        example: "Война и мир (новое издание)",
      }),
    author: z
      .string()
      .min(1)
      .optional()
      .meta({
        description: "Новое имя автора.",
        example: "Лев Николаевич Толстой",
      }),
    coverUrl: z
      .string()
      .url()
      .or(z.literal(""))
      .optional()
      .meta({
        description: "Новый URL обложки книги.",
        example: "https://example.com/cover.jpg",
      }),
  })
  .meta({ id: "UpdateBookRequest" });

// ─────────────────────────── POST /api/books/vectorize ───────────────────────────

export const VectorizeRequestSchema = z
  .object({
    blobUrl: z.string().url().meta({
      description: "URL файла в Vercel Blob (полученный после загрузки).",
      example: "https://abc.public.blob.vercel-storage.com/books/war-and-peace.txt",
    }),
    bookName: z.string().min(1).meta({
      description: "Название книги.",
      example: "Война и мир",
    }),
    bookId: z.string().optional().meta({
      description: "ID книги в базе. Если не указан, будет определен автоматически по blobUrl.",
      example: "war-and-peace",
    }),
    author: z.string().optional().meta({
      description: "Имя автора (передается в метаданные фрагментов).",
      example: "Л.Н. Толстой",
    }),
    resume: z.boolean().optional().meta({
      description: "Если true, пропускать уже векторизованные фрагменты (для возобновления прерванных задач).",
    }),
  })
  .meta({ id: "VectorizeRequest" });

export const VectorizeResponseSchema = z
  .object({
    status: z.literal("accepted"),
    jobId: z.string().meta({
      description: "Уникальный идентификатор задачи для отслеживания прогресса.",
      example: "job-1709035200000-a1b2c3",
    }),
    message: z.string().meta({
      description: "Текстовое подтверждение постановки в очередь.",
      example: 'Задача векторизации для книги "Война и мир" добавлена в очередь.',
    }),
    statusUrl: z.string().meta({
      description: "Относительный URL для опроса статуса задачи.",
      example: "/api/books/jobs/job-1709035200000-a1b2c3",
    }),
  })
  .meta({ id: "VectorizeResponse" });

// ─────────────────────────── GET /api/books/jobs/:id ───────────────────────────

export const JobProgressSchema = z
  .object({
    currentPage: z
      .number()
      .int()
      .meta({ description: "Текущая обрабатываемая страница.", example: 42 }),
    totalPages: z
      .number()
      .int()
      .meta({ description: "Общее количество страниц в книге.", example: 1200 }),
    chunksProcessed: z.number().int().meta({
      description: "Количество обработанных текстовых фрагментов.",
      example: 150,
    }),
    totalChunks: z
      .number()
      .int()
      .meta({ description: "Общее ожидаемое количество фрагментов.", example: 500 }),
  })
  .meta({ id: "JobProgress" });

export const JobResultSchema = z
  .object({
    totalPages: z.number().int(),
    totalChunks: z.number().int(),
    skipped: z
      .number()
      .int()
      .meta({ description: "Пропущено фрагментов (при resume=true)." }),
    newVectors: z
      .number()
      .int()
      .meta({ description: "Новых векторов добавлено в Pinecone." }),
  })
  .meta({ id: "JobResult" });

export const JobStatusResponseSchema = z
  .object({
    id: z
      .string()
      .meta({ description: "ID задачи.", example: "job-1709035200000-a1b2c3" }),
    bookName: z.string().meta({
      description: "Название обрабатываемой книги.",
      example: "Война и мир",
    }),
    status: z.enum(["pending", "processing", "completed", "failed"]).meta({
      description: "Текущий статус задачи.",
    }),
    progress: JobProgressSchema,
    result: JobResultSchema.optional().meta({
      description: 'Присутствует, если статус "completed".',
    }),
    error: z
      .string()
      .optional()
      .meta({ description: 'Сообщение об ошибке, присутствует при статусе "failed".' }),
    createdAt: z
      .string()
      .datetime()
      .meta({ description: "Метка времени создания задачи (ISO 8601)." }),
    updatedAt: z
      .string()
      .datetime()
      .meta({ description: "Метка времени последнего обновления (ISO 8601)." }),
  })
  .meta({ id: "JobStatusResponse" });

// ─────────────────────────── Администратор ───────────────────────────

export const AdminLoginRequestSchema = z
  .object({
    password: z.string().meta({
      description: "Пароль администратора, настроенный на сервере.",
      example: "admin-secret-password",
    }),
  })
  .meta({ id: "AdminLoginRequest" });

export const AdminLoginResponseSchema = z
  .object({
    status: z.literal("success"),
    message: z.string().meta({
      description: "Сообщение о подтверждении доступа.",
      example: "Доступ администратора предоставлен",
    }),
  })
  .meta({ id: "AdminLoginResponse" });

export const AdminLogoutResponseSchema = z
  .object({
    status: z.literal("success"),
    message: z.string().meta({
      description: "Сообщение о выходе из системы.",
      example: "Сессия завершена",
    }),
  })
  .meta({ id: "AdminLogoutResponse" });

// ─────────────────────────── Ошибки ───────────────────────────

export const createErrorSchema = (
  statusCode: number,
  statusMessage: string,
  description: string = "Стандартный формат ответа об ошибке в Nuxt.",
) => {
  return z
    .object({
      statusCode: z
        .number()
        .int()
        .meta({ description: "HTTP код состояния.", example: statusCode }),
      statusMessage: z
        .string()
        .meta({ description: "Короткое текстовое описание статуса.", example: statusMessage }),
      message: z
        .string()
        .optional()
        .meta({ description: "Подробное описание ошибки." }),
      data: z
        .record(z.string(), z.unknown())
        .optional()
        .meta({ description: "Дополнительные данные об ошибке." }),
    })
    .meta({
      id: `ErrorResponse${statusCode}`,
      description,
    });
};

// Распространенные схемы ошибок
export const Error400Schema = createErrorSchema(400, "Bad Request");
export const Error401Schema = createErrorSchema(401, "Unauthorized");
export const Error404Schema = createErrorSchema(404, "Not Found");
export const Error429Schema = createErrorSchema(429, "Too Many Requests");
export const Error500Schema = createErrorSchema(500, "Internal Server Error");

// ─────────────────────────── Чат ───────────────────────────

export const TextPartSchema = z.object({
  type: z.literal("text"),
  text: z.string().meta({
    description: "Текстовое содержимое части сообщения.",
    example: "Здравствуйте, чем я могу вам помочь?",
  }),
});

export const MessagePartSchema = z
  .union([
    TextPartSchema,
    z
      .object({ type: z.string() })
      .passthrough()
      .meta({ description: "Универсальная часть сообщения для будущих расширений." }),
  ])
  .meta({ id: "MessagePart" });

export const ChatItemSchema = z
  .object({
    id: z.string().meta({
      description: "ID чата",
      example: "123e4567-e89b-12d3-a456-426614174000",
    }),
    title: z.string().nullable().meta({
      description: "Сгенерированный заголовок чата на основе первого сообщения.",
      example: "Обсуждение романа Война и мир",
    }),
    userId: z
      .string()
      .meta({ description: "ID владельца чата.", example: "user_123" }),
    createdAt: z
      .string()
      .datetime()
      .meta({ description: "Дата и время создания." }),
  })
  .meta({ id: "ChatItem" });

export const MessageItemSchema = z
  .object({
    id: z.string().meta({ description: "ID сообщения" }),
    chatId: z.string().meta({ description: "ID чата, к которому относится сообщение." }),
    role: z
      .enum(["user", "assistant", "system"])
      .meta({ description: "Роль отправителя сообщения." }),
    parts: z.array(MessagePartSchema).meta({
      description: "Массив частей сообщения (например, блоки текста).",
      example: [{ type: "text", text: "Привет" }],
    }),
    createdAt: z
      .string()
      .datetime()
      .meta({ description: "Дата и время создания." }),
  })
  .meta({ id: "MessageItem" });

export const GetChatsResponseSchema = z
  .array(ChatItemSchema)
  .meta({ id: "GetChatsResponse" });

export const GetChatByIdResponseSchema = ChatItemSchema.extend({
  messages: z
    .array(MessageItemSchema)
    .meta({ description: "Список сообщений в чате, отсортированных по времени." }),
}).meta({ id: "GetChatByIdResponse" });

export const DeleteChatResponseSchema = z
  .array(ChatItemSchema)
  .meta({ id: "DeleteChatResponse" });
