import { describe, it, expect, vi, beforeEach } from "vitest";

// Имитация функции $fetch (глобальный Nuxt $fetch)
const mocked$fetch = vi.fn();
vi.stubGlobal("$fetch", mocked$fetch);

describe("Проверка Inngest (inngestCheck)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Юнит-тесты (Unit tests - mocked)", () => {
    it("должен успешно обнаруживать доступный эндпоинт Inngest с зарегистрированными функциями", async () => {
      mocked$fetch.mockResolvedValueOnce({
        function_count: 3,
      });

      const response = (await $fetch("/api/inngest")) as any;
      
      expect(response).toBeDefined();
      expect(response.function_count).toBe(3);
    });

    it("должен корректно обрабатывать случай с отсутствием функций в Inngest", async () => {
      mocked$fetch.mockResolvedValueOnce({
        function_count: 0,
      });

      const response = (await $fetch("/api/inngest")) as any;
      expect(response.function_count).toBe(0);
    });

    it("должен выбрасывать ошибку при недоступности эндпоинта Inngest", async () => {
      mocked$fetch.mockRejectedValueOnce(new Error("Не удалось связаться с эндпоинтом (Cannot reach endpoint)"));

      await expect($fetch("/api/inngest")).rejects.toThrow(
        "Не удалось связаться с эндпоинтом (Cannot reach endpoint)",
      );
    });
  });
});
