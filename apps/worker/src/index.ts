import {
  DiscoveryService,
  FixtureEventProvider,
  normalizeSearchInput,
  type CommerceRepository,
  type PaymentProvider,
  PaymentProviderError,
  type PlanRepository,
  PlanValidationError,
  parseDraftPlanInput,
  SearchValidationError,
} from "@scout/core";
import { Hono } from "hono";

import type { Bindings } from "./env";
import { validateEnvironment } from "./env";
import { resolveGuestSession } from "./guest-session";
import { apiError, type AppContext, type AppVariables } from "./http";
import { D1PlanRepository } from "./persistence/plan-repository";
import { TicketmasterEventProvider } from "./providers/ticketmaster-event-provider";
import { StripePaymentProvider } from "./providers/stripe-payment-provider";

interface AppDependencies {
  clock?: () => Date;
  fetcher?: typeof fetch;
  planRepository?: PlanRepository;
  commerceRepository?: CommerceRepository;
  paymentProvider?: PaymentProvider;
  resolveSession?: (context: AppContext) => Promise<string>;
}

const searchWindows = new Map<string, number>();

function isSearchRateLimited(sessionId: string, now: number) {
  const previous = searchWindows.get(sessionId);
  searchWindows.set(sessionId, now);
  if (searchWindows.size > 1_000) searchWindows.clear();
  return previous !== undefined && now - previous < 500;
}

