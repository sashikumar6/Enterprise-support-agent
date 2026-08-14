import { describe, expect, it, vi } from "vitest";
import type {
  CheckoutLaunch,
  CommerceRepository,
  CreateDraftPlan,
  PaymentProvider,
  PaymentWebhookEvent,
  PlanRepository,
  SavedPlan,
  StartCheckout,
  StartCancellation,
} from "@scout/core";
import { PaymentProviderError } from "@scout/core";

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

class MemoryPlanRepository implements PlanRepository {
  private readonly plans: Array<
    SavedPlan & { ownerSessionId: string; key: string }
  > = [];

  async createDraft(command: CreateDraftPlan) {
    const existing = this.plans.find(
      (plan) =>
        plan.ownerSessionId === command.ownerSessionId &&
        plan.key === command.idempotencyKey,
    );
    if (existing) return { plan: existing, replayed: true };
    const plan = {
      id: `plan-${this.plans.length + 1}`,
      state: "draft" as const,
      version: 0,
      createdAt: "2026-08-13T16:00:00.000Z",
      updatedAt: "2026-08-13T16:00:00.000Z",
      event: command.event,
      checkout: null,
      ownerSessionId: command.ownerSessionId,
      key: command.idempotencyKey,
    };
    this.plans.push(plan);
    return { plan, replayed: false };
  }

  async listForOwner(ownerSessionId: string) {
    return this.plans.filter((plan) => plan.ownerSessionId === ownerSessionId);
  }
}

const planRepository = new MemoryPlanRepository();
const planApp = createApp({
  clock: () => new Date("2026-08-13T16:00:00Z"),
  planRepository,
  resolveSession: async (context) =>
    context.req.header("x-test-owner") || "guest-a",
});

const normalizedEvent = {
  id: "fixture-comedy",
  source: "fixture" as const,
  name: "Friday Night Comedy — Demo Event",
  startsAt: "2026-08-14T20:00:00Z",
  localDate: "2026-08-14",
  localTime: "20:00:00",
  timezone: "America/New_York",
  venue: { name: "Demo Hall", city: "New York", stateCode: "NY" },
  providerUrl: "https://example.com/events/fixture-comedy",
  observedAt: "2026-08-13T16:00:00Z",
  status: "onsale",
  classification: {
    segment: "Arts & Theatre",
    genre: "Comedy",
    subGenre: null,
  },
  image: null,
  price: { minimum: 25, maximum: 45, currency: "USD" },
  score: 88,
  scoreReasons: ["Matches comedy", "Fits evening preference"],
};

class MemoryCommerceRepository implements CommerceRepository {
  launch: CheckoutLaunch | null = null;

  async findCheckoutCandidate(ownerSessionId: string, reservationId: string) {
    if (ownerSessionId !== "guest-a" || reservationId !== "plan-1") return null;
    return {
      reservationId,
      reservationVersion: 0,
      eventName: normalizedEvent.name,
    };
  }

  async findCheckoutLaunch(
    ownerSessionId: string,
    reservationId: string,
    idempotencyKey: string,
  ) {
    return ownerSessionId === "guest-a" &&
      reservationId === "plan-1" &&
      idempotencyKey === "pay-1"
      ? this.launch
      : null;
  }

  async startCheckout(command: StartCheckout) {
    this.launch = {
      id: command.id,
      reservationId: command.reservationId,
      state: "pending",
      refundState: "not_requested",
      amountMinor: 100,
      currency: "usd",
      completedAt: null,
      providerPaymentId: null,
      redirectUrl: command.redirectUrl,
    };
    return this.launch;
  }

  async processPaymentEvent(
    _event: PaymentWebhookEvent,
    _correlationId: string,
  ): Promise<"applied" | "replayed" | "rejected"> {
    void [_event, _correlationId];
    return "applied" as const;
  }

  async findCancellationCandidate(
    _ownerSessionId: string,
    _reservationId: string,
  ): ReturnType<CommerceRepository["findCancellationCandidate"]> {
    void [_ownerSessionId, _reservationId];
    return null;
  }

  async findCancellation(
    _ownerSessionId: string,
    _reservationId: string,
    _idempotencyKey: string,
  ): ReturnType<CommerceRepository["findCancellation"]> {
    void [_ownerSessionId, _reservationId, _idempotencyKey];
    return null;
  }

  async startCancellation(_command: StartCancellation) {
    void _command;
    return {
      reservationId: "plan-1",
      checkoutId: "checkout-1",
      reservationState: "cancellation_pending" as const,
      refundState: "pending" as const,
      providerRefundId: "re_123",
    };
  }
}

