import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We need to test both production and development branches of the logger.
// The logger checks `process.env.NODE_ENV === "production"` at module load time
// (const IS_PRODUCTION), so we use vi.resetModules() + dynamic import.

describe("logger", () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    vi.resetModules();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  // ──────── Development mode (default) ────────
  describe("development mode", () => {
    let log: typeof import("../utils/logger").log;

    beforeEach(async () => {
      process.env.NODE_ENV = "development";
      const mod = await import("../utils/logger");
      log = mod.log;
    });

    it("log.info calls console.log with prefix and message", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});

      log.info("test-module", "Hello info");

      expect(spy).toHaveBeenCalledOnce();
      const args = spy.mock.calls[0]!;
      expect(args[0]).toContain("[INFO ]");
      expect(args[0]).toContain("[test-module]");
      expect(args[1]).toBe("Hello info");
    });

    it("log.warn calls console.warn with prefix and message", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

      log.warn("test-module", "Hello warn");

      expect(spy).toHaveBeenCalledOnce();
      const args = spy.mock.calls[0]!;
      expect(args[0]).toContain("[WARN ]");
      expect(args[0]).toContain("[test-module]");
      expect(args[1]).toBe("Hello warn");
    });

    it("log.error calls console.error with prefix and message", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      log.error("test-module", "Hello error");

      expect(spy).toHaveBeenCalledOnce();
      const args = spy.mock.calls[0]!;
      expect(args[0]).toContain("[ERROR]");
      expect(args[0]).toContain("[test-module]");
      expect(args[1]).toBe("Hello error");
    });

    it("log.info includes data object when provided", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});

      log.info("mod", "with data", { key: "value", count: 42 });

      expect(spy).toHaveBeenCalledOnce();
      const args = spy.mock.calls[0]!;
      expect(args[2]).toEqual({ key: "value", count: 42 });
    });

    it("log.info omits data argument when data is empty", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});

      log.info("mod", "no data");

      expect(spy).toHaveBeenCalledOnce();
      // Should only have prefix and message, no third argument
      expect(spy.mock.calls[0]).toHaveLength(2);
    });
  });

  // ──────── Production mode ────────
  describe("production mode", () => {
    let log: typeof import("../utils/logger").log;

    beforeEach(async () => {
      process.env.NODE_ENV = "production";
      const mod = await import("../utils/logger");
      log = mod.log;
    });

    it("log.info outputs structured JSON to console.log", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});

      log.info("chat", "Pipeline started", { queryLen: 42 });

      expect(spy).toHaveBeenCalledOnce();
      const jsonLine = spy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(jsonLine);

      expect(parsed.level).toBe("info");
      expect(parsed.module).toBe("chat");
      expect(parsed.message).toBe("Pipeline started");
      expect(parsed.queryLen).toBe(42);
      expect(parsed.timestamp).toBeDefined();
    });

    it("log.warn outputs structured JSON to console.warn", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

      log.warn("upload", "File too large");

      expect(spy).toHaveBeenCalledOnce();
      const parsed = JSON.parse(spy.mock.calls[0]![0] as string);
      expect(parsed.level).toBe("warn");
      expect(parsed.module).toBe("upload");
    });

    it("log.error outputs structured JSON to console.error", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      log.error("api", "Internal server error", { status: 500 });

      expect(spy).toHaveBeenCalledOnce();
      const parsed = JSON.parse(spy.mock.calls[0]![0] as string);
      expect(parsed.level).toBe("error");
      expect(parsed.module).toBe("api");
      expect(parsed.status).toBe(500);
    });

    it("production JSON includes ISO timestamp", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});

      log.info("test", "timestamp check");

      const parsed = JSON.parse(spy.mock.calls[0]![0] as string);
      // Should be a valid ISO date string
      expect(new Date(parsed.timestamp).toISOString()).toBe(parsed.timestamp);
    });
  });
});
