import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";

// Имитация (Mock) авто-импортов Nuxt
vi.hoisted(() => {
  (globalThis as any).defineEventHandler = vi.fn((handler: (event: H3Event) => Promise<any>) => handler);
  (globalThis as any).createError = vi.fn((errorData: { statusCode: number; message: string }) => {
    const error = new Error(errorData.message || "Ошибка сервера");
    (error as any).statusCode = errorData.statusCode;
    (error as any).message = errorData.message;
    return error;
  });
  (globalThis as any).getUserSession = vi.fn(async () => ({}));
  (globalThis as any).setUserSession = vi.fn(async () => {});
  (globalThis as any).readBody = vi.fn(async (event: any) => event._body);
});

import adminLoginHandler from "../api/admin/login.post";

// Имитация useRuntimeConfig
vi.stubGlobal("useRuntimeConfig", (_event?: H3Event) => ({
  adminPassword: "test-password",
}));

describe("API Входа Администратора (Admin Login API)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("должен вернуть ошибку при неверном пароле", async () => {
    const mockEvent = { _body: { password: "wrong-password" } } as unknown as H3Event;
    
    try {
      await adminLoginHandler(mockEvent);
      // Если выполнение дошло сюда, значит тест провален
      expect.fail("Обработчик должен был выбросить ошибку 401");
    } catch (error: any) {
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe("Неверный пароль");
    }
  });

  it("должен успешно авторизовать при верном пароле", async () => {
    const mockEvent = { _body: { password: "test-password" } } as unknown as H3Event;
    const response = await adminLoginHandler(mockEvent);
    
    expect(response.status).toBe("success");
    expect(response.message).toBe("Доступ администратора предоставлен");
    expect((globalThis as any).setUserSession).toHaveBeenCalledWith(mockEvent, expect.objectContaining({
      user: {
        id: expect.any(String),
        isAdmin: true,
      }
    }));
  });

  it("должен использовать существующий ID сессии, если он есть", async () => {
    (globalThis as any).getUserSession.mockResolvedValueOnce({ id: "existing-session-id" });
    vi.stubGlobal("useRuntimeConfig", () => ({ adminPassword: "test-password" }));
    
    const mockEvent = { _body: { password: "test-password" } } as unknown as H3Event;
    await adminLoginHandler(mockEvent);
    
    expect((globalThis as any).setUserSession).toHaveBeenCalledWith(mockEvent, expect.objectContaining({
      id: "existing-session-id",
    }));
  });

  it("должен вернуть ошибку 500, если пароль администратора не настроен", async () => {
    // Переопределяем конфигурацию для этого конкретного теста
    vi.stubGlobal("useRuntimeConfig", () => ({
      adminPassword: "",
    }));
    
    const mockEvent = { _body: { password: "any-password" } } as unknown as H3Event;
    
    try {
      await adminLoginHandler(mockEvent);
      expect.fail("Обработчик должен был выбросить ошибку 500");
    } catch (error: any) {
      expect(error.statusCode).toBe(500);
      expect(error.message).toBe("Пароль администратора не настроен на сервере");
    }
  });
});
