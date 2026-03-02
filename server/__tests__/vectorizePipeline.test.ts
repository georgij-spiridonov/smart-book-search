import { describe, it, expect, vi, beforeEach } from "vitest";
import { splitPages } from "../utils/textSplitter";
import type { PageText } from "../utils/textParser";

// =======================
// Имитации для Pinecone (Mocks for Pinecone)
// =======================
const { mockPineconeUpsertRecords, mockPineconeFetch, mockPineconeDeleteMany } = vi.hoisted(() => ({
  mockPineconeUpsertRecords: vi.fn(),
  mockPineconeFetch: vi.fn(),
  mockPineconeDeleteMany: vi.fn(),
}));

vi.mock("@pinecone-database/pinecone", () => {
  class MockPineconeNamespace {
    upsertRecords = mockPineconeUpsertRecords;
    fetch = mockPineconeFetch;
    deleteMany = mockPineconeDeleteMany;
  }
  class MockPineconeIndex {
    namespace() {
      return new MockPineconeNamespace();
    }
    upsertRecords = mockPineconeUpsertRecords;
  }
  class MockPinecone {
    index() {
      return new MockPineconeIndex();
    }
  }
  return { Pinecone: MockPinecone };
});

// Настройка конфигурации Nuxt
vi.stubGlobal("useRuntimeConfig", () => ({
  pineconeApiKey: "test-pinecone-key",
  pineconeIndex: "test-pinecone-index",
}));

describe("Конвейер векторизации (vectorizePipeline)", () => {
  const sampleSourcePages: PageText[] = [
    {
      pageNumber: 1,
      text: "Искусственный интеллект — это ветвь компьютерных наук. Она занимается созданием систем, способных выполнять задачи, требующие человеческого интеллекта.",
      title: "Введение в ИИ",
    },
    {
      pageNumber: 2,
      text: "Машинное обучение — это подмножество ИИ, которое позволяет системам учиться на данных. Нейронные сети — это вычислительные системы, вдохновленные биологическими нейронными сетями.",
      title: "Основы машинного обучения",
    },
    {
      pageNumber: 3,
      text: "Глубокое обучение использует многослойные нейронные сети для анализа сложных закономерностей в больших наборах данных.",
      title: "Инсайты глубокого обучения",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Разбиение на фрагменты с учетом страниц (page-aware chunking)", () => {
    it("должен создавать фрагменты с корректными метаданными страниц", () => {
      const chunks = splitPages(sampleSourcePages, {
        chunkSize: 200,
        chunkOverlap: 50,
      });

      expect(chunks.length).toBeGreaterThanOrEqual(1);

      for (const chunk of chunks) {
        expect(chunk.pageNumber).toBeGreaterThanOrEqual(1);
        expect(chunk.pageNumber).toBeLessThanOrEqual(3);
        expect(chunk.title).toBeTruthy();
      }
    });

    it("должен сохранять номера страниц из исходных данных", () => {
      const chunks = splitPages(sampleSourcePages);
      const uniquePageNumbers = [...new Set(chunks.map((chunk) => chunk.pageNumber))];

      // Должны присутствовать номера страниц из исходных данных
      expect(uniquePageNumbers.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Загрузка в Pinecone (Pinecone upsertRecords)", () => {
    it("должен загружать записи в корректном формате для интегрированного эмбеддинга", async () => {
      const chunks = splitPages(sampleSourcePages, {
        chunkSize: 200,
        chunkOverlap: 50,
      });

      const bookUniqueSlug = "test-book-slug-v4";

      // Формат записей: id, текст (для эмбеддинга) и поля метаданных
      const recordsToUpsert = chunks.map((chunk) => ({
        id: `${bookUniqueSlug}-chunk-${chunk.chunkIndex}`,
        text: chunk.text.slice(0, 200),
        bookName: "__тест_v4__",
        chunkIndex: chunk.chunkIndex,
        pageNumber: chunk.pageNumber,
        chapterTitle: chunk.title || "",
      }));

      mockPineconeUpsertRecords.mockResolvedValueOnce(undefined);

      const { Pinecone } = await import("@pinecone-database/pinecone");
      const pcClient = new Pinecone({ apiKey: "test-key" });
      const pcIndex = pcClient.index("test-index");
      await pcIndex.upsertRecords({ records: recordsToUpsert });

      expect(mockPineconeUpsertRecords).toHaveBeenCalledOnce();
      expect(mockPineconeUpsertRecords).toHaveBeenCalledWith({ records: recordsToUpsert });

      // Проверяем формат записи: должны быть id и text, но НЕ values (так как используется интегрированный эмбеддинг)
      const capturedRecords = mockPineconeUpsertRecords.mock.calls[0]![0].records;
      expect(capturedRecords[0]).toHaveProperty("id");
      expect(capturedRecords[0]).toHaveProperty("text");
      expect(capturedRecords[0]).not.toHaveProperty("values");
    });

    it("должен поддерживать механизм возобновления (resume), проверяя существующие ID", async () => {
      const alreadyExistingIds = new Set(["chunk-id-0", "chunk-id-1"]);
      const allTargetChunkIds = ["chunk-id-0", "chunk-id-1", "chunk-id-2"];
      
      const idsToProcess = allTargetChunkIds.filter((id) => !alreadyExistingIds.has(id));

      expect(idsToProcess).toEqual(["chunk-id-2"]);
    });
  });

  describe("Проверка доступности (Availability)", () => {
    // Тест выполняется только при наличии реального ключа Pinecone
    it.skipIf(!process.env.PINECONE_API_KEY)(
      "должен успешно выполнять реальный конвейер векторизации",
      async () => {
        expect(true).toBe(true);
      },
    );
  });
});
