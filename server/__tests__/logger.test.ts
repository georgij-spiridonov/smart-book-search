import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Тестирование логгера (logger).
 * Нам необходимо протестировать ветки кода как для режима разработки (development),
 * так и для режима продакшена (production). Логгер проверяет `process.env.NODE_ENV`
 * во время загрузки модуля, поэтому мы используем vi.resetModules() и динамический импорт.
 */
describe("Сервис логирования (logger)", () => {
  let originalNodeEnvValue: string | undefined;

  beforeEach(() => {
    originalNodeEnvValue = process.env.NODE_ENV;
    vi.resetModules();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnvValue;
    vi.restoreAllMocks();
  });

  // ──────── Режим разработки (Development mode) ────────
  describe("Режим разработки (Development)", () => {
    let loggerInstance: typeof import("../utils/logger").log;

    beforeEach(async () => {
      process.env.NODE_ENV = "development";
      const loggerModule = await import("../utils/logger");
      loggerInstance = loggerModule.log;
    });

    it("log.info должен вызывать console.log с префиксом и сообщением", () => {
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      loggerInstance.info("test-module", "Информационное сообщение");

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const spyArguments = consoleLogSpy.mock.calls[0]!;
      expect(spyArguments[0]).toContain("[INFO ]");
      expect(spyArguments[0]).toContain("[test-module]");
      expect(spyArguments[1]).toBe("Информационное сообщение");
    });

    it("log.warn должен вызывать console.warn с префиксом и сообщением", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      loggerInstance.warn("test-module", "Предупреждение");

      expect(consoleWarnSpy).toHaveBeenCalledOnce();
      const spyArguments = consoleWarnSpy.mock.calls[0]!;
      expect(spyArguments[0]).toContain("[WARN ]");
      expect(spyArguments[0]).toContain("[test-module]");
      expect(spyArguments[1]).toBe("Предупреждение");
    });

    it("log.error должен вызывать console.error с префиксом и сообщением", () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      loggerInstance.error("test-module", "Ошибка");

      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      const spyArguments = consoleErrorSpy.mock.calls[0]!;
      expect(spyArguments[0]).toContain("[ERROR]");
      expect(spyArguments[0]).toContain("[test-module]");
      expect(spyArguments[1]).toBe("Ошибка");
    });

    it("log.info должен включать объект данных, если он предоставлен", () => {
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const additionalData = { key: "value", count: 42 };

      loggerInstance.info("mod", "сообщение с данными", additionalData);

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const spyArguments = consoleLogSpy.mock.calls[0]!;
      expect(spyArguments[2]).toEqual(additionalData);
    });

    it("log.info должен опускать аргумент данных, если они отсутствуют", () => {
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      loggerInstance.info("mod", "без данных");

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      // Должно быть только 2 аргумента: префикс и сообщение
      expect(consoleLogSpy.mock.calls[0]).toHaveLength(2);
    });
  });

  // ──────── Режим продакшена (Production mode) ────────
  describe("Режим продакшена (Production)", () => {
    let loggerInstance: typeof import("../utils/logger").log;

    beforeEach(async () => {
      process.env.NODE_ENV = "production";
      const loggerModule = await import("../utils/logger");
      loggerInstance = loggerModule.log;
    });

    it("log.info должен выводить структурированный JSON в console.log", () => {
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      loggerInstance.info("chat", "Запуск конвейера", { queryLen: 42 });

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const jsonOutput = consoleLogSpy.mock.calls[0]![0] as string;
      const parsedOutput = JSON.parse(jsonOutput);

      expect(parsedOutput.level).toBe("info");
      expect(parsedOutput.module).toBe("chat");
      expect(parsedOutput.message).toBe("Запуск конвейера");
      expect(parsedOutput.queryLen).toBe(42);
      expect(parsedOutput.timestamp).toBeDefined();
    });

    it("log.warn должен выводить структурированный JSON в console.warn", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      loggerInstance.warn("upload", "Файл слишком велик");

      expect(consoleWarnSpy).toHaveBeenCalledOnce();
      const parsedOutput = JSON.parse(consoleWarnSpy.mock.calls[0]![0] as string);
      expect(parsedOutput.level).toBe("warn");
      expect(parsedOutput.module).toBe("upload");
    });

    it("log.error должен выводить структурированный JSON в console.error", () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      loggerInstance.error("api", "Внутренняя ошибка сервера", { status: 500 });

      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      const parsedOutput = JSON.parse(consoleErrorSpy.mock.calls[0]![0] as string);
      expect(parsedOutput.level).toBe("error");
      expect(parsedOutput.module).toBe("api");
      expect(parsedOutput.status).toBe(500);
    });

    it("JSON в режиме продакшена должен включать ISO метку времени", () => {
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      loggerInstance.info("test", "проверка метки времени");

      const parsedOutput = JSON.parse(consoleLogSpy.mock.calls[0]![0] as string);
      // Должна быть валидная ISO строка даты
      expect(new Date(parsedOutput.timestamp).toISOString()).toBe(parsedOutput.timestamp);
    });
  });
});
