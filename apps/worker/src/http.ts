import type { Context } from "hono";

import type { Bindings } from "./env";

export type AppContext = Context<{
  Bindings: Bindings;
  Variables: AppVariables;
}>;

export interface AppVariables {
  requestId: string;
  startedAt: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

export function apiError(
  context: AppContext,
  status: 400 | 404 | 409 | 429 | 500 | 503,
  code: string,
  message: string,
) {
  return context.json<ApiErrorBody>(
    {
      error: { code, message, requestId: context.get("requestId") },
    },
    status,
  );
}
