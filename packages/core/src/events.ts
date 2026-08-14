export type EventSource = "ticketmaster" | "fixture";
export type DiscoveryMode = "live" | "fixture";
export type EventCategory =
  "all" | "music" | "sports" | "arts" | "comedy" | "family";
export type TimePreference = "any" | "daytime" | "evening";

export interface EventSearchConstraints {
  city: "New York";
  startDate: string;
  endDate: string;
  category: EventCategory;
  budgetMax: number | null;
  partySize: number;
  timePreference: TimePreference;
}

export interface EventSummary {
  id: string;
  source: EventSource;
  name: string;
  startsAt: string | null;
  localDate: string;
  localTime: string | null;
  timezone: string | null;
  venue: {
    name: string | null;
    city: string | null;
    stateCode: string | null;
  };
  providerUrl: string;
  observedAt: string;
  status: string | null;
  classification: {
    segment: string | null;
    genre: string | null;
    subGenre: string | null;
  };
  image: { url: string; width: number | null; height: number | null } | null;
  price: { minimum: number; maximum: number; currency: string } | null;
}

export interface ProviderSearchResult {
  mode: DiscoveryMode;
  events: EventSummary[];
  observedAt: string;
}

export interface RankedEvent extends EventSummary {
  score: number;
  scoreReasons: string[];
}

export interface EventSearchResult {
  mode: DiscoveryMode;
  requestedMode: DiscoveryMode;
  events: RankedEvent[];
  observedAt: string;
  fallbackReason:
    | "missing_key"
    | "invalid_credentials"
    | "rate_limited"
    | "unavailable"
    | null;
}

export interface EventProvider {
  search(constraints: EventSearchConstraints): Promise<ProviderSearchResult>;
}
