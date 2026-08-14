export interface Bindings {
  APP_ENV: string;
  ASSETS: Fetcher;
  DB: D1Database;
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
}
