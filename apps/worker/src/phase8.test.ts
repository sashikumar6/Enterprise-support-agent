import { describe, expect, it, vi } from "vitest";
import type {
  OperationsRecorder,
  OperationsRepository,
  OperationsSummary,
  OperationsTimelineItem,
} from "@scout/core";

import { createApp } from "./index";

const TOKEN = "phase8-test-token-that-is-long-enough";
const NOW = new Date("2026-08-14T18:00:00.000Z");
const summary: OperationsSummary = {
  counts: {
    reservations: 2,
    checkouts: 1,
    paymentEvents: 2,
    auditEvents: 4,
    toolInvocations: 3,
    providerHealthEvents: 3,
  },
  reservationStates: { draft: 1, confirmed: 1 },
  recentActivityAt: "2026-08-14T17:59:00.000Z",
};
const timeline: OperationsTimelineItem[] = [
  {
    id: "tool-1",
    kind: "tool",
    occurredAt: "2026-08-14T17:59:00.000Z",
    correlationId: "request:phase8-1",
    label: "search_events",
    status: "degraded",
    subject: "ticketmaster",
    durationMs: 41,
    failureCategory: "rate_limited",
    details: { requestedMode: "live", providerMode: "fixture" },
  },
];

class MemoryOperations implements OperationsRepository, OperationsRecorder {
  tools: Parameters<OperationsRecorder["recordTool"]>[0][] = [];
  providers: Parameters<OperationsRecorder["recordProvider"]>[0][] = [];

  async summary() {
    return summary;
  }

  async timeline(input: { correlationId: string | null; limit: number }) {
    return timeline
      .filter(
        (item) =>
          input.correlationId === null ||
          item.correlationId === input.correlationId,
      )
      .slice(0, input.limit);
  }

  async recordTool(input: Parameters<OperationsRecorder["recordTool"]>[0]) {
    this.tools.push(input);
  }

  async recordProvider(
    input: Parameters<OperationsRecorder["recordProvider"]>[0],
  ) {
    this.providers.push(input);
  }
}

const operations = new MemoryOperations();
const app = createApp({
  operationsRepository: operations,
  operationsRecorder: operations,
  clock: () => NOW,
});
const bindings = {
  APP_ENV: "test",
  DB: {} as D1Database,
  ASSETS: {} as Fetcher,
  OPS_ACCESS_TOKEN: TOKEN,
};

async function authenticatedCookie() {
  const response = await app.request(
    "/api/v1/ops/session",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessToken: TOKEN }),
    },
    bindings,
  );
  expect(response.status).toBe(200);
  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie).toContain("SameSite=Strict");
  expect(setCookie).not.toContain(TOKEN);
  return setCookie?.split(";")[0] ?? "";
}

describe("Phase 8 operations authorization", () => {
  it("rejects missing and invalid operator credentials without leaking data", async () => {
    const missing = await app.request("/api/v1/ops/summary", {}, bindings);
    expect(missing.status).toBe(401);
    await expect(missing.json()).resolves.toMatchObject({
      error: { code: "OPS_UNAUTHORIZED" },
    });

    const invalid = await app.request(
      "/api/v1/ops/session",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessToken: "wrong" }),
      },
      bindings,
    );
    expect(invalid.status).toBe(401);
    expect(await invalid.text()).not.toContain(TOKEN);
  });

  it("fails closed when operator access is not configured", async () => {
    const response = await app.request(
      "/api/v1/ops/session",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessToken: TOKEN }),
      },
      { ...bindings, OPS_ACCESS_TOKEN: undefined },
    );
    expect(response.status).toBe(503);
  });
});

describe("Phase 8 operations reads", () => {
  it("returns a populated summary only with a signed session", async () => {
    const response = await app.request(
      "/api/v1/ops/summary",
      { headers: { cookie: await authenticatedCookie() } },
      bindings,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: summary });
  });

  it("filters the timeline by a validated correlation ID", async () => {
    const cookie = await authenticatedCookie();
    const matched = await app.request(
      "/api/v1/ops/timeline?correlationId=request%3Aphase8-1&limit=10",
      { headers: { cookie } },
      bindings,
    );
    await expect(matched.json()).resolves.toMatchObject({
      data: [expect.objectContaining({ label: "search_events" })],
      redacted: true,
    });
    const unknown = await app.request(
      "/api/v1/ops/timeline?correlationId=request%3Aunknown",
      { headers: { cookie } },
      bindings,
    );
    await expect(unknown.json()).resolves.toMatchObject({ data: [] });
  });

  it("rejects malformed timeline filters", async () => {
    const response = await app.request(
      "/api/v1/ops/timeline?correlationId=not%20safe",
      { headers: { cookie: await authenticatedCookie() } },
      bindings,
    );
    expect(response.status).toBe(400);
  });

  it("records safe search metadata and degraded provider state", async () => {
    operations.tools = [];
    operations.providers = [];
    const fetcher = vi.fn(async () => new Response("busy", { status: 429 }));
    const recordedApp = createApp({
      operationsRecorder: operations,
      fetcher,
      clock: () => NOW,
    });
    const response = await recordedApp.request(
      "/api/v1/events/search?city=New%20York&startDate=2026-08-14&endDate=2026-08-21&category=all&partySize=2&timePreference=any&mode=live",
      { headers: { "x-request-id": "request:degraded" } },
      { ...bindings, TICKETMASTER_API_KEY: "provider-key-not-recorded" },
    );
    expect(response.status).toBe(200);
    expect(operations.tools).toEqual([
      expect.objectContaining({
        name: "search_events",
        status: "degraded",
        correlationId: "request:degraded",
      }),
    ]);
    expect(operations.providers).toEqual([
      expect.objectContaining({ provider: "ticketmaster", status: "degraded" }),
    ]);
    expect(JSON.stringify(operations)).not.toContain(
      "provider-key-not-recorded",
    );
  });
});
