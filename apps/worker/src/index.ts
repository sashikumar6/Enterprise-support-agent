import {
  AIOrchestrator,
  type AIProvider,
  ConversationValidationError,
  DiscoveryService,
  FixtureEventProvider,
  normalizeSearchInput,
  type CommerceRepository,
  type PaymentProvider,
  PaymentProviderError,
  type PlanRepository,
  type LifecycleRepository,
  type OperationsRecorder,
  type OperationsRepository,
  type SpeechProvider,
  SpeechValidationError,
  validateAudioInput,
  validateSpeechText,
  parsePreferenceProfile,
  parseHelpRequest,
  parseOperationsTimelineQuery,
  PlanValidationError,
  parseConversationInput,
  parseDraftPlanInput,
  SearchValidationError,
} from "@scout/core";
import { Hono } from "hono";

import type { Bindings } from "./env";
import { validateEnvironment } from "./env";
import { resolveGuestSession } from "./guest-session";
import { apiError, type AppContext, type AppVariables } from "./http";
import { D1PlanRepository } from "./persistence/plan-repository";
import { D1LifecycleRepository } from "./persistence/lifecycle-repository";
import { D1OperationsRepository } from "./persistence/operations-repository";
import { D1RateLimitRepository } from "./persistence/rate-limit-repository";
import {
  createOpsSession,
  opsSessionCookie,
  verifyOpsSession,
} from "./ops-auth";
import { StripePaymentProvider } from "./providers/stripe-payment-provider";
import { TicketmasterEventProvider } from "./providers/ticketmaster-event-provider";
import { WorkersAIProvider } from "./providers/workers-ai-provider";
import { WorkersAISpeechProvider } from "./providers/workers-ai-speech-provider";

interface AppDependencies {
  aiProvider?: AIProvider;
  clock?: () => Date;
  fetcher?: typeof fetch;
  planRepository?: PlanRepository;
  commerceRepository?: CommerceRepository;
  paymentProvider?: PaymentProvider;
  speechProvider?: SpeechProvider;
  lifecycleRepository?: LifecycleRepository;
  operationsRecorder?: OperationsRecorder;
  operationsRepository?: OperationsRepository;
  resolveSession?: (context: AppContext) => Promise<string>;
  rateLimit?: (
    scope: "costly" | "mutation" | "auth",
    key: string,
  ) => Promise<boolean>;
}

type RateLimitScope = "costly" | "mutation" | "auth";

const localRateLimits: Record<
  RateLimitScope,
  { limit: number; periodMs: number }
> = {
  costly: { limit: 10, periodMs: 60_000 },
  mutation: { limit: 12, periodMs: 60_000 },
  auth: { limit: 5, periodMs: 60_000 },
};

function rateLimitScope(method: string, path: string): RateLimitScope | null {
  if (method === "POST" && path === "/api/v1/ops/session") return "auth";
  if (
    (method === "GET" && path === "/api/v1/events/search") ||
    (method === "POST" &&
      (path === "/api/v1/conversations/messages" ||
        path === "/api/v1/voice/transcriptions" ||
        path === "/api/v1/voice/speech" ||
        path === "/api/v1/plans/status-refresh"))
  )
    return "costly";
  if (
    (method === "PUT" && path === "/api/v1/preferences") ||
    (method === "POST" &&
      (path === "/api/v1/plans" ||
        path === "/api/v1/checkouts" ||
        path === "/api/v1/help-requests" ||
        path.startsWith("/api/v1/alerts/") ||
        path.endsWith("/cancel")))
  )
    return "mutation";
  return null;
}

