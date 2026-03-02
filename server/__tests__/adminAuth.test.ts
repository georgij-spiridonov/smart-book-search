import { describe, it, expect, vi } from "vitest";

// Mock Nuxt auto-imports
vi.hoisted(() => {
  (globalThis as any).defineEventHandler = vi.fn((handler: any) => handler);
  (globalThis as any).createError = vi.fn((err: any) => {
    const error = new Error(err.statusMessage || "Error");
    (error as any).statusCode = err.statusCode;
    (error as any).statusMessage = err.statusMessage;
    return error;
  });
  (globalThis as any).getUserSession = vi.fn(async () => ({}));
  (globalThis as any).setUserSession = vi.fn(async () => {});
  (globalThis as any).readBody = vi.fn(async (event: any) => event._body);
});

import loginHandler from "../api/admin/login.post";

// Mocking useRuntimeConfig
vi.stubGlobal("useRuntimeConfig", (_event?: any) => ({
  adminPassword: "test-password",
}));

describe("Admin Login API", () => {
  it("should fail with incorrect password", async () => {
    const event = { _body: { password: "wrong-password" } } as any;
    
    try {
      await loginHandler(event);
      expect(true).toBe(false); // Should not reach here
    } catch (error: any) {
      expect(error.statusCode).toBe(401);
      expect(error.statusMessage).toBe("Invalid password");
    }
  });

  it("should succeed with correct password", async () => {
    const event = { _body: { password: "test-password" } } as any;
    const result = await loginHandler(event);
    
    expect(result.status).toBe("success");
    expect(result.message).toBe("Admin access granted");
  });

  it("should fail if admin password not configured", async () => {
    vi.stubGlobal("useRuntimeConfig", (_event?: any) => ({
      adminPassword: "",
    }));
    
    const event = { _body: { password: "any" } } as any;
    
    try {
      await loginHandler(event);
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.statusCode).toBe(500);
      expect(error.statusMessage).toBe("Admin password not configured on server");
    }
  });
});
