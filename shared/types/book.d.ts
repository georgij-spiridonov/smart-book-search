/**
 * Информация о процессе обработки книги (векторизации).
 */
export interface BookJob {
  /** Уникальный идентификатор задачи. */
  readonly id: string;
  /** Текущий статус обработки. */
  readonly status: "pending" | "processing" | "completed" | "failed";
  /** Прогресс выполнения задачи. */
  readonly progress: {
    /** Номер текущей обрабатываемой страницы. */
    readonly currentPage: number;
    /** Общее количество страниц в книге. */
    readonly totalPages: number;
    /** Количество уже обработанных фрагментов текста (chunks). */
    readonly chunksProcessed: number;
    /** Общее количество фрагментов текста для обработки. */
    readonly totalChunks: number;
  };
}

/**
 * Основная информация о книге в системе.
 */
export interface Book {
  /** Уникальный идентификатор книги (UUID). */
  readonly id: string;
  /** Идентификатор пользователя, загрузившего книгу. */
  readonly userId: string;
  /** Название книги. */
  readonly title: string;
  /** Автор книги. */
  readonly author: string;
  /** URL-адрес обложки книги. */
  readonly coverUrl: string;
  /** URL-адрес файла книги в хранилище (Blob). */
  readonly blobUrl: string;
  /** Оригинальное имя файла. */
  readonly filename: string;
  /** Размер файла в байтах. */
  readonly fileSize: number;
  /** Дата и время загрузки книги (ISO string). */
  readonly uploadedAt: string;
  /** Флаг, указывающий на то, была ли книга успешно векторизована для поиска. */
  readonly vectorized: boolean;
  /** Информация о текущей или последней задаче по обработке книги. */
  readonly job: BookJob | null;
}
