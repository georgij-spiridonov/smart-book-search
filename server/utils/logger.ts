/**
 * Structured logger for cloud deployment (Vercel Runtime Logs).
 *
 * - **Production**: outputs JSON lines for easy filtering and Log Drains integration.
 * - **Development**: outputs human-readable colored lines for terminal comfort.
 *
 * Usage:
 *   import { log } from '../utils/logger';
 *   log.info('chat', 'Pipeline started', { queryLen: 42, bookIds: ['a','b'] });
 */

type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  [key: string]: unknown;
}

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Emit a single structured log line.
 */
function emit(
  level: LogLevel,
  module: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
    ...data,
  };

  if (IS_PRODUCTION) {
    // Structured JSON — parsed by Vercel Runtime Logs & Log Drains
    const line = JSON.stringify(entry);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  } else {
    // Human-readable for local development
    const tag = level.toUpperCase().padEnd(5);
    const prefix = `[${tag}] [${module}]`;
    const fn =
      level === "error"
        ? console.error
        : level === "warn"
          ? console.warn
          : console.log;
    if (data && Object.keys(data).length > 0) {
      fn(prefix, message, data);
    } else {
      fn(prefix, message);
    }
  }
}

export const log = {
  /** Informational message — normal operation flow. */
  info(module: string, message: string, data?: Record<string, unknown>): void {
    emit("info", module, message, data);
  },

  /** Warning — unexpected but recoverable situation. */
  warn(module: string, message: string, data?: Record<string, unknown>): void {
    emit("warn", module, message, data);
  },

  /** Error — something failed and needs attention. */
  error(module: string, message: string, data?: Record<string, unknown>): void {
    emit("error", module, message, data);
  },
};
