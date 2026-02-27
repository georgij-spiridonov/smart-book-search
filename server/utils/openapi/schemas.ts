/**
 * Centralized Zod schemas with OpenAPI metadata.
 *
 * These schemas are the SINGLE SOURCE OF TRUTH for both:
 *   1. Runtime request/response validation
 *   2. OpenAPI 3.1 documentation generation (via zod-openapi)
 *
 * Every `.meta()` call enriches the generated OpenAPI spec with
 * descriptions, examples, and component IDs — keeping docs always
 * in sync with the actual code.
 */

import { z } from "zod";

// ─────────────────────────── Shared primitives ───────────────────────────

export const BookIdSchema = z.string().meta({
  description:
    "URL-friendly slug identifier of the book, derived from the filename.",
  example: "war-and-peace",
});

// ─────────────────────────── GET /api/books ───────────────────────────

export const BookItemSchema = z
  .object({
    id: BookIdSchema,
    title: z.string().meta({
      description: "Book title (derived from filename).",
      example: "war-and-peace",
    }),
    author: z.string().meta({
      description:
        'Author name. Defaults to "Unknown" if not provided at upload.',
      example: "Л.Н. Толстой",
    }),
    coverUrl: z.string().meta({
      description:
        "URL of the book cover image (empty string if not provided).",
      example: "",
    }),
    blobUrl: z.string().url().meta({
      description: "Public URL of the file in Vercel Blob storage.",
      example:
        "https://abc.public.blob.vercel-storage.com/books/war-and-peace.txt",
    }),
    filename: z.string().meta({
      description: "Original filename as uploaded.",
      example: "war-and-peace.txt",
    }),
    fileSize: z
      .number()
      .int()
      .meta({ description: "File size in bytes.", example: 3200000 }),
    uploadedAt: z.string().datetime().meta({
      description: "Upload timestamp in ISO 8601 format.",
      example: "2026-02-27T10:00:00.000Z",
    }),
    vectorized: z.boolean().meta({
      description: "Whether the book has been indexed and is ready for search.",
    }),
  })
  .meta({
    id: "BookItem",
    description: "Metadata of a single book in the system.",
  });

export const GetBooksResponseSchema = z
  .object({
    status: z.literal("success"),
    count: z
      .number()
      .int()
      .meta({ description: "Total number of books.", example: 2 }),
    books: z.array(BookItemSchema),
  })
  .meta({ id: "GetBooksResponse" });

// ─────────────────────────── POST /api/books/upload ───────────────────────────

export const UploadResponseSchema = z
  .object({
    status: z.literal("success"),
    message: z.string().meta({
      description: "Human-readable result message.",
      example: 'File "war-and-peace.txt" uploaded successfully.',
    }),
    blob: z.object({
      url: z
        .string()
        .url()
        .meta({ description: "Public URL of the uploaded file." }),
      pathname: z.string().meta({
        description: "Path within Blob storage.",
        example: "books/war-and-peace.txt",
      }),
      contentType: z
        .string()
        .meta({ description: "MIME type of the file.", example: "text/plain" }),
      size: z
        .number()
        .int()
        .meta({ description: "File size in bytes.", example: 3200000 }),
    }),
  })
  .meta({ id: "UploadResponse" });

// ─────────────────────────── POST /api/books/vectorize ───────────────────────────

export const VectorizeRequestSchema = z
  .object({
    blobUrl: z.string().url().meta({
      description:
        "URL of the file in Vercel Blob (returned by the upload endpoint).",
      example:
        "https://abc.public.blob.vercel-storage.com/books/war-and-peace.txt",
    }),
    bookName: z.string().min(1).meta({
      description: "Human-readable book title.",
      example: "Война и мир",
    }),
    bookId: z.string().optional().meta({
      description:
        "Book ID in the store. If omitted, resolved automatically from blobUrl.",
      example: "war-and-peace",
    }),
    author: z.string().optional().meta({
      description: "Author name (passed into chunk metadata).",
      example: "Л.Н. Толстой",
    }),
    resume: z.boolean().optional().meta({
      description:
        "If true, skip chunks that were already vectorized (for resuming interrupted jobs).",
    }),
  })
  .meta({ id: "VectorizeRequest" });

export const VectorizeResponseSchema = z
  .object({
    status: z.literal("accepted"),
    jobId: z.string().meta({
      description: "Unique job identifier for polling.",
      example: "job-1709035200000-a1b2c3",
    }),
    message: z.string().meta({
      description: "Human-readable confirmation.",
      example: 'Vectorization job queued for "Война и мир".',
    }),
    statusUrl: z.string().meta({
      description: "Relative URL for polling job status.",
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
      .meta({ description: "Page currently being processed.", example: 42 }),
    totalPages: z
      .number()
      .int()
      .meta({ description: "Total pages in the book.", example: 1200 }),
    chunksProcessed: z.number().int().meta({
      description: "Number of text chunks processed so far.",
      example: 150,
    }),
    totalChunks: z
      .number()
      .int()
      .meta({ description: "Total expected chunks.", example: 500 }),
  })
  .meta({ id: "JobProgress" });

export const JobResultSchema = z
  .object({
    totalPages: z.number().int(),
    totalChunks: z.number().int(),
    skipped: z
      .number()
      .int()
      .meta({ description: "Chunks skipped (when resume=true)." }),
    newVectors: z
      .number()
      .int()
      .meta({ description: "New vectors upserted into Pinecone." }),
  })
  .meta({ id: "JobResult" });

export const JobStatusResponseSchema = z
  .object({
    id: z
      .string()
      .meta({ description: "Job ID.", example: "job-1709035200000-a1b2c3" }),
    bookName: z.string().meta({
      description: "Name of the book being processed.",
      example: "Война и мир",
    }),
    status: z.enum(["pending", "processing", "completed", "failed"]).meta({
      description: "Current job status.",
    }),
    progress: JobProgressSchema,
    result: JobResultSchema.optional().meta({
      description: 'Present when status is "completed".',
    }),
    error: z
      .string()
      .optional()
      .meta({ description: 'Error message, present when status is "failed".' }),
    createdAt: z
      .string()
      .datetime()
      .meta({ description: "Job creation timestamp (ISO 8601)." }),
    updatedAt: z
      .string()
      .datetime()
      .meta({ description: "Last update timestamp (ISO 8601)." }),
  })
  .meta({ id: "JobStatusResponse" });

// ─────────────────────────── Error response ───────────────────────────

export const createErrorSchema = (
  statusCode: number,
  statusMessage: string,
  description: string = "Standard Nuxt error response format.",
) => {
  return z
    .object({
      statusCode: z
        .number()
        .int()
        .meta({ description: "HTTP status code.", example: statusCode }),
      statusMessage: z
        .string()
        .meta({ description: "Short status text.", example: statusMessage }),
      message: z
        .string()
        .optional()
        .meta({ description: "Detailed error description." }),
      data: z
        .record(z.string(), z.unknown())
        .optional()
        .meta({ description: "Additional error data." }),
    })
    .meta({
      id: `ErrorResponse${statusCode}`,
      description,
    });
};

// Common error schemas
export const Error400Schema = createErrorSchema(400, "Bad Request");
export const Error404Schema = createErrorSchema(404, "Not Found");
export const Error429Schema = createErrorSchema(429, "Too Many Requests");
export const Error500Schema = createErrorSchema(500, "Internal Server Error");