const commerceRepository = new MemoryCommerceRepository();
const paymentProvider: PaymentProvider = {
  createCheckout: vi.fn(async () => ({
    id: "cs_test_123",
    url: "https://checkout.stripe.com/c/pay/cs_test_123",
    expiresAt: "2026-08-14T16:00:00.000Z",
  })),
  expireCheckout: vi.fn(async () => undefined),
  createRefund: vi.fn(async () => ({
    id: "re_123",
    state: "succeeded" as const,
  })),
  parseWebhook: vi.fn(),
};
const checkoutApp = createApp({
  clock: () => new Date("2026-08-13T16:00:00Z"),
  commerceRepository,
  paymentProvider,
  resolveSession: async (context) =>
    context.req.header("x-test-owner") || "guest-a",
});

const stripeBindings = {
  ...bindings,
  STRIPE_SECRET_KEY: "sk_test_example",
  STRIPE_WEBHOOK_SECRET: "whsec_example",
};

class WebhookCommerceRepository extends MemoryCommerceRepository {
  private readonly events = new Set<string>();

  override async processPaymentEvent(event: PaymentWebhookEvent) {
    if (this.events.has(event.id)) return "replayed" as const;
    this.events.add(event.id);
    return "applied" as const;
  }
}

const webhookRepository = new WebhookCommerceRepository();
const webhookProvider: PaymentProvider = {
  ...paymentProvider,
  parseWebhook: vi.fn(async () => ({
    id: "evt_checkout_1",
    type: "checkout.succeeded" as const,
    checkoutId: "checkout-1",
    providerCheckoutId: "cs_test_123",
    providerPaymentId: "pi_123",
    occurredAt: "2026-08-13T16:00:00.000Z",
  })),
};
const webhookApp = createApp({
  clock: () => new Date("2026-08-13T16:00:00Z"),
  commerceRepository: webhookRepository,
  paymentProvider: webhookProvider,
});

class CancellationCommerceRepository extends MemoryCommerceRepository {
  cancellation: Awaited<ReturnType<CommerceRepository["findCancellation"]>> =
    null;

  override async findCancellationCandidate(
    ownerSessionId: string,
    reservationId: string,
  ) {
    if (ownerSessionId !== "guest-a" || reservationId !== "plan-confirmed")
      return null;
    return {
      reservationId,
      reservationVersion: 2,
      checkoutId: "checkout-confirmed",
      providerPaymentId: "pi_123",
    };
  }

  override async findCancellation(
    ownerSessionId: string,
    reservationId: string,
    idempotencyKey: string,
  ) {
    return ownerSessionId === "guest-a" &&
      reservationId === "plan-confirmed" &&
      idempotencyKey === "cancel-1"
      ? this.cancellation
      : null;
  }

  override async startCancellation() {
    this.cancellation = {
      reservationId: "plan-confirmed",
      checkoutId: "checkout-confirmed",
      reservationState: "cancellation_pending",
      refundState: "pending",
      providerRefundId: "re_123",
    };
    return this.cancellation;
  }
}

const cancellationRepository = new CancellationCommerceRepository();
const cancellationApp = createApp({
  clock: () => new Date("2026-08-13T16:00:00Z"),
  commerceRepository: cancellationRepository,
  paymentProvider,
  resolveSession: async (context) =>
    context.req.header("x-test-owner") || "guest-a",
});

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

describe("durable plans API", () => {
  it("creates an owned draft and returns the preserved snapshot", async () => {
    const response = await planApp.request(
      "/api/v1/plans",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-owner": "guest-a",
        },
        body: JSON.stringify({
          event: normalizedEvent,
          idempotencyKey: "save-1",
        }),
      },
      bindings,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      data: { state: "draft", version: 0, event: normalizedEvent },
      replayed: false,
    });
  });

  it("returns the same draft for an idempotent replay", async () => {
    const response = await planApp.request(
      "/api/v1/plans",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-owner": "guest-a",
        },
        body: JSON.stringify({
          event: normalizedEvent,
          idempotencyKey: "save-1",
        }),
      },
      bindings,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { id: "plan-1" },
      replayed: true,
    });
  });

  it("does not expose one guest's plans to another guest", async () => {
    const response = await planApp.request(
      "/api/v1/plans",
      { headers: { "x-test-owner": "guest-b" } },
      bindings,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: [] });
  });

  it("rejects an unnormalized event snapshot", async () => {
    const response = await planApp.request(
      "/api/v1/plans",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event: { name: "Made up" },
          idempotencyKey: "bad",
        }),
      },
      bindings,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_PLAN", issues: expect.any(Array) },
    });
  });
});

