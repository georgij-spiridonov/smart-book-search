/**
 * Структурированный логгер для облачного развертывания (Vercel Runtime Logs).
 *
 * - **Production**: выводит JSON-строки для удобной фильтрации и интеграции с Log Drains.
 * - **Development**: выводит человекочитаемые цветные строки для удобства в терминале.
 *
 * Использование:
 *   import { logger } from '../utils/logger';
 *   logger.info('chat', 'Pipeline started', { queryLen: 42, bookIds: ['a','b'] });
 */

/** Доступные уровни логирования */
type LogLevel = "info" | "warn" | "error";

/** Структура записи лога */
interface LogEntry {
  /** ISO-метка времени */
  timestamp: string;
  /** Уровень логирования */
  level: LogLevel;
  /** Имя модуля или компонента */
  module: string;
  /** Текст сообщения */
  message: string;
  /** Дополнительные метаданные */
  [key: string]: unknown;
}

/** Флаг окружения продакшена */
const isProductionEnvironment = process.env.NODE_ENV === "production";

/**
 * Отправляет одну структурированную строку лога.
 * Оптимизировано для высокой скорости выполнения и минимального потребления памяти.
 */
function emitStructuredLog(
  level: LogLevel,
  module: string,
  message: string,
  extraData?: Record<string, unknown>,
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
    ...extraData,
  };

  if (isProductionEnvironment) {
    // Структурированный JSON — парсится Vercel Runtime Logs и Log Drains
    const logLine = JSON.stringify(entry);
    if (level === "error") {
      console.error(logLine);
    } else if (level === "warn") {
      console.warn(logLine);
    } else {
      console.log(logLine);
    }
  } else {
    // Человекочитаемый формат для локальной разработки
    const levelLabel = level.toUpperCase().padEnd(5);
    const logPrefix = `[${levelLabel}] [${module}]`;
    
    // Выбираем соответствующий метод консоли
    const consoleMethod = level === "error" 
      ? console.error 
      : level === "warn" 
        ? console.warn 
        : console.log;

    if (extraData && Object.keys(extraData).length > 0) {
      consoleMethod(logPrefix, message, extraData);
    } else {
      consoleMethod(logPrefix, message);
    }
  }
}

/**
 * Объект логгера для экспорта.
 * Предоставляет методы для различных уровней логирования.
 */
export const logger = {
  /** Информационное сообщение — нормальный ход выполнения. */
  info(module: string, message: string, extraData?: Record<string, unknown>): void {
    emitStructuredLog("info", module, message, extraData);
  },

  /** Предупреждение — неожиданная, но не критичная ситуация. */
  warn(module: string, message: string, extraData?: Record<string, unknown>): void {
    emitStructuredLog("warn", module, message, extraData);
  },

  /** Ошибка — сбой, требующий внимания разработчика. */
  error(module: string, message: string, extraData?: Record<string, unknown>): void {
    emitStructuredLog("error", module, message, extraData);
  },
} as const;

/** @deprecated Используйте `logger` вместо `log` */
export const log = logger;
