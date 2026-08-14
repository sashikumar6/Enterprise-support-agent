import { describe, expect, it, vi } from "vitest";

import { app } from "./index";

const database = {
  prepare: vi.fn(() => ({ first: vi.fn(async () => ({ ready: 1 })) })),
} as unknown as D1Database;

const bindings = {
  APP_ENV: "test",
  DB: database,
  ASSETS: { fetch: vi.fn() } as unknown as Fetcher,
};

describe("Scout API foundation", () => {
  it("returns health with a correlation ID", async () => {
    const response = await app.request(
      "/api/v1/health",
      { headers: { "x-request-id": "test-request-1" } },
      bindings,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("test-request-1");
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      service: "scout",
      requestId: "test-request-1",
    });
  });

  it("checks the database before reporting ready", async () => {
    const response = await app.request("/api/v1/readiness", {}, bindings);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ready",
      checks: { environment: "ok", database: "ok" },
    });
  });

  it("returns a structured error for unknown API routes", async () => {
    const response = await app.request("/api/v1/missing", {}, bindings);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND" },
    });
  });
});
