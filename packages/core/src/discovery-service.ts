import type {
  DiscoveryMode,
  EventProvider,
  EventSearchConstraints,
  EventSearchResult,
} from "./events";
import { EventProviderError } from "./provider-error";
import { rankEventResults } from "./ranking";

export class DiscoveryService {
  constructor(
    private readonly fixtureProvider: EventProvider,
    private readonly liveProvider: EventProvider | null,
  ) {}

  async search(
    constraints: EventSearchConstraints,
    requestedMode: DiscoveryMode,
  ): Promise<EventSearchResult> {
    if (requestedMode === "fixture" || !this.liveProvider) {
      const result = await this.fixtureProvider.search(constraints);
      const ranked = rankEventResults(result.events, constraints);
      return {
        ...result,
        requestedMode,
        ...ranked,
        fallbackReason: requestedMode === "live" ? "missing_key" : null,
      };
    }

    try {
      const result = await this.liveProvider.search(constraints);
      const ranked = rankEventResults(result.events, constraints);
      return {
        ...result,
        requestedMode,
        ...ranked,
        fallbackReason: null,
      };
    } catch (error) {
      const result = await this.fixtureProvider.search(constraints);
      const ranked = rankEventResults(result.events, constraints);
      const fallbackReason =
        error instanceof EventProviderError
          ? {
              unauthorized: "invalid_credentials" as const,
              rate_limited: "rate_limited" as const,
              unavailable: "unavailable" as const,
              invalid_response: "unavailable" as const,
            }[error.failure]
          : "unavailable";
      return {
        ...result,
        requestedMode,
        ...ranked,
        fallbackReason,
      };
    }
  }
}