export function createApp(dependencies: AppDependencies = {}) {
  const clock = dependencies.clock ?? (() => new Date());
  const fetcher =
    dependencies.fetcher ??
    ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const app = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();
  const localWindows = new Map<string, { count: number; resetAt: number }>();

  app.use("/api/*", async (context, next) => {
    await next();
    context.header(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    context.header(
      "Permissions-Policy",
      "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
    );
    context.header("Referrer-Policy", "strict-origin-when-cross-origin");
    context.header("X-Content-Type-Options", "nosniff");
    context.header("X-Frame-Options", "DENY");
  });

  async function actorKey(context: AppContext, scope: RateLimitScope) {
    if (scope === "auth") {
      const address = context.req.header("cf-connecting-ip") || "local";
      const agent = context.req.header("user-agent") || "unknown";
      const data = new TextEncoder().encode(`${address}:${agent}`);
      const digest = await crypto.subtle.digest("SHA-256", data);
      return [...new Uint8Array(digest)]
        .slice(0, 12)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    }
    if (dependencies.resolveSession)
      return dependencies.resolveSession(context);
    if (context.env.APP_ENV === "test")
      return context.req.header("x-scout-session") || context.get("requestId");
    return resolveGuestSession(context, clock);
  }

  async function rateLimitAllowed(
    context: AppContext,
    scope: RateLimitScope,
    key: string,
  ) {
    if (dependencies.rateLimit) return dependencies.rateLimit(scope, key);
    const now = clock().getTime();
    const config = localRateLimits[scope];
    const existing = localWindows.get(key);
    if (!existing || existing.resetAt <= now) {
      localWindows.set(key, { count: 1, resetAt: now + config.periodMs });
    } else {
      existing.count += 1;
      if (existing.count > config.limit) return false;
    }
    if (localWindows.size > 2_000) localWindows.clear();

    const binding =
      scope === "costly"
        ? context.env.COSTLY_RATE_LIMITER
        : scope === "mutation"
          ? context.env.MUTATION_RATE_LIMITER
          : context.env.AUTH_RATE_LIMITER;
    if (binding && !(await binding.limit({ key })).success) return false;
    if (
      context.env.APP_ENV === "preview" ||
      context.env.APP_ENV === "production"
    ) {
      return new D1RateLimitRepository(context.env.DB, clock).allow({
        scope,
        actorKey: key,
        limit: config.limit,
        periodMs: config.periodMs,
      });
    }
    return true;
  }

  app.use("/api/*", async (context, next) => {
    const method = context.req.method.toUpperCase();
    const path = context.req.path;
    if (
      method !== "GET" &&
      method !== "HEAD" &&
      method !== "OPTIONS" &&
      path !== "/api/v1/stripe/webhook"
    ) {
      const origin = context.req.header("origin");
      if (origin && origin !== new URL(context.req.url).origin)
        return apiError(
          context,
          403,
          "CROSS_ORIGIN_REQUEST",
          "State-changing requests must come from Scout.",
        );
    }

    const contentLength = Number(context.req.header("content-length") || 0);
    const maximumBytes =
      path === "/api/v1/voice/transcriptions"
        ? 5 * 1024 * 1024 + 64 * 1024
        : 64 * 1024;
    if (Number.isFinite(contentLength) && contentLength > maximumBytes)
      return apiError(
        context,
        413,
        "REQUEST_TOO_LARGE",
        "The request body is too large.",
      );

    const scope = rateLimitScope(method, path);
    if (scope) {
      const key = `${path}:${await actorKey(context, scope)}`;
      try {
        if (!(await rateLimitAllowed(context, scope, key))) {
          context.header("retry-after", "60");
          return apiError(
            context,
            429,
            "RATE_LIMITED",
            "Too many requests. Wait before trying again.",
          );
        }
      } catch {
        return apiError(
          context,
          503,
          "RATE_LIMIT_UNAVAILABLE",
          "Scout cannot safely accept this request right now.",
        );
      }
    }
    await next();
  });

  async function recordOperations(
    context: AppContext,
    input: {
      tool: Parameters<OperationsRecorder["recordTool"]>[0];
      provider?: Parameters<OperationsRecorder["recordProvider"]>[0];
    },
  ) {
    if (!dependencies.operationsRecorder && context.env.APP_ENV === "test")
      return;
    const recorder =
      dependencies.operationsRecorder ??
      new D1OperationsRepository(context.env.DB, clock);
    try {
      await recorder.recordTool(input.tool);
      if (input.provider) await recorder.recordProvider(input.provider);
    } catch (error) {
      console.error(
        JSON.stringify({
          type: "operations_record_failure",
          requestId: context.get("requestId"),
          category: error instanceof Error ? error.name : "UnknownError",
        }),
      );
    }
  }

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
          exactStartTime: context.req.query("exactStartTime"),
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
    const latencyMs = Date.now() - startedAt;

    await recordOperations(context, {
      tool: {
        name: "search_events",
        provider: result.mode,
        status: result.fallbackReason ? "degraded" : "completed",
        latencyMs,
        correlationId: context.get("requestId"),
        metadata: {
          requestedMode: result.requestedMode,
          providerMode: result.mode,
          resultCount: result.events.length,
        },
      },
      provider: {
        provider: result.requestedMode === "live" ? "ticketmaster" : "fixture",
        status: result.fallbackReason ? "degraded" : "healthy",
        latencyMs,
        failureCategory: result.fallbackReason,
        correlationId: context.get("requestId"),
      },
    });

    console.log(
      JSON.stringify({
        type: "event_search",
        requestId: context.get("requestId"),
        requestedMode: result.requestedMode,
        providerMode: result.mode,
        fallbackReason: result.fallbackReason,
        resultCount: result.events.length,
        durationMs: latencyMs,
      }),
    );

    return context.json({
      data: result,
      constraints: search.constraints,
      requestId: context.get("requestId"),
    });
  });

  app.post("/api/v1/conversations/messages", async (context) => {
    let input;
    try {
      input = parseConversationInput(await context.req.json<unknown>());
    } catch (error) {
      if (error instanceof ConversationValidationError) {
        return context.json(
          {
            error: {
              code: "INVALID_CONVERSATION",
              message: "Check the conversational search request.",
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

    const fixture = new FixtureEventProvider(clock);
    const live = context.env.TICKETMASTER_API_KEY
      ? new TicketmasterEventProvider(
          context.env.TICKETMASTER_API_KEY,
          fetcher,
          clock,
        )
      : null;
    const discovery = new DiscoveryService(fixture, live);
    const aiProvider =
      dependencies.aiProvider ??
      (context.env.AI ? new WorkersAIProvider(context.env.AI) : null);
    const startedAt = Date.now();
    const result = await new AIOrchestrator(
      aiProvider,
      (constraints, mode) => discovery.search(constraints, mode),
      clock,
    ).run(input);
    const latencyMs = Date.now() - startedAt;

    await recordOperations(context, {
      tool: {
        name: "ai_orchestration",
        provider: result.modelUsed ? "workers-ai" : null,
        status: result.modelUsed ? "completed" : "degraded",
        latencyMs,
        correlationId: context.get("requestId"),
        metadata: {
          modelUsed: result.modelUsed,
          toolCount: result.toolCalls.length,
          resultCount:
            result.status === "results" ? result.result.events.length : 0,
        },
      },
      provider: {
        provider: "workers-ai",
        status: result.modelUsed ? "healthy" : "unavailable",
        latencyMs,
        failureCategory: result.modelUsed ? null : "fallback",
        correlationId: context.get("requestId"),
      },
    });

    console.log(
      JSON.stringify({
        type: "conversation_message",
        requestId: context.get("requestId"),
        status: result.status,
        modelUsed: result.modelUsed,
        toolCount: result.toolCalls.length,
        durationMs: latencyMs,
      }),
    );
    return context.json({ data: result, requestId: context.get("requestId") });
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

  async function lifecycleDependencies(context: AppContext) {
    const ownerSessionId = dependencies.resolveSession
      ? await dependencies.resolveSession(context)
      : await resolveGuestSession(context, clock);
    const repository =
      dependencies.lifecycleRepository ??
      new D1LifecycleRepository(context.env.DB, clock);
    return { ownerSessionId, repository };
  }

  async function authorizedOperations(context: AppContext) {
    const token = context.env.OPS_ACCESS_TOKEN;
    if (!token || token.length < 24) return false;
    return verifyOpsSession(context.req.raw, token, clock());
  }

  function operationsRepository(context: AppContext) {
    return (
      dependencies.operationsRepository ??
      new D1OperationsRepository(context.env.DB, clock)
    );
  }

  app.post("/api/v1/voice/transcriptions", async (context) => {
    let form: FormData;
    try {
      form = await context.req.formData();
    } catch {
      return apiError(
        context,
        400,
        "INVALID_AUDIO",
        "The audio upload is invalid.",
      );
    }
    const audio = form.get("audio");
    const durationMs = Number(form.get("durationMs"));
    if (!(audio instanceof File))
      return apiError(
        context,
        400,
        "INVALID_AUDIO",
        "An audio clip is required.",
      );
    try {
      validateAudioInput({
        bytes: audio.size,
        mediaType: audio.type,
        durationMs,
      });
      const provider =
        dependencies.speechProvider ??
        (context.env.AI ? new WorkersAISpeechProvider(context.env.AI) : null);
      if (!provider)
        return apiError(
          context,
          503,
          "SPEECH_UNAVAILABLE",
          "Voice transcription is unavailable. Type your request instead.",
        );
      const startedAt = Date.now();
      const transcript = await provider.transcribe(
        new Uint8Array(await audio.arrayBuffer()),
        audio.type,
      );
      const latencyMs = Date.now() - startedAt;
      await recordOperations(context, {
        tool: {
          name: "transcribe_audio",
          provider: "workers-ai",
          status: "completed",
          latencyMs,
          correlationId: context.get("requestId"),
          metadata: { persistedRawAudio: false },
        },
        provider: {
          provider: "workers-ai-speech",
          status: "healthy",
          latencyMs,
          failureCategory: null,
          correlationId: context.get("requestId"),
        },
      });
      console.log(
        JSON.stringify({
          type: "speech_transcription",
          requestId: context.get("requestId"),
          model: "whisper-large-v3-turbo",
          durationMs,
          latencyMs,
          persistedRawAudio: false,
        }),
      );
      return context.json({
        data: { transcript, editable: true, rawAudioPersisted: false },
        requestId: context.get("requestId"),
      });
    } catch (error) {
      if (error instanceof SpeechValidationError) {
        const messages = {
          unsupported_format: "This audio format is not supported.",
          too_large: "The audio clip is too large.",
          too_long: "Recordings must be 30 seconds or shorter.",
          silence: "No speech was detected. Try again or type your request.",
          invalid_text: "Speech text is invalid.",
        };
        return apiError(
          context,
          400,
          `VOICE_${error.code.toUpperCase()}`,
          messages[error.code],
        );
      }
      await recordOperations(context, {
        tool: {
          name: "transcribe_audio",
          provider: "workers-ai",
          status: "failed",
          latencyMs: 0,
          correlationId: context.get("requestId"),
          metadata: { persistedRawAudio: false },
        },
        provider: {
          provider: "workers-ai-speech",
          status: "unavailable",
          latencyMs: null,
          failureCategory: error instanceof Error ? error.name : "UnknownError",
          correlationId: context.get("requestId"),
        },
      });
      return apiError(
        context,
        503,
        "SPEECH_UNAVAILABLE",
        "Voice transcription is unavailable. Type your request instead.",
      );
    }
  });

  app.post("/api/v1/voice/speech", async (context) => {
    try {
      const body = await context.req.json<{ text?: unknown }>();
      const text = validateSpeechText(body.text);
      const provider =
        dependencies.speechProvider ??
        (context.env.AI ? new WorkersAISpeechProvider(context.env.AI) : null);
      if (!provider)
        return apiError(
          context,
          503,
          "SPEECH_UNAVAILABLE",
          "Spoken responses are unavailable. The text response remains available.",
        );
      const startedAt = Date.now();
      const result = await provider.synthesize(text);
      const latencyMs = Date.now() - startedAt;
      await recordOperations(context, {
        tool: {
          name: "synthesize_speech",
          provider: "workers-ai",
          status: "completed",
          latencyMs,
          correlationId: context.get("requestId"),
          metadata: { characters: text.length },
        },
        provider: {
          provider: "workers-ai-speech",
          status: "healthy",
          latencyMs,
          failureCategory: null,
          correlationId: context.get("requestId"),
        },
      });
      console.log(
        JSON.stringify({
          type: "speech_synthesis",
          requestId: context.get("requestId"),
          model: result.model ?? "speech-provider",
          characters: text.length,
          latencyMs,
        }),
      );
      const audioBody = result.audio.buffer.slice(
        result.audio.byteOffset,
        result.audio.byteOffset + result.audio.byteLength,
      ) as ArrayBuffer;
      return new Response(audioBody, {
        headers: {
          "content-type": result.mediaType,
          "cache-control": "no-store",
          "x-request-id": context.get("requestId"),
        },
      });
    } catch (error) {
      if (error instanceof SpeechValidationError)
        return apiError(
          context,
          400,
          "INVALID_SPEECH_TEXT",
          "Spoken responses must contain 1–600 characters.",
        );
      await recordOperations(context, {
        tool: {
          name: "synthesize_speech",
          provider: "workers-ai",
          status: "failed",
          latencyMs: 0,
          correlationId: context.get("requestId"),
          metadata: {},
        },
        provider: {
          provider: "workers-ai-speech",
          status: "unavailable",
          latencyMs: null,
          failureCategory: error instanceof Error ? error.name : "UnknownError",
          correlationId: context.get("requestId"),
        },
      });
      console.error(
        JSON.stringify({
          type: "speech_synthesis_failure",
          requestId: context.get("requestId"),
          category: error instanceof Error ? error.name : "UnknownError",
          message:
            error instanceof Error
              ? error.message.slice(0, 240)
              : "Unknown speech provider failure",
        }),
      );
      return apiError(
        context,
        503,
        "SPEECH_UNAVAILABLE",
        "Spoken responses are unavailable. The text response remains available.",
      );
    }
  });

  app.get("/api/v1/preferences", async (context) => {
    const { ownerSessionId, repository } = await lifecycleDependencies(context);
    return context.json({
      data: await repository.getPreferences(ownerSessionId),
      requestId: context.get("requestId"),
    });
  });

  app.put("/api/v1/preferences", async (context) => {
    try {
      const profile = parsePreferenceProfile(await context.req.json<unknown>());
      const { ownerSessionId, repository } =
        await lifecycleDependencies(context);
      return context.json({
        data: await repository.savePreferences(
          ownerSessionId,
          profile,
          context.get("requestId"),
        ),
        requestId: context.get("requestId"),
      });
    } catch {
      return apiError(
        context,
        400,
        "INVALID_PREFERENCES",
        "Check the preference values.",
      );
    }
  });

  app.post("/api/v1/plans/status-refresh", async (context) => {
    const { ownerSessionId, repository } = await lifecycleDependencies(context);
    const events = await repository.ownedProviderEvents(ownerSessionId);
    if (
      events.some((event) => event.provider === "ticketmaster") &&
      !context.env.TICKETMASTER_API_KEY
    )
      return apiError(
        context,
        503,
        "EVENT_STATUS_UNAVAILABLE",
        "Live event status refresh is not configured.",
      );
    const provider = context.env.TICKETMASTER_API_KEY
      ? new TicketmasterEventProvider(
          context.env.TICKETMASTER_API_KEY,
          fetcher,
          clock,
        )
      : null;
    const changes = [];
    const startedAt = Date.now();
    try {
      for (const event of events) {
        const currentStatus =
          event.provider === "fixture"
            ? event.status
            : ((await provider?.status(event.providerEventId)) ?? null);
        const change = {
          reservationId: event.reservationId,
          previousStatus: event.status,
          currentStatus,
          changed: currentStatus !== event.status,
        };
        await repository.recordStatus(
          ownerSessionId,
          change,
          context.get("requestId"),
        );
        changes.push(change);
      }
      const latencyMs = Date.now() - startedAt;
      await recordOperations(context, {
        tool: {
          name: "refresh_event_status",
          provider: provider ? "ticketmaster" : "fixture",
          status: "completed",
          latencyMs,
          correlationId: context.get("requestId"),
          metadata: {
            checked: changes.length,
            changes: changes.filter((change) => change.changed).length,
          },
        },
        provider: {
          provider: provider ? "ticketmaster" : "fixture",
          status: "healthy",
          latencyMs,
          failureCategory: null,
          correlationId: context.get("requestId"),
        },
      });
      return context.json({
        data: { checked: changes.length, changes },
        requestId: context.get("requestId"),
      });
    } catch (error) {
      await recordOperations(context, {
        tool: {
          name: "refresh_event_status",
          provider: provider ? "ticketmaster" : "fixture",
          status: "failed",
          latencyMs: Date.now() - startedAt,
          correlationId: context.get("requestId"),
          metadata: { checked: changes.length },
        },
        provider: {
          provider: provider ? "ticketmaster" : "fixture",
          status: "unavailable",
          latencyMs: Date.now() - startedAt,
          failureCategory: error instanceof Error ? error.name : "UnknownError",
          correlationId: context.get("requestId"),
        },
      });
      return apiError(
        context,
        503,
        "EVENT_STATUS_UNAVAILABLE",
        "Provider status could not be refreshed. Existing saved details were not changed.",
      );
    }
  });

  app.get("/api/v1/alerts", async (context) => {
    const { ownerSessionId, repository } = await lifecycleDependencies(context);
    return context.json({
      data: await repository.listAlerts(ownerSessionId),
      requestId: context.get("requestId"),
    });
  });

  app.post("/api/v1/alerts/:id/dismiss", async (context) => {
    const { ownerSessionId, repository } = await lifecycleDependencies(context);
    const dismissed = await repository.dismissAlert(
      ownerSessionId,
      context.req.param("id"),
    );
    return dismissed
      ? context.json({
          data: { dismissed: true },
          requestId: context.get("requestId"),
        })
      : apiError(
          context,
          404,
          "ALERT_NOT_FOUND",
          "This alert is not available.",
        );
  });

  app.get("/api/v1/help-requests", async (context) => {
    const { ownerSessionId, repository } = await lifecycleDependencies(context);
    return context.json({
      data: await repository.listHelpRequests(ownerSessionId),
      staffedService: false,
      requestId: context.get("requestId"),
    });
  });

  app.post("/api/v1/help-requests", async (context) => {
    try {
      const input = parseHelpRequest(await context.req.json<unknown>());
      const { ownerSessionId, repository } =
        await lifecycleDependencies(context);
      const request = await repository.createHelpRequest(
        ownerSessionId,
        input.reservationId,
        input.message,
        context.get("requestId"),
      );
      return context.json(
        {
          data: request,
          staffedService: false,
          notice:
            "This creates an inspectable demo record; Scout does not claim staffed human support.",
          requestId: context.get("requestId"),
        },
        201,
      );
    } catch {
      return apiError(
        context,
        400,
        "INVALID_HELP_REQUEST",
        "Enter 5–500 characters and choose only one of your plans.",
      );
    }
  });

  app.post("/api/v1/ops/session", async (context) => {
    const configuredToken = context.env.OPS_ACCESS_TOKEN;
    if (!configuredToken || configuredToken.length < 24)
      return apiError(
        context,
        503,
        "OPS_NOT_CONFIGURED",
        "Operations access is not configured.",
      );
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
    const candidate =
      typeof body === "object" &&
      body !== null &&
      "accessToken" in body &&
      typeof body.accessToken === "string"
        ? body.accessToken
        : "";
    const session = await createOpsSession(candidate, configuredToken, clock());
    if (!session)
      return apiError(
        context,
        401,
        "OPS_UNAUTHORIZED",
        "The operations access token is invalid.",
      );
    context.header(
      "set-cookie",
      opsSessionCookie(
        session,
        context.env.APP_ENV === "preview" ||
          context.env.APP_ENV === "production",
      ),
    );
    return context.json({
      data: { authenticated: true, expiresInSeconds: 3600 },
      requestId: context.get("requestId"),
    });
  });

  app.delete("/api/v1/ops/session", async (context) => {
    context.header("set-cookie", opsSessionCookie("expired", false, 0));
    return context.json({
      data: { authenticated: false },
      requestId: context.get("requestId"),
    });
  });

  app.get("/api/v1/ops/summary", async (context) => {
    if (!(await authorizedOperations(context)))
      return apiError(
        context,
        401,
        "OPS_UNAUTHORIZED",
        "Operator authentication is required.",
      );
    return context.json({
      data: await operationsRepository(context).summary(),
      requestId: context.get("requestId"),
    });
  });

  app.get("/api/v1/ops/timeline", async (context) => {
    if (!(await authorizedOperations(context)))
      return apiError(
        context,
        401,
        "OPS_UNAUTHORIZED",
        "Operator authentication is required.",
      );
    let query;
    try {
      query = parseOperationsTimelineQuery({
        correlationId: context.req.query("correlationId"),
        limit: context.req.query("limit"),
      });
    } catch {
      return apiError(
        context,
        400,
        "INVALID_OPERATIONS_QUERY",
        "Check the operations timeline filters.",
      );
    }
    return context.json({
      data: await operationsRepository(context).timeline(query),
      redacted: true,
      requestId: context.get("requestId"),
    });
  });

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
    const providerStartedAt = Date.now();
    try {
      providerCheckout = await provider.createCheckout({
        checkoutId,
        reservationId: candidate.reservationId,
        eventName: candidate.eventName,
        successUrl: `${origin}/?checkout=return&session_id={CHECKOUT_SESSION_ID}#plans`,
        cancelUrl: `${origin}/?checkout=cancelled#plans`,
        idempotencyKey: `checkout:${ownerSessionId}:${body.idempotencyKey}`,
      });
      const latencyMs = Date.now() - providerStartedAt;
      await recordOperations(context, {
        tool: {
          name: "create_sandbox_checkout",
          provider: "stripe",
          status: "completed",
          latencyMs,
          correlationId: context.get("requestId"),
          metadata: { mode: "sandbox" },
        },
        provider: {
          provider: "stripe",
          status: "healthy",
          latencyMs,
          failureCategory: null,
          correlationId: context.get("requestId"),
        },
      });
    } catch (error) {
      if (error instanceof PaymentProviderError) {
        await recordOperations(context, {
          tool: {
            name: "create_sandbox_checkout",
            provider: "stripe",
            status: "failed",
            latencyMs: Date.now() - providerStartedAt,
            correlationId: context.get("requestId"),
            metadata: { mode: "sandbox" },
          },
          provider: {
            provider: "stripe",
            status: "unavailable",
            latencyMs: Date.now() - providerStartedAt,
            failureCategory: error.category,
            correlationId: context.get("requestId"),
          },
        });
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
    const providerStartedAt = Date.now();
    try {
      refund = await provider.createRefund({
        checkoutId: candidate.checkoutId,
        paymentId: candidate.providerPaymentId,
        idempotencyKey: `refund:${candidate.checkoutId}:${body.idempotencyKey}`,
      });
      const latencyMs = Date.now() - providerStartedAt;
      await recordOperations(context, {
        tool: {
          name: "create_test_refund",
          provider: "stripe",
          status: "completed",
          latencyMs,
          correlationId: context.get("requestId"),
          metadata: { mode: "sandbox" },
        },
        provider: {
          provider: "stripe",
          status: "healthy",
          latencyMs,
          failureCategory: null,
          correlationId: context.get("requestId"),
        },
      });
    } catch (error) {
      if (error instanceof PaymentProviderError) {
        await recordOperations(context, {
          tool: {
            name: "create_test_refund",
            provider: "stripe",
            status: "failed",
            latencyMs: Date.now() - providerStartedAt,
            correlationId: context.get("requestId"),
            metadata: { mode: "sandbox" },
          },
          provider: {
            provider: "stripe",
            status: "unavailable",
            latencyMs: Date.now() - providerStartedAt,
            failureCategory: error.category,
            correlationId: context.get("requestId"),
          },
        });
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
