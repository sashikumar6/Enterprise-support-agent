import {
  DiscoveryService,
  FixtureEventProvider,
  normalizeSearchInput,
  SearchValidationError,
} from "@scout/core";
import { Hono } from "hono";

import type { Bindings } from "./env";
import { validateEnvironment } from "./env";
import { apiError, type AppVariables } from "./http";
import { TicketmasterEventProvider } from "./providers/ticketmaster-event-provider";

interface AppDependencies {
  clock?: () => Date;
  fetcher?: typeof fetch;
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
