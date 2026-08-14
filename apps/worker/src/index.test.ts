import { describe, expect, it, vi } from "vitest";

import { createApp } from "./index";

const app = createApp({ clock: () => new Date("2026-08-13T16:00:00Z") });

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

  it("serves ranked fixture discovery through the versioned API", async () => {
    const response = await app.request(
      "/api/v1/events/search?city=New%20York&startDate=2026-08-14&endDate=2026-08-20&category=comedy&partySize=2&timePreference=evening&mode=fixture",
      { headers: { "x-scout-session": "fixture-contract" } },
      bindings,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        mode: "fixture",
        fallbackReason: null,
        events: [
          {
            id: "fixture-comedy",
            source: "fixture",
            classification: { genre: "Comedy" },
            scoreReasons: expect.any(Array),
          },
        ],
      },
    });
  });

  it("rejects invalid searches without calling a provider", async () => {
    const response = await app.request(
      "/api/v1/events/search?city=Boston&startDate=2026-08-14&endDate=2026-10-20",
      { headers: { "x-scout-session": "invalid-contract" } },
      bindings,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_SEARCH", issues: expect.any(Array) },
    });
  });

  it("rate limits repeated searches from the same browser session", async () => {
    const url =
      "/api/v1/events/search?city=New%20York&startDate=2026-08-14&endDate=2026-08-20&mode=fixture";
    const first = await app.request(
      url,
      { headers: { "x-scout-session": "rate-contract" } },
      bindings,
    );
    const repeated = await app.request(
      url,
      { headers: { "x-scout-session": "rate-contract" } },
      bindings,
    );

    expect(first.status).toBe(200);
    expect(repeated.status).toBe(429);
    await expect(repeated.json()).resolves.toMatchObject({
      error: { code: "SEARCH_RATE_LIMITED" },
    });
  });
});
