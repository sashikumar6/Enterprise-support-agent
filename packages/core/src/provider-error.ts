export type ProviderFailure =
  "unauthorized" | "rate_limited" | "unavailable" | "invalid_response";

export class EventProviderError extends Error {
  constructor(readonly failure: ProviderFailure) {
    super(`Event provider failed: ${failure}`);
    this.name = "EventProviderError";
  }
}
