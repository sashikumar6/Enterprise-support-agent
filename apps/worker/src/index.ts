import { Hono } from "hono";

import type { Bindings } from "./env";
import { validateEnvironment } from "./env";
import { apiError, type AppVariables } from "./http";

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

export { app };
export default app;
