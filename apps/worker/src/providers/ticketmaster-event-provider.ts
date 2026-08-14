import {
  EventProviderError,
  type EventProvider,
  type EventSearchConstraints,
  type EventSummary,
  type ProviderSearchResult,
} from "@scout/core";

const API_URL = "https://app.ticketmaster.com/discovery/v2/events.json";
const EVENT_API_URL = "https://app.ticketmaster.com/discovery/v2/events";
const classifications = {
  music: "Music",
  sports: "Sports",
  arts: "Arts & Theatre",
  comedy: "Comedy",
  family: "Family",
} as const;

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value
        .map(record)
        .filter((item): item is Record<string, unknown> => item !== null)
    : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function classificationText(value: unknown): string | null {
  const candidate = text(value);
  return candidate && !/^(?:undefined|null|unknown)$/i.test(candidate)
    ? candidate
    : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nested(value: unknown, ...keys: string[]) {
  let current: unknown = value;
  for (const key of keys) current = record(current)?.[key];
  return current;
}

function safeHttpsUrl(value: unknown): string | null {
  const candidate = text(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function preferredImage(rawEvent: Record<string, unknown>) {
  return records(rawEvent.images)
    .map((image) => ({
      url: safeHttpsUrl(image.url),
      width: number(image.width),
      height: number(image.height),
      ratio: text(image.ratio),
    }))
    .filter((image) => image.url)
    .sort(
      (left, right) =>
        Number(right.ratio === "16_9") - Number(left.ratio === "16_9") ||
        (right.width ?? 0) - (left.width ?? 0),
    )[0];
}

export function normalizeTicketmasterEvent(
  value: unknown,
  observedAt: string,
): EventSummary | null {
  const event = record(value);
  if (!event) return null;

  const id = text(event.id);
  const name = text(event.name);
  const providerUrl = safeHttpsUrl(event.url);
  const localDate = text(nested(event, "dates", "start", "localDate"));
  if (!id || !name || !providerUrl || !localDate) return null;

  const venue = records(nested(event, "_embedded", "venues"))[0];
  const attraction = records(nested(event, "_embedded", "attractions"))[0];
  const classification = records(event.classifications)[0];
  const priceRange = records(event.priceRanges)[0];
  const minimum = number(priceRange?.min);
  const maximum = number(priceRange?.max);
  const currency = text(priceRange?.currency);
  const image = preferredImage(event);

  return {
    id,
    source: "ticketmaster",
    name,
    attractionId: text(attraction?.id),
    providerUrl,
    startsAt: text(nested(event, "dates", "start", "dateTime")),
    localDate,
    localTime: text(nested(event, "dates", "start", "localTime")),
    timezone: text(nested(event, "dates", "timezone")),
    venue: {
      name: text(venue?.name),
      city: text(nested(venue, "city", "name")),
      stateCode: text(nested(venue, "state", "stateCode")),
    },
    observedAt,
    status: text(nested(event, "dates", "status", "code")),
    classification: {
      segment: classificationText(nested(classification, "segment", "name")),
      genre: classificationText(nested(classification, "genre", "name")),
      subGenre: classificationText(nested(classification, "subGenre", "name")),
    },
    image: image?.url
      ? { url: image.url, width: image.width, height: image.height }
      : null,
    price:
      minimum !== null && maximum !== null && currency
        ? { minimum, maximum, currency }
        : null,
  };
}

function dayAfter(date: string) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

export class TicketmasterEventProvider implements EventProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: Fetcher = (input, init) => fetch(input, init),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async search(
    constraints: EventSearchConstraints,
  ): Promise<ProviderSearchResult> {
    const url = new URL(API_URL);
    url.search = new URLSearchParams({
      apikey: this.apiKey,
      city: constraints.city,
      stateCode: "NY",
      countryCode: "US",
      startDateTime: `${constraints.startDate}T00:00:00Z`,
      endDateTime: `${dayAfter(constraints.endDate)}T05:00:00Z`,
      includeTBA: "no",
      includeTBD: "no",
      size: "100",
      page: "0",
      sort: "date,asc",
    }).toString();
    if (constraints.category !== "all") {
      url.searchParams.set(
        "classificationName",
        classifications[constraints.category],
      );
    }

    let response: Response;
    try {
      response = await this.fetcher(url, {
        headers: { accept: "application/json" },
      });
    } catch {
      throw new EventProviderError("unavailable");
    }

    if (response.status === 429) throw new EventProviderError("rate_limited");
    if (response.status === 401 || response.status === 403) {
      throw new EventProviderError("unauthorized");
    }
    if (!response.ok) throw new EventProviderError("unavailable");

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new EventProviderError("invalid_response");
    }

    const observedAt = this.clock().toISOString();
    const embeddedEvents = records(nested(payload, "_embedded", "events"));
    return {
      mode: "live",
      observedAt,
      events: embeddedEvents
        .map((event) => normalizeTicketmasterEvent(event, observedAt))
        .filter((event): event is EventSummary => event !== null),
    };
  }

  async status(eventId: string): Promise<string | null> {
    const url = new URL(`${EVENT_API_URL}/${encodeURIComponent(eventId)}.json`);
    url.searchParams.set("apikey", this.apiKey);
    let response: Response;
    try {
      response = await this.fetcher(url, {
        headers: { accept: "application/json" },
      });
    } catch {
      throw new EventProviderError("unavailable");
    }
    if (response.status === 429) throw new EventProviderError("rate_limited");
    if (response.status === 401 || response.status === 403)
      throw new EventProviderError("unauthorized");
    if (!response.ok) throw new EventProviderError("unavailable");
    const payload = await response.json<unknown>();
    return text(nested(payload, "dates", "status", "code"));
  }
}
