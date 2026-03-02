import { createHighlighter } from "shiki";
import type { HighlighterGeneric } from "shiki";
import { createJavaScriptRegexEngine } from "shiki/engine-javascript.mjs";

/**
 * Глобальный экземпляр хайлайтера и его обещание для реализации паттерна Одиночка (Singleton).
 * Используем HighlighterGeneric<any, any> для максимальной совместимости с shiki-stream.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let globalHighlighter: HighlighterGeneric<any, any> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let highlighterPromise: Promise<HighlighterGeneric<any, any>> | null = null;

/**
 * Список поддерживаемых языков для подсветки кода.
 */
const SUPPORTED_LANGUAGES = [
  "vue",
  "js",
  "ts",
  "css",
  "html",
  "json",
  "yaml",
  "markdown",
  "bash",
  "python",
];

/**
 * Темы оформления кода.
 */
const HIGHLIGHT_THEMES = ["material-theme-palenight", "material-theme-lighter"];

/**
 * Композабл для получения асинхронного экземпляра Shiki Highlighter.
 * Реализует отложенную инициализацию и повторное использование одного и того же экземпляра.
 * 
 * @returns Обещание с экземпляром Highlighter.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const useHighlighter = async (): Promise<HighlighterGeneric<any, any>> => {
  // Если инициализация еще не начиналась, запускаем её
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      langs: SUPPORTED_LANGUAGES,
      themes: HIGHLIGHT_THEMES,
      engine: createJavaScriptRegexEngine(),
    });
  }

  // Ожидаем завершения инициализации, если она не завершена
  if (!globalHighlighter) {
    globalHighlighter = await highlighterPromise;
  }

  return globalHighlighter;
};