export function createApp(dependencies: AppDependencies = {}) {
  const clock = dependencies.clock ?? (() => new Date());
  const fetcher =
    dependencies.fetcher ??
    ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const app = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();

  app.use("/api/*", async (context, next) => {
    const candidate = context.req.header("x-request-id");
    const requestId =
      candidate && /^[a-zA-Z0-9._:-]{1,128}$/.test(candidate)
        ? candidate
        : crypto.randomUUID();

    context.set("requestId", requestId);
    context.set("startedAt", Date.now());
    context.header("x-request-id", requestId);

    await next();

    console.log(
      JSON.stringify({
        type: "http_request",
        requestId,
        method: context.req.method,
        route: context.req.path,
        status: context.res.status,
        durationMs: Date.now() - context.get("startedAt"),
      }),
    );
  });

  app.get("/api/v1/health", (context) =>
    context.json({
      status: "ok",
      service: "scout",
      requestId: context.get("requestId"),
    }),
  );

  app.get("/api/v1/readiness", async (context) => {
    try {
      validateEnvironment(context.env);
      await context.env.DB.prepare("SELECT 1 AS ready").first();

      return context.json({
        status: "ready",
        checks: { environment: "ok", database: "ok" },
        requestId: context.get("requestId"),
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          type: "readiness_failure",
          requestId: context.get("requestId"),
          category: error instanceof Error ? error.name : "UnknownError",
        }),
      );
      return apiError(
        context,
        503,
        "SERVICE_NOT_READY",
        "Scout is not ready to receive traffic.",
      );
    }
  });

  app.get("/api/v1/events/search", async (context) => {
    const sessionId =
      context.req.header("x-scout-session") || context.get("requestId");
    if (isSearchRateLimited(sessionId, clock().getTime())) {
      return apiError(
        context,
        429,
        "SEARCH_RATE_LIMITED",
        "Please wait before searching again.",
      );
    }

    let search;
    try {
      search = normalizeSearchInput(
        {
          city: context.req.query("city"),
          startDate: context.req.query("startDate"),
          endDate: context.req.query("endDate"),
          category: context.req.query("category"),
          budgetMax: context.req.query("budgetMax"),
          partySize: context.req.query("partySize"),
          timePreference: context.req.query("timePreference"),
          mode: context.req.query("mode"),
        },
        clock(),
      );
    } catch (error) {
      if (error instanceof SearchValidationError) {
        return context.json(
          {
            error: {
              code: "INVALID_SEARCH",
              message: "Check the highlighted search constraints.",
              issues: error.issues,
              requestId: context.get("requestId"),
            },
          },
          400,
        );
      }
      throw error;
    }

    const fixture = new FixtureEventProvider(clock);
    const live = context.env.TICKETMASTER_API_KEY
      ? new TicketmasterEventProvider(
          context.env.TICKETMASTER_API_KEY,
          fetcher,
          clock,
        )
      : null;
    const startedAt = Date.now();
    const result = await new DiscoveryService(fixture, live).search(
      search.constraints,
      search.mode,
    );

    console.log(
      JSON.stringify({
        type: "event_search",
        requestId: context.get("requestId"),
        requestedMode: result.requestedMode,
        providerMode: result.mode,
        fallbackReason: result.fallbackReason,
        resultCount: result.events.length,
        durationMs: Date.now() - startedAt,
      }),
    );

    return context.json({
      data: result,
      constraints: search.constraints,
      requestId: context.get("requestId"),
    });
  });

  async function planDependencies(context: AppContext) {
    const ownerSessionId = dependencies.resolveSession
      ? await dependencies.resolveSession(context)
      : await resolveGuestSession(context, clock);
    const repository =
      dependencies.planRepository ??
      new D1PlanRepository(context.env.DB, clock);
    return { ownerSessionId, repository };
  }

  app.get("/api/v1/plans", async (context) => {
    const { ownerSessionId, repository } = await planDependencies(context);
    const plans = await repository.listForOwner(ownerSessionId);
    return context.json({ data: plans, requestId: context.get("requestId") });
  });

  app.post("/api/v1/plans", async (context) => {
    let input;
    try {
      input = parseDraftPlanInput(await context.req.json<unknown>());
    } catch (error) {
      if (error instanceof PlanValidationError) {
        return context.json(
          {
            error: {
              code: "INVALID_PLAN",
              message: "The selected event could not be saved.",
              issues: error.issues,
              requestId: context.get("requestId"),
            },
          },
          400,
        );
      }
      return apiError(
        context,
        400,
        "INVALID_JSON",
        "The request body must be valid JSON.",
      );
    }

    const { ownerSessionId, repository } = await planDependencies(context);
    const result = await repository.createDraft({
      ownerSessionId,
      event: input.event,
      idempotencyKey: input.idempotencyKey,
      correlationId: context.get("requestId"),
    });
    return context.json(
      {
        data: result.plan,
        replayed: result.replayed,
        requestId: context.get("requestId"),
      },
      result.replayed ? 200 : 201,
    );
  });

  app.post("/api/v1/checkouts", async (context) => {
    let body: unknown;
    try {
      body = await context.req.json<unknown>();
    } catch {
      return apiError(
        context,
        400,
        "INVALID_JSON",
        "The request body must be valid JSON.",
      );
    }
    if (
      typeof body !== "object" ||
      body === null ||
      !("confirmed" in body) ||
      body.confirmed !== true ||
      !("reservationId" in body) ||
      typeof body.reservationId !== "string" ||
      !/^[a-zA-Z0-9._:-]{1,128}$/.test(body.reservationId) ||
      !("idempotencyKey" in body) ||
      typeof body.idempotencyKey !== "string" ||
      !/^[a-zA-Z0-9._:-]{1,128}$/.test(body.idempotencyKey)
    ) {
      return apiError(
        context,
        400,
        "CHECKOUT_CONFIRMATION_REQUIRED",
        "Explicit confirmation and valid checkout identifiers are required.",
      );
    }

    const { ownerSessionId } = await planDependencies(context);
    const repository =
      dependencies.commerceRepository ??
      new D1PlanRepository(context.env.DB, clock);
    const existing = await repository.findCheckoutLaunch(
      ownerSessionId,
      body.reservationId,
      body.idempotencyKey,
    );
    if (existing) {
      return context.json({
        data: existing,
        replayed: true,
        sandbox: true,
        requestId: context.get("requestId"),
      });
    }

    const candidate = await repository.findCheckoutCandidate(
      ownerSessionId,
      body.reservationId,
    );
    if (!candidate) {
      return apiError(
        context,
        409,
        "CHECKOUT_NOT_AVAILABLE",
        "This owned draft is not available for checkout.",
      );
    }
    if (!dependencies.paymentProvider && !context.env.STRIPE_SECRET_KEY) {
      return apiError(
        context,
        503,
        "STRIPE_NOT_CONFIGURED",
        "Stripe sandbox checkout is not configured.",
      );
    }

    const provider =
      dependencies.paymentProvider ??
      new StripePaymentProvider(
        context.env.STRIPE_SECRET_KEY as string,
        fetcher,
        clock,
      );
    const checkoutId = crypto.randomUUID();
    const origin = new URL(context.req.url).origin;
    let providerCheckout;
    try {
      providerCheckout = await provider.createCheckout({
        checkoutId,
        reservationId: candidate.reservationId,
        eventName: candidate.eventName,
        successUrl: `${origin}/?checkout=return&session_id={CHECKOUT_SESSION_ID}#plans`,
        cancelUrl: `${origin}/?checkout=cancelled#plans`,
        idempotencyKey: `checkout:${ownerSessionId}:${body.idempotencyKey}`,
      });
    } catch (error) {
      if (error instanceof PaymentProviderError) {
        return apiError(
          context,
          503,
          "STRIPE_UNAVAILABLE",
          "Stripe sandbox checkout could not be started.",
        );
      }
      throw error;
    }

    try {
      const launch = await repository.startCheckout({
        id: checkoutId,
        ownerSessionId,
        reservationId: candidate.reservationId,
        expectedReservationVersion: candidate.reservationVersion,
        idempotencyKey: body.idempotencyKey,
        providerCheckoutId: providerCheckout.id,
        redirectUrl: providerCheckout.url,
        expiresAt: providerCheckout.expiresAt,
        correlationId: context.get("requestId"),
      });
      return context.json(
        {
          data: launch,
          replayed: false,
          sandbox: true,
          notice: "No real charge, ticket, or provider reservation is created.",
          requestId: context.get("requestId"),
        },
        201,
      );
    } catch (error) {
      try {
        await provider.expireCheckout(providerCheckout.id);
      } catch {
        console.error(
          JSON.stringify({
            type: "orphan_checkout_expiry_failed",
            requestId: context.get("requestId"),
            category: "PaymentProviderError",
          }),
        );
      }
      throw error;
    }
  });

  app.post("/api/v1/stripe/webhook", async (context) => {
    if (!context.env.STRIPE_SECRET_KEY || !context.env.STRIPE_WEBHOOK_SECRET) {
      return apiError(
        context,
        503,
        "STRIPE_WEBHOOK_NOT_CONFIGURED",
        "Stripe webhook verification is not configured.",
      );
    }
    const signature = context.req.header("stripe-signature");
    if (!signature) {
      return apiError(
        context,
        400,
        "INVALID_STRIPE_SIGNATURE",
        "A valid Stripe signature is required.",
      );
    }
    const rawBody = await context.req.text();
    const provider =
      dependencies.paymentProvider ??
      new StripePaymentProvider(context.env.STRIPE_SECRET_KEY, fetcher, clock);
    let event;
    try {
      event = await provider.parseWebhook(
        rawBody,
        signature,
        context.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (error) {
      if (
        error instanceof PaymentProviderError &&
        error.category === "invalid_webhook"
      ) {
        return apiError(
          context,
          400,
          "INVALID_STRIPE_SIGNATURE",
          "The Stripe webhook could not be verified.",
        );
      }
      throw error;
    }
    if (event.type === "ignored") {
      return context.json({ received: true, outcome: "ignored" });
    }
    const repository =
      dependencies.commerceRepository ??
      new D1PlanRepository(context.env.DB, clock);
    try {
      const outcome = await repository.processPaymentEvent(
        event,
        context.get("requestId"),
      );
      return context.json({ received: true, outcome });
    } catch {
      return apiError(
        context,
        503,
        "PAYMENT_EVENT_RETRY_REQUIRED",
        "The payment event could not be persisted yet.",
      );
    }
  });

  app.post("/api/v1/reservations/:id/cancel", async (context) => {
    let body: unknown;
    try {
      body = await context.req.json<unknown>();
    } catch {
      return apiError(
        context,
        400,
        "INVALID_JSON",
        "The request body must be valid JSON.",
      );
    }
    if (
      typeof body !== "object" ||
      body === null ||
      !("confirmed" in body) ||
      body.confirmed !== true ||
      !("idempotencyKey" in body) ||
      typeof body.idempotencyKey !== "string" ||
      !/^[a-zA-Z0-9._:-]{1,128}$/.test(body.idempotencyKey)
    ) {
      return apiError(
        context,
        400,
        "CANCELLATION_CONFIRMATION_REQUIRED",
        "Explicit cancellation confirmation is required.",
      );
    }
    const reservationId = context.req.param("id");
    const { ownerSessionId } = await planDependencies(context);
    const repository =
      dependencies.commerceRepository ??
      new D1PlanRepository(context.env.DB, clock);
    const existing = await repository.findCancellation(
      ownerSessionId,
      reservationId,
      body.idempotencyKey,
    );
    if (existing) {
      return context.json({
        data: existing,
        replayed: true,
        sandbox: true,
        requestId: context.get("requestId"),
      });
    }
    const candidate = await repository.findCancellationCandidate(
      ownerSessionId,
      reservationId,
    );
    if (!candidate) {
      return apiError(
        context,
        409,
        "CANCELLATION_NOT_AVAILABLE",
        "This reservation is not available for cancellation.",
      );
    }
    if (!dependencies.paymentProvider && !context.env.STRIPE_SECRET_KEY) {
      return apiError(
        context,
        503,
        "STRIPE_NOT_CONFIGURED",
        "Stripe sandbox refunds are not configured.",
      );
    }
    const provider =
      dependencies.paymentProvider ??
      new StripePaymentProvider(
        context.env.STRIPE_SECRET_KEY as string,
        fetcher,
        clock,
      );
    let refund;
    try {
      refund = await provider.createRefund({
        checkoutId: candidate.checkoutId,
        paymentId: candidate.providerPaymentId,
        idempotencyKey: `refund:${candidate.checkoutId}:${body.idempotencyKey}`,
      });
    } catch (error) {
      if (error instanceof PaymentProviderError) {
        return apiError(
          context,
          503,
          "STRIPE_UNAVAILABLE",
          "Stripe sandbox refund could not be started.",
        );
      }
      throw error;
    }
    const result = await repository.startCancellation({
      ...candidate,
      ownerSessionId,
      idempotencyKey: body.idempotencyKey,
      providerRefundId: refund.id,
      correlationId: context.get("requestId"),
    });
    return context.json(
      {
        data: result,
        replayed: false,
        sandbox: true,
        notice: "This only refunds the Stripe test payment.",
        requestId: context.get("requestId"),
      },
      202,
    );
  });

  app.notFound((context) =>
    apiError(
      context,
      404,
      "NOT_FOUND",
      "The requested API route does not exist.",
    ),
  );

  app.onError((error, context) => {
    console.error(
      JSON.stringify({
        type: "unhandled_error",
        requestId: context.get("requestId"),
        category: error.name,
      }),
    );
    return apiError(
      context,
      500,
      "INTERNAL_ERROR",
      "Scout could not complete the request.",
    );
  });

  return app;
}

const app = createApp();
export { app };
export default app;
