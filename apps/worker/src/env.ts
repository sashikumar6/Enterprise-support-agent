export interface Bindings {
  APP_ENV: string;
  ASSETS: Fetcher;
  DB: D1Database;
  TICKETMASTER_API_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  OPS_ACCESS_TOKEN?: string;
  COSTLY_RATE_LIMITER?: RateLimit;
  MUTATION_RATE_LIMITER?: RateLimit;
  AUTH_RATE_LIMITER?: RateLimit;
  AI?: {
    run(model: string, input: unknown, options?: unknown): Promise<unknown>;
  };
}

const allowedEnvironments = new Set([
  "development",
  "preview",
  "production",
  "test",
]);

export function validateEnvironment(bindings: Bindings): void {
  if (!allowedEnvironments.has(bindings.APP_ENV)) {
    throw new Error(
      "APP_ENV must be development, preview, production, or test",
    );
  }

  if (!bindings.DB) {
    throw new Error("DB binding is required");
  }

  if (
    (bindings.APP_ENV === "preview" || bindings.APP_ENV === "production") &&
    (!bindings.COSTLY_RATE_LIMITER ||
      !bindings.MUTATION_RATE_LIMITER ||
      !bindings.AUTH_RATE_LIMITER)
  ) {
    throw new Error("Release environments require every rate-limit binding");
  }
}
