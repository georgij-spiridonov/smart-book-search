/**
 * Хранилище состояния задач в Redis для асинхронной векторизации.
 * 
 * Отслеживает прогресс выполнения задач, позволяя клиентам
 * опрашивать состояние через эндпоинт GET /api/books/jobs/:id.
 */

import { getRedisClient } from "./redis";
import { logger } from "./logger";

/** Прогресс выполнения задачи векторизации */
export interface JobProgress {
  /** Номер текущей обрабатываемой страницы */
  currentPage: number;
  /** Общее количество страниц в книге */
  totalPages: number;
  /** Количество успешно обработанных фрагментов текста */
  chunksProcessed: number;
  /** Общее количество фрагментов текста */
  totalChunks: number;
}

/** Состояние задачи векторизации */
export interface JobState {
  /** Уникальный идентификатор задачи */
  id: string;
  /** ID книги в базе данных */
  bookId: string;
  /** Название книги */
  bookName: string;
  /** ID пользователя, запустившего задачу */
  userId: string;
  /** Текущий статус задачи */
  status: "pending" | "processing" | "completed" | "failed";
  /** Текущий прогресс выполнения */
  progress: JobProgress;
  /** Результат выполнения (доступен после завершения) */
  result?: {
    totalPages: number;
    totalChunks: number;
    skipped: number;
    newVectors: number;
  };
  /** Сообщение об ошибке (если статус "failed") */
  error?: string;
  /** Время создания (timestamp) */
  createdAt: number;
  /** Время последнего обновления (timestamp) */
  updatedAt: number;
}

/** Префикс для ключей деталей задачи в Redis */
const REDIS_KEY_JOB_DETAILS = "smart-book-search:jobs:";
/** Префикс для набора ID задач пользователя в Redis */
const REDIS_KEY_USER_JOB_IDS = "smart-book-search:user-jobs:";
/** Максимальный срок хранения задачи — 1 час (3600 секунд) */
const JOB_RETENTION_SECONDS = 60 * 60;

/** Формирует ключ для деталей конкретной задачи */
function formatJobDetailsKey(id: string): string {
  return `${REDIS_KEY_JOB_DETAILS}${id}`;
}

/** Формирует ключ для списка задач конкретного пользователя */
function formatUserJobsKey(userId: string): string {
  return `${REDIS_KEY_USER_JOB_IDS}${userId}`;
}

/**
 * Создает новую задачу векторизации и сохраняет её в Redis.
 */
export async function createJob(
  id: string,
  bookId: string,
  bookName: string,
  userId: string,
): Promise<JobState> {
  const redisClient = getRedisClient();
  const jobKey = formatJobDetailsKey(id);
  const userJobsKey = formatUserJobsKey(userId);

  const initialJobState: JobState = {
    id,
    bookId,
    bookName,
    userId,
    status: "pending",
    progress: {
      currentPage: 0,
      totalPages: 0,
      chunksProcessed: 0,
      totalChunks: 0,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Используем конвейер (pipeline) для атомарности и скорости
  const redisPipeline = redisClient.pipeline();
  
  // Сохраняем поля задачи (сложные объекты сериализуем в JSON)
  redisPipeline.hset(jobKey, {
    ...initialJobState,
    progress: JSON.stringify(initialJobState.progress),
  });
  
  // Устанавливаем TTL для автоматической очистки
  redisPipeline.expire(jobKey, JOB_RETENTION_SECONDS);
  
  // Добавляем ID задачи в список задач пользователя
  redisPipeline.sadd(userJobsKey, id);
  redisPipeline.expire(userJobsKey, JOB_RETENTION_SECONDS);
  
  await redisPipeline.exec();

  logger.info("job-store", "Created new vectorization job", {
    jobId: id,
    bookName,
  });

  return initialJobState;
}

/**
 * Возвращает список всех задач указанного пользователя.
 */
export async function getUserJobs(userId: string): Promise<JobState[]> {
  const redisClient = getRedisClient();
  const userJobsKey = formatUserJobsKey(userId);
  const jobIds = await redisClient.smembers<string[]>(userJobsKey);

  if (!jobIds || jobIds.length === 0) {
    return [];
  }

  const foundJobs: JobState[] = [];
  const redisPipeline = redisClient.pipeline();
  
  for (const id of jobIds) {
    redisPipeline.hgetall(formatJobDetailsKey(id));
  }

  const pipelineResults = await redisPipeline.exec<(Record<string, unknown> | null)[]>();

  for (let i = 0; i < pipelineResults.length; i++) {
    const rawData = pipelineResults[i];
    
    if (rawData && Object.keys(rawData).length > 0) {
      const jobState = rawData as unknown as JobState;
      
      // Парсим JSON-поля, если они представлены строками
      if (typeof rawData.progress === "string") {
        jobState.progress = JSON.parse(rawData.progress);
      }
      if (typeof rawData.result === "string") {
        jobState.result = JSON.parse(rawData.result);
      }
      
      // Гарантируем числовой тип для временных меток
      jobState.createdAt = Number(jobState.createdAt);
      jobState.updatedAt = Number(jobState.updatedAt);
      
      foundJobs.push(jobState);
    } else {
      // Удаляем "битые" ID из списка пользователя, если сама задача уже удалена/истекла
      await redisClient.srem(userJobsKey, jobIds[i]);
    }
  }

  return foundJobs;
}

/**
 * Возвращает детальную информацию о конкретной задаче по её ID.
 */
export async function getJob(id: string): Promise<JobState | undefined> {
  const redisClient = getRedisClient();
  const jobKey = formatJobDetailsKey(id);
  const rawData = await redisClient.hgetall(jobKey);

  if (!rawData || Object.keys(rawData).length === 0) {
    return undefined;
  }

  const jobState = rawData as unknown as JobState;
  
  if (typeof rawData.progress === "string") {
    jobState.progress = JSON.parse(rawData.progress);
  }
  if (typeof rawData.result === "string") {
    jobState.result = JSON.parse(rawData.result);
  }

  jobState.createdAt = Number(jobState.createdAt);
  jobState.updatedAt = Number(jobState.updatedAt);

  return jobState;
}

/**
 * Обновляет состояние существующей задачи в Redis.
 */
export async function updateJob(
  id: string,
  updateData: Partial<JobState>,
): Promise<void> {
  const redisClient = getRedisClient();
  const jobKey = formatJobDetailsKey(id);

  const fieldsToSet: Record<string, string | number> = {};

  // Формируем объект для hset, сериализуя сложные структуры
  for (const [field, value] of Object.entries(updateData)) {
    if (value === undefined) {
      continue;
    }

    if (field === "progress" || field === "result") {
      fieldsToSet[field] = JSON.stringify(value);
    } else if (typeof value === "string" || typeof value === "number") {
      fieldsToSet[field] = value;
    }
  }

  fieldsToSet.updatedAt = Date.now();

  try {
    await redisClient.hset(jobKey, fieldsToSet);
    // Обновляем время жизни ключа при каждом изменении
    await redisClient.expire(jobKey, JOB_RETENTION_SECONDS);

    if (updateData.status) {
      logger.info("job-store", "Updated vectorization job status", {
        jobId: id,
        status: updateData.status,
      });
    }
  } catch (err) {
    logger.error("job-store", "Error updating job progress", {
      jobId: id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Генерирует уникальный ID для новой задачи.
 */
export function generateJobId(): string {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `job-${timestamp}-${randomSuffix}`;
}