describe("sandbox checkout API", () => {
  it("requires an explicit confirmation", async () => {
    const response = await checkoutApp.request(
      "/api/v1/checkouts",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reservationId: "plan-1",
          idempotencyKey: "pay-1",
          confirmed: false,
        }),
      },
      bindings,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CHECKOUT_CONFIRMATION_REQUIRED" },
    });
  });

  it("creates a sandbox checkout for an owned draft", async () => {
    const response = await checkoutApp.request(
      "/api/v1/checkouts",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-owner": "guest-a",
        },
        body: JSON.stringify({
          reservationId: "plan-1",
          idempotencyKey: "pay-1",
          confirmed: true,
        }),
      },
      bindings,
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        state: "pending",
        amountMinor: 100,
        currency: "usd",
        redirectUrl: "https://checkout.stripe.com/c/pay/cs_test_123",
      },
      replayed: false,
      sandbox: true,
    });
  });

  it("replays the same checkout without creating another Stripe Session", async () => {
    const response = await checkoutApp.request(
      "/api/v1/checkouts",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reservationId: "plan-1",
          idempotencyKey: "pay-1",
          confirmed: true,
        }),
      },
      bindings,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ replayed: true });
    expect(paymentProvider.createCheckout).toHaveBeenCalledTimes(1);
  });

  it("does not allow another guest to checkout the draft", async () => {
    const response = await checkoutApp.request(
      "/api/v1/checkouts",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-owner": "guest-b",
        },
        body: JSON.stringify({
          reservationId: "plan-1",
          idempotencyKey: "pay-other",
          confirmed: true,
        }),
      },
      bindings,
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CHECKOUT_NOT_AVAILABLE" },
    });
  });
});

describe("Stripe webhook API", () => {
  it("rejects a missing Stripe signature", async () => {
    const response = await webhookApp.request(
      "/api/v1/stripe/webhook",
      { method: "POST", body: "{}" },
      stripeBindings,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_STRIPE_SIGNATURE" },
    });
  });

  it("applies a verified event once and safely reports its replay", async () => {
    const request = {
      method: "POST",
      headers: { "stripe-signature": "verified-by-provider" },
      body: "{}",
    };
    const first = await webhookApp.request(
      "/api/v1/stripe/webhook",
      request,
      stripeBindings,
    );
    const replay = await webhookApp.request(
      "/api/v1/stripe/webhook",
      request,
      stripeBindings,
    );
    await expect(first.json()).resolves.toMatchObject({ outcome: "applied" });
    await expect(replay.json()).resolves.toMatchObject({ outcome: "replayed" });
  });

  it("rejects a signature that the provider cannot verify", async () => {
    const rejectingProvider: PaymentProvider = {
      ...paymentProvider,
      parseWebhook: vi.fn(async () => {
        throw new PaymentProviderError("invalid_webhook", "forged");
      }),
    };
    const rejectingApp = createApp({ paymentProvider: rejectingProvider });
    const response = await rejectingApp.request(
      "/api/v1/stripe/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "forged" },
        body: "{}",
      },
      stripeBindings,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_STRIPE_SIGNATURE" },
    });
  });
});

describe("sandbox cancellation API", () => {
  it("requires explicit confirmation", async () => {
    const response = await cancellationApp.request(
      "/api/v1/reservations/plan-confirmed/cancel",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmed: false, idempotencyKey: "cancel-1" }),
      },
      bindings,
    );
    expect(response.status).toBe(400);
  });

  it("starts a test refund and replays the same cancellation safely", async () => {
    const request = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmed: true, idempotencyKey: "cancel-1" }),
    };
    const first = await cancellationApp.request(
      "/api/v1/reservations/plan-confirmed/cancel",
      request,
      bindings,
    );
    const replay = await cancellationApp.request(
      "/api/v1/reservations/plan-confirmed/cancel",
      request,
      bindings,
    );
    expect(first.status).toBe(202);
    await expect(first.json()).resolves.toMatchObject({
      data: {
        reservationState: "cancellation_pending",
        refundState: "pending",
      },
      replayed: false,
    });
    await expect(replay.json()).resolves.toMatchObject({ replayed: true });
    expect(paymentProvider.createRefund).toHaveBeenCalledTimes(1);
  });
});
