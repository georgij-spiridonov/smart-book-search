# 📚 Smart Book Search

[![Nuxt](https://img.shields.io/badge/Nuxt-4-green?logo=nuxt.js)](https://nuxt.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-Vitest-orange?logo=vitest)](https://vitest.dev/)
[![Inngest](https://img.shields.io/badge/Background-Inngest-violet?logo=inngest)](https://www.inngest.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

Smart Book Search — это современный полнофункциональный сервис для поиска и взаимодействия с содержимым книг с помощью Искусственного Интеллекта.

Проект создан для отборочного этапа ТехноСтрелки 2026.

## ℹ️ О проекте

Smart Book Search позволяет пользователям загружать свои книги и документы, выполнять семантический поиск по их содержимому и вести диалог с ИИ-ассистентом, который опирается на текст первоисточников. Система автоматически извлекает текст, разбивает его на смысловые фрагменты и векторизует для быстрого и точного поиска.

### ✨ Основные возможности:

- **Умный Чат:** Ведение диалога с книгой с использованием LLM (через Vercel AI SDK).
- **Семантический поиск:** Поиск не по ключевым словам, а по смыслу благодаря векторным эмбеддингам.
- **Управление библиотекой:** Загрузка книг в форматах PDF, EPUB и TXT, редактирование метаданных и удаление.
- **Цитаты и обоснование:** Ответы ИИ содержат ссылки на конкретные фрагменты текста (цитаты) с указанием глав и страниц.
- **Асинхронная обработка:** Извлечение текста и векторизация происходят в фоновом режиме с использованием Inngest.
- **Мультиязычность:** Полная поддержка русского и английского языков (i18n), лёгкое добавление новых.
- **Адаптивный дизайн:** Современный интерфейс на базе Nuxt UI, прекрасно работающий на мобильных устройствах и десктопах.

### 🛠️ Стек технологий:

- **Frontend:** [Nuxt 4](https://nuxt.com/), [Vue 3](https://vuejs.org/), [Nuxt UI](https://ui.nuxt.com/), [Tailwind CSS](https://tailwindcss.com/)
- **ИИ и Эмбеддинги:** [Vercel AI SDK](https://ai-sdk.dev/), [Pinecone](https://www.pinecone.io/)
- **API и Валидация:** [Zod](https://zod.dev/), [Zod-OpenAPI](https://www.npmjs.com/package/zod-openapi)
- **Хранилище файлов:** [Vercel Blob](https://vercel.com/docs/storage/vercel-blob)
- **База данных:** SQLite (через [NuxtHub](https://hub.nuxt.com/)), [Drizzle ORM](https://orm.drizzle.team/)
- **Кеширование и Rate Limits:** [Upstash Redis](https://upstash.com/)
- **Фоновые задачи:** [Inngest](https://www.inngest.com/)

---

## ▶️ Демо

Демонстрационную версию можно найти по указанному в описании репозитория адресу.

> [!IMPORTANT]
> **Доступность из РФ:** Иногда сайты, размещенные на платформе Vercel (включая демонстрационную версию проекта), могут быть недоступны в Росси из-за сетевых ограничений, даже несмотря на то, что сам сервис в России не запрещен. Если у вас возникают проблемы с доступом, используйте VPN или прокси-сервер.

## 🚀 Автоматический деплой

[![Деплой с Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fgeorgij-spiridonov%2Fsmart-book-search&env=AI_GATEWAY_API_KEY,PINECONE_API_KEY,PINECONE_INDEX,PINECONE_HOST,BOOKS_BLOB_READ_WRITE_TOKEN,KV_REST_API_URL,KV_REST_API_TOKEN,INNGEST_EVENT_KEY,INNGEST_SIGNING_KEY,TURSO_AUTH_TOKEN,TURSO_DATABASE_URL,NUXT_SESSION_PASSWORD,ADMIN_PASSWORD)

## ⚙️ Локальная разработка

### 1. Установка зависимостей

Убедитесь, что у вас установлен Node.js (рекомендуется v22+). Клонируйте репозиторий и установите зависимости:

```bash
npm install
```

### 2. Переменные окружения

Для работы приложения требуются сторонние сервисы. Скопируйте файл конфигурации `.env.example` в `.env`:

```bash
cp .env.example .env
```

Заполните `.env` вашими актуальными ключами доступа:

- **Vercel AI Gateway:** `AI_GATEWAY_API_KEY`
- **Pinecone:** `PINECONE_API_KEY`, `PINECONE_INDEX`, `PINECONE_HOST`
- **Vercel Blob:** `BOOKS_BLOB_READ_WRITE_TOKEN`
- **Upstash Redis:** `KV_REST_API_URL`, `KV_REST_API_TOKEN`
- **Inngest:** `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`
- **Turso Database:** `TURSO_AUTH_TOKEN`, `TURSO_DATABASE_URL`
- **Auth Utils:** `NUXT_SESSION_PASSWORD` (произвольная строка)
- **Admin Password:** `ADMIN_PASSWORD` (пароль для входа в панель управления)

### 3. Запуск сервера для разработки

Запустите локальный сервер (по умолчанию доступен на `http://localhost:3000`):

```bash
npm run dev
```

## 🚀 Команды разработки

| Команда                      | Описание                                                 |
| :--------------------------- | :------------------------------------------------------- |
| `npm run dev`                | Запуск сервера разработки Nuxt                           |
| `npm run build`              | Сборка приложения для production                         |
| `npm run test`               | Запуск всех тестов (Vitest)                              |
| `npm run lint`               | Проверка кода линтером (ESLint)                          |
| `npm run typecheck`          | Проверка типов TypeScript                                |
| `npx inngest-cli@latest dev` | Запуск локального Inngest Dev Server (для фоновых задач) |

---

## 📖 API Документация

Проект автоматически генерирует интерактивную документацию OpenAPI:

- **Интерактивная документация API:** `/api/docs`
- **Спецификация OpenAPI (JSON):** `/api/openapi`

## 📄 Лицензия

Проект распространяется под лицензией MIT. Подробности см. в файле [LICENSE](LICENSE).

