# 📚 Smart Book Search

[![Nuxt](https://img.shields.io/badge/Nuxt-4-green?logo=nuxt.js)](https://nuxt.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-Vitest-orange?logo=vitest)](https://vitest.dev/)
[![Inngest](https://img.shields.io/badge/Background-Inngest-violet?logo=inngest)](https://www.inngest.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

> **Внимание:** Проект находится в стадии активной разработки. В данный момент реализована только backend-часть проекта, frontend (пользовательский интерфейс) ещё не готов.

> Проект создан для отборочного этапа ТехноСтрелки 2026.

## ℹ️ О проекте

Smart Book Search — это сервис поиска по книгам, использующий ИИ для семантического поиска и взаимодействия с содержимым книг.

Бэкенд предоставляет API для загрузки книг (PDF, ePub, txt), извлечения текста, векторизации содержимого, умного поиска и безопасного хранения истории чатов на сервере. Асинхронная обработка фоновых задач построена на базе Inngest.

### 🛠️ Стек:

- **Фреймворк:** [Nuxt](https://nuxt.com/)
- **ИИ и Эмбеддинги:** [Vercel AI SDK](https://ai-sdk.dev/), [Pinecone](https://www.pinecone.io/)
- **API и Валидация:** [Zod](https://zod.dev/), [Zod-OpenAPI](https://www.npmjs.com/package/zod-openapi)
- **Хранилище файлов:** [Vercel Blob](https://vercel.com/docs/storage/vercel-blob)
- **БД и История чатов:** SQLite (через [NuxtHub](https://hub.nuxt.com/)), [Drizzle ORM](https://orm.drizzle.team/)
- **Кеширование и Rate Limits:** [Upstash Redis](https://upstash.com/)
- **Фоновые задачи:** [Inngest](https://www.inngest.com/)

### ⭐ Преимущества:

- **Поддержка локального ИИ:** Благодаря использованию универсального роутера, сервис имеет поддержку локальных ИИ моделей (Ollama, LM Studio и др.).
- **Эффективность:** Сервис имеет эффективное управление нагрузкой и состояниями, а также защиту от несанкционированного применения и перегрузки.
- **Быстрый старт:** Запуск и настройка проекта занимает несколько минут.
- **Отличный DX:** Проект хорошо структурирован, а код строго следует общепринятым принципам разработки.
- **Тестируемость:** Тестами покрыто больше 95% кода.

## ▶️ Демо

Демонстрационную версию можно найти по указанному в описании репозитория адресу.

## 🚀 Автоматический деплой

[![Деплой с Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fgeorgij-spiridonov%2Fsmart-book-search&env=AI_GATEWAY_API_KEY,PINECONE_API_KEY,PINECONE_INDEX,PINECONE_HOST,BOOKS_BLOB_READ_WRITE_TOKEN,KV_REST_API_URL,KV_REST_API_TOKEN,INNGEST_EVENT_KEY,INNGEST_SIGNING_KEY,TURSO_AUTH_TOKEN,TURSO_DATABASE_URL,NUXT_SESSION_PASSWORD,ADMIN_PASSWORD)

## ⚙️ Ручной деплой

### 1. Установка зависимостей

Убедитесь, что у вас установлен Node.js (рекомендуется v22+). Клонируйте репозиторий и установите зависимости:

```bash
npm install
```

### 2. Переменные окружения

Для работы приложения требуются сторонние сервисы (Pinecone, Vercel Blob, Upstash, Inngest и др.). Скопируйте файл конфигурации `.env.example` в `.env`:

```bash
cp .env.example .env
```

Затем заполните `.env` вашими актуальными ключами доступа или пропишите их в конфигурации сервера:

- **Vercel AI Gateway:** `AI_GATEWAY_API_KEY`
- **Pinecone:** `PINECONE_API_KEY`, `PINECONE_INDEX`, `PINECONE_HOST`
- **Vercel Blob:** `BOOKS_BLOB_READ_WRITE_TOKEN`
- **Upstash Redis:** `KV_REST_API_URL`, `KV_REST_API_TOKEN`
- **Inngest:** `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`
- **Turso Database:** `TURSO_AUTH_TOKEN`, `TURSO_DATABASE_URL`
- **Auth Utils:** `NUXT_SESSION_PASSWORD`

### 3. Запуск сервера для разработки

Запустите локальный сервер (по умолчанию доступен на `http://localhost:3000`):

```bash
npm run dev
```

## 🚀 Команды разработки

| Команда                      | Описание                                                 |
| :--------------------------- | :------------------------------------------------------- |
| `npm run dev`                | Запуск сервера разработки Nuxt                           |
| `npm run test`               | Запуск юнит-тестов (Vitest)                              |
| `npm run lint`               | Проверка кода линтером (ESLint)                          |
| `npm run typecheck`          | Проверка типов TypeScript                                |
| `npx inngest-cli@latest dev` | Запуск локального Inngest Dev Server (для фоновых задач) |

---

## 📖 API Эндпоинты и Документация

Проект автоматически генерирует подробную интерактивную документацию OpenAPI. Когда сервер запущен, документация и спецификации доступны по адресам:

- **Интерактивная документация API:** `/api/docs`
- **Спецификация OpenAPI (JSON):** `/api/openapi`

А также по соответствующим адресам production-среды.

В этих разделах вы найдёте описание форматов запросов и ответов для всех эндпоинтов сервиса.

## 📄 Лицензия

Проект распространяется под лицензией MIT. Подробности см. в файле [LICENSE](LICENSE).
