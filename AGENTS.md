# AI Agent Guide: Smart Book Search

Welcome, fellow AI agent! This document provides the essential context, architectural patterns, and coding standards for the **Smart Book Search** project. Use this as your primary source of truth for understanding how the system works and how to contribute effectively.

---

## 🚀 Project Overview
Smart Book Search is a RAG (Retrieval-Augmented Generation) application built with **Nuxt 4**. It allows users to upload books (PDF, EPUB, TXT), vectorize their content, and then chat with those books using LLMs.

### Key Features
- **Book Management**: Upload, delete, and manage a library of books.
- **Vectorization Pipeline**: Automated text extraction and indexing into Pinecone via Inngest background jobs.
- **RAG Chat**: Multi-query search, semantic retrieval from Pinecone, and streaming AI responses with citations.
- **Admin Dashboard**: Secure area for managing the global book collection.

---

## 🛠 Tech Stack
- **Framework**: [Nuxt 4](https://nuxt.com/) (using the new `app/` and `server/` directory structure).
- **Frontend**: Vue 3, [Nuxt UI v4.5](https://ui.nuxt.com/), Tailwind CSS v4.
- **Backend**: Nuxt Server (H3), [Nuxt Hub](https://hub.nuxt.com/) (SQLite/Drizzle).
- **AI/LLM**: [Vercel AI SDK](https://sdk.vercel.ai/) (`ai` package), Google Gemini models (via AI Gateway).
- **Vector Database**: [Pinecone](https://www.pinecone.io/).
- **Background Jobs**: [Inngest](https://www.inngest.com/).
- **File Storage**: Vercel Blob.
- **Database**: Drizzle ORM with SQLite.
- **Validation**: Zod.

---

## 📁 Directory Structure
```text
├── app/                # Frontend application (Nuxt 4 convention)
│   ├── components/     # UI Components (Nuxt UI based)
│   ├── composables/    # Shared logic (useChats, useEvents, etc.)
│   ├── layouts/        # Page layouts
│   ├── pages/          # Application routes
│   └── utils/          # Frontend-only utilities
├── server/             # Backend server logic
│   ├── api/            # API Endpoints (H3 event handlers)
│   ├── db/             # Database schema and migrations (Drizzle)
│   └── utils/          # Server-side utilities (RAG, Inngest, etc.)
├── shared/             # Code shared between app/ and server/
│   └── types/          # Shared TypeScript definitions
├── i18n/               # Internationalization
└── public/             # Static assets
```

---

## 🔄 Core Workflows

### 1. Book Vectorization (The "Indexing" Pipeline)
When a book is uploaded:
1. It's stored in **Vercel Blob**.
2. A database record is created.
3. An **Inngest** event `book/vectorize` is triggered.
4. The Inngest worker:
   - Downloads the file and checks the hash (to avoid re-vectorizing).
   - Extracts text using `server/utils/textParser.ts` (supports PDF, EPUB, TXT).
   - Splits text into chunks using `server/utils/textSplitter.ts`.
   - Upserts chunks into **Pinecone** with metadata (page number, book ID, etc.).
   - Updates the book status to "vectorized".

### 2. Chat & RAG (The "Search" Pipeline)
When a user asks a question in `server/api/chat.post.ts`:
1. **Query Expansion**: LLM generates 3-5 search queries based on the user prompt and history (`server/utils/retrieval.ts`).
2. **Retrieval**: Parallel semantic search in **Pinecone** for all generated queries.
3. **Reranking**: Results are merged, deduplicated, and ranked by cosine similarity.
4. **Streaming Answer**: The AI SDK streams the final answer while also sending "data parts" containing the retrieved chunks (for citations).

---

## 🎨 Coding Standards & Conventions

### Styling (Tailwind CSS v4)
- We use **Tailwind CSS v4** with the `@theme` syntax in `app/assets/css/main.css`.
- Use **Nuxt UI v3** components whenever possible for consistency.
- Prefer semantic colors (e.g., `text-highlighted`, `bg-neutral-50`).

### Database (Drizzle ORM)
- Schema is defined in `server/db/schema.ts`.
- Use `hub:db` to access the database instance.
- Relations are explicitly defined using Drizzle's `relations` API.

### API Design
- Use **Zod** for request body/query validation.
- All chat-related streaming should use `createUIMessageStreamResponse` from the AI SDK.
- Use `event.waitUntil` for non-blocking background tasks during request handling (like title generation).

### Internationalization
- Use `$t()` or `useI18n()` for all user-facing strings.
- Translations are located in `i18n/locales/`.

---

## 🔑 Environment Variables
The following variables are required for full functionality:
- `BOOKS_BLOB_READ_WRITE_TOKEN`: Vercel Blob access.
- `AI_GATEWAY_API_KEY`: API key for the AI Gateway (OpenAI/Groq).
- `PINECONE_API_KEY` / `PINECONE_INDEX` / `PINECONE_HOST`: Vector DB config.
- `KV_REST_API_URL` / `KV_REST_API_TOKEN`: Upstash Redis (Rate limiting).
- `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`: Inngest background jobs.
- `ADMIN_PASSWORD`: Simple password for admin login.

---

## 🧪 Testing
- We use **Vitest** for unit and integration testing.
- Tests are located in `server/__tests__/`.
- Run tests with `npm test`.

---

## 🤖 Instructions for Agents
1. **Respect the Pipeline**: If you modify text extraction or splitting, ensure you update the Inngest function in `server/utils/inngest.ts` and verify with existing tests.
2. **Streaming Protocol**: Do not break the SSE/UI Message Stream protocol in `chat.post.ts`. The frontend expects specific data parts (`data-meta`, `data-chunks`, `data-step`).
3. **Admin Security**: Always verify the user's session and `isAdmin` flag for any destructive operations or admin-only APIs.
4. **Nuxt 4 Best Practices**: Follow the `app/` and `server/` separation. Avoid importing server utilities in the `app/` directory.

Happy coding! 📚✨
