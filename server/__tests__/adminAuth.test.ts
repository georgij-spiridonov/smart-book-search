import { describe, it, expect, vi } from "vitest";
import { defineEventHandler } from "h3";
import loginHandler from "../api/admin/login.post";

// Mocking Nuxt Auth Utils
vi.mock("nuxt-auth-utils", () => ({
  getUserSession: vi.fn(async () => ({})),
  setUserSession: vi.fn(async () => {}),
}));

// Mocking useRuntimeConfig
vi.stubGlobal("useRuntimeConfig", (event?: any) => ({
  adminPassword: "test-password",
}));

// Mocking readBody
vi.stubGlobal("readBody", async (event: any) => event._body);

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
    vi.stubGlobal("useRuntimeConfig", (event?: any) => ({
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
