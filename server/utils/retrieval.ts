import { Pinecone } from "@pinecone-database/pinecone";
import { generateText } from "ai";
import { CHAT_CONFIG, type ChatMessage } from "./chatConfig";
import { logger } from "./logger";

/**
 * Минимальный порог косинусного сходства для признания фрагмента релевантным.
 */
const MIN_SIMILARITY_SCORE = 0.3;

export interface BookKnowledgeChunk {
  text: string;
  pageNumber: number;
  chapterTitle: string;
  score: number;
  bookId: string;
}

/**
 * Генерирует поисковые запросы на основе вопроса пользователя и контекста беседы.
 * 
 * @param {string} userQuestion Текущий вопрос пользователя.
 * @param {string} bookMetadata Информация о книгах для контекста.
 * @param {ChatMessage[]} chatHistory История сообщений.
 * @returns {Promise<string[]>} Список сгенерированных запросов.
 */
export async function generateSearchQueries(
  userQuestion: string,
  bookMetadata: string,
  chatHistory: ChatMessage[] = [],
): Promise<string[]> {
  logger.info("retrieval", "Generating search queries", { 
    userQuestion, 
    bookMetadata 
  });

  // Берем только последние сообщения из истории для экономии контекста
  const recentMessages = chatHistory.slice(-CHAT_CONFIG.maxHistoryMessages);
  const formattedHistory = recentMessages
    .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join("\n");

  const promptParts = [
    bookMetadata ? `Context: Information about the book(s): ${bookMetadata}` : "",
    formattedHistory ? `Conversation History:\n${formattedHistory}` : "",
    `User Question: ${userQuestion}`,
    "\nGenerate 3-5 search queries in the same language as the question.",
  ];

  const fullPrompt = promptParts.filter(Boolean).join("\n\n");

  const { text: aiResponseText } = await generateText({
    model: CHAT_CONFIG.queryModel,
    system: CHAT_CONFIG.querySystemPrompt,
    prompt: fullPrompt,
  });

  try {
    // Пытаемся извлечь массив JSON из ответа модели
    const jsonMatch = aiResponseText.match(/\[.*\]/s);
    if (jsonMatch) {
      const jsonContent = jsonMatch[0];
      try {
        const parsedQueries = JSON.parse(jsonContent) as string[];
        if (Array.isArray(parsedQueries) && parsedQueries.length > 0) {
          logger.info("retrieval", "Queries generated successfully", { queries: parsedQueries });
          return parsedQueries;
        }
      } catch {
        /**
         * Запасной вариант: некоторые модели могут использовать одинарные кавычки в JSON.
         * Пытаемся заменить их на двойные для корректного парсинга.
         */
        const fixedJson = jsonContent.replace(/'/g, '"');
        const parsedQueries = JSON.parse(fixedJson) as string[];
        if (Array.isArray(parsedQueries) && parsedQueries.length > 0) {
          logger.info("retrieval", "Queries generated successfully (after fix)", {
            queries: parsedQueries,
          });
          return parsedQueries;
        }
      }
    }
  } catch (error) {
    logger.error("retrieval", "Failed to parse generated queries", {
      error: error instanceof Error ? error.message : String(error),
      rawResponse: aiResponseText,
    });
  }

  // Если не удалось сгенерировать — возвращаем исходный вопрос пользователя
  logger.warn("retrieval", "Falling back to original query", { userQuestion });
  return [userQuestion];
}

/**
 * Выполняет поиск релевантных фрагментов книг в векторной базе Pinecone.
 * 
 * @param {string | string[]} searchQueries Запросы для поиска.
 * @param {string[]} bookIds Список ID книг, по которым ведется поиск.
 * @param {number} resultsLimit Лимит количества фрагментов.
 * @returns {Promise<Array<{ text: string, pageNumber: number, chapterTitle: string, score: number, bookId: string }>>}
 */
export async function searchBookKnowledge(
  searchQueries: string | string[],
  bookIds: string[],
  resultsLimit = 5,
): Promise<BookKnowledgeChunk[]> {
  const runtimeConfig = useRuntimeConfig();
  const queriesArray = Array.isArray(searchQueries) ? searchQueries : [searchQueries];

  logger.info("retrieval", "Starting knowledge search", {
    queriesCount: queriesArray.length,
    bookIdsCount: bookIds?.length || 0,
    resultsLimit,
  });

  const pineconeClient = new Pinecone({
    apiKey: runtimeConfig.pineconeApiKey,
  });
  const vectorIndex = pineconeClient.index(runtimeConfig.pineconeIndex);

  // 1. Выполняем поиск по всем запросам параллельно с логикой повторных попыток
  const allSearchResults = await fetchPineconeResults(
    vectorIndex,
    queriesArray,
    bookIds,
    resultsLimit,
  );

  // 2. Слияние результатов, дедупликация, фильтрация и сортировка
  const sortedChunks = deduplicateAndSortResults(allSearchResults);
  const finalRelevantChunks = sortedChunks.slice(0, resultsLimit * 2);

  logger.info("retrieval", "Search and reranking completed", {
    totalUniqueMatches: sortedChunks.length,
    returnedCount: finalRelevantChunks.length,
    bestScore: finalRelevantChunks[0]?.score,
  });

  return finalRelevantChunks;
}

/**
 * Выполняет поиск в Pinecone с логикой повторных попыток.
 */
async function fetchPineconeResults(
  vectorIndex: any,
  queriesArray: string[],
  bookIds: string[],
  resultsLimit: number,
) {
  const searchTasks = queriesArray.map((queryText) => {
    const executeQueryWithRetry = async (
      currentAttempt = 1,
    ): Promise<{
      result?: {
        hits?: Array<{ _score?: number; fields?: Record<string, unknown> }>;
      };
    } | null> => {
      try {
        return (await vectorIndex.searchRecords({
          query: {
            topK: resultsLimit,
            inputs: { text: queryText },
            filter: {
              bookId: { $in: bookIds },
            },
          },
        })) as {
          result?: {
            hits?: Array<{ _score?: number; fields?: Record<string, unknown> }>;
          };
        };
      } catch (err) {
        if (currentAttempt < 3) {
          logger.warn("retrieval", "Pinecone search retry", {
            query: queryText,
            attempt: currentAttempt,
            error: err instanceof Error ? err.message : String(err),
          });
          // Экспоненциальная задержка перед повтором
          await new Promise((resolve) => setTimeout(resolve, 500 * currentAttempt));
          return executeQueryWithRetry(currentAttempt + 1);
        }
        logger.error("retrieval", "Pinecone search error after retries", {
          query: queryText,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
    };
    return executeQueryWithRetry();
  });

  return Promise.all(searchTasks);
}

/**
 * Обрабатывает результаты поиска: дедупликация, фильтрация и сортировка.
 */
function deduplicateAndSortResults(
  allSearchResults: Array<{
    result?: {
      hits?: Array<{ _score?: number; fields?: Record<string, unknown> }>;
    };
  } | null>,
): BookKnowledgeChunk[] {
  const uniqueChunksMap = new Map<string, BookKnowledgeChunk>();

  for (const searchResponse of allSearchResults) {
    if (!searchResponse?.result?.hits) {
      continue;
    }

    for (const matchHit of searchResponse.result.hits) {
      const matchScore = matchHit._score ?? 0;
      if (matchScore < MIN_SIMILARITY_SCORE) {
        continue;
      }

      const hitFields = (matchHit.fields ?? {}) as Record<string, unknown>;
      const contentText = (hitFields.text as string) || "";

      const alreadyFound = uniqueChunksMap.get(contentText);
      if (!alreadyFound || alreadyFound.score < matchScore) {
        uniqueChunksMap.set(contentText, {
          text: contentText,
          pageNumber: (hitFields.pageNumber as number) || 0,
          chapterTitle: (hitFields.chapterTitle as string) || "",
          score: matchScore,
          bookId: (hitFields.bookId as string) || "",
        });
      }
    }
  }

  return Array.from(uniqueChunksMap.values()).sort((a, b) => b.score - a.score);
}
