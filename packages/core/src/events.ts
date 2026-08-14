export type EventSource = "ticketmaster" | "fixture";

export interface EventSearchConstraints {
  city: string;
  startsAt: string;
  endsAt: string;
  category?: string;
}

export interface EventSummary {
  id: string;
  source: EventSource;
  name: string;
  startsAt: string;
  venueName: string;
  city: string;
  providerUrl: string;
  observedAt: string;
  price: { minimum: number; maximum: number; currency: string } | null;
}

export interface EventSearchResult {
  mode: "live" | "fixture";
  events: EventSummary[];
  observedAt: string;
}

export interface EventProvider {
  search(constraints: EventSearchConstraints): Promise<EventSearchResult>;
}
