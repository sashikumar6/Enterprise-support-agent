import { describe, expect, it } from "vitest";

import { DiscoveryService } from "./discovery-service";
import type { EventSearchConstraints, EventSummary } from "./events";
import { FixtureEventProvider } from "./fixture-event-provider";
import { EventProviderError } from "./provider-error";
import { rankEvents } from "./ranking";
import {
  normalizeSearchInput,
  SearchValidationError,
} from "./search-validation";

const constraints: EventSearchConstraints = {
  city: "New York",
  startDate: "2026-08-14",
  endDate: "2026-08-20",
  category: "music",
  budgetMax: 100,
  partySize: 2,
  timePreference: "evening",
  exactStartTime: null,
};

function event(overrides: Partial<EventSummary> = {}): EventSummary {
  return {
    id: "event-1",
    source: "ticketmaster",
    name: "Jazz Night",
    attractionId: null,
    startsAt: "2026-08-15T23:30:00Z",
    localDate: "2026-08-15",
    localTime: "19:30:00",
    timezone: "America/New_York",
    venue: { name: "Blue Note", city: "New York", stateCode: "NY" },
    providerUrl: "https://example.com/event-1",
    observedAt: "2026-08-13T12:00:00Z",
    status: "onsale",
    classification: { segment: "Music", genre: "Jazz", subGenre: "Jazz" },
    image: null,
    price: { minimum: 50, maximum: 80, currency: "USD" },
    ...overrides,
  };
}

describe("search constraint validation", () => {
  it("normalizes a bounded New York search", () => {
    expect(
      normalizeSearchInput(
        {
          city: " new york ",
          startDate: "2026-08-14",
          endDate: "2026-08-20",
          category: "music",
          budgetMax: "120",
          partySize: "2",
          timePreference: "evening",
        },
        new Date("2026-08-13T16:00:00Z"),
      ),
    ).toMatchObject({
      constraints: { city: "New York", budgetMax: 120 },
      mode: "live",
    });
  });

  it("retains a validated exact local start time without reducing it to a coarse preference", () => {
    expect(
      normalizeSearchInput(
        {
          startDate: "2026-08-14",
          endDate: "2026-08-14",
          timePreference: "any",
          exactStartTime: "17:00",
        },
        new Date("2026-08-13T16:00:00Z"),
      ),
    ).toMatchObject({
      constraints: { exactStartTime: "17:00", timePreference: "any" },
    });

    expect(() =>
      normalizeSearchInput(
        {
          startDate: "2026-08-14",
          endDate: "2026-08-14",
          exactStartTime: "5 PM",
        },
        new Date("2026-08-13T16:00:00Z"),
      ),
    ).toThrow(SearchValidationError);
  });

  it("rejects unsupported cities, past dates, and ranges over 30 days", () => {
    expect(() =>
      normalizeSearchInput(
        { city: "Boston", startDate: "2026-08-12", endDate: "2026-10-01" },
        new Date("2026-08-13T16:00:00Z"),
      ),
    ).toThrow(SearchValidationError);
  });
});

describe("deterministic ranking", () => {
  it("filters bad status, known over-budget prices, duplicates, and sorts stably", () => {
    const results = rankEvents(
      [
        event({ id: "duplicate" }),
        event(),
        event({ id: "cancelled", status: "cancelled" }),
        event({
          id: "expensive",
          price: { minimum: 150, maximum: 200, currency: "USD" },
        }),
        event({
          id: "unknown-price",
          name: "Late Jazz",
          price: null,
          localTime: "21:00:00",
        }),
      ],
      constraints,
    );

    expect(results.map((result) => result.id)).toEqual([
      "duplicate",
      "unknown-price",
    ]);
    expect(results[0].scoreReasons).toContain(
      "Provider minimum is within budget",
    );
    expect(results[1].scoreReasons).toContain("Provider price is not supplied");
  });

  it("separates exact-time matches from nearest alternatives using a 30-minute window", async () => {
    const provider = {
      search: async () => ({
        mode: "live" as const,
        observedAt: "2026-08-13T12:00:00Z",
        events: [
          event({ id: "exact", localTime: "17:30:00" }),
          event({ id: "nearest", name: "Nearby Show", localTime: "16:15:00" }),
          event({ id: "later", name: "Late Show", localTime: "19:00:00" }),
        ],
      }),
    };
    const result = await new DiscoveryService(provider, provider).search(
      { ...constraints, exactStartTime: "17:00", timePreference: "any" },
      "live",
    );

    expect(result.events.map((item) => item.id)).toEqual(["exact"]);
    expect(result.alternatives.map((item) => item.id)).toEqual([
      "nearest",
      "later",
    ]);
  });

  it("diversifies minor title variants while retaining distinct attractions", () => {
    const results = rankEvents(
      [
        event({ id: "first", name: "Blue Man Group" }),
        event({
          id: "second",
          name: "Blue Man Group — Matinee",
          localTime: "20:00:00",
        }),
        event({ id: "third", name: "The Lion King" }),
      ],
      constraints,
    );

    expect(results.map((item) => item.id)).toEqual(["first", "third"]);
  });

  it("prefers provider attraction identity when performance titles differ", () => {
    const results = rankEvents(
      [
        event({
          id: "museum-flex",
          name: "Banksy Museum - Flexiticket",
          attractionId: "banksy-museum",
        }),
        event({
          id: "museum-standard",
          name: "The Banksy Museum New York!",
          attractionId: "banksy-museum",
          localTime: "20:00:00",
        }),
      ],
      constraints,
    );

    expect(results).toHaveLength(1);
  });
});

describe("discovery service", () => {
  it("labels explicit fixtures and never invents missing prices", async () => {
    const fixture = new FixtureEventProvider(
      () => new Date("2026-08-13T12:00:00Z"),
    );
    const result = await new DiscoveryService(fixture, null).search(
      { ...constraints, category: "family", budgetMax: null },
      "fixture",
    );

    expect(result).toMatchObject({ mode: "fixture", fallbackReason: null });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ source: "fixture", price: null });
  });

  it("falls back visibly when the live provider is rate limited", async () => {
    const fixture = new FixtureEventProvider(
      () => new Date("2026-08-13T12:00:00Z"),
    );
    const live = {
      search: async () => {
        throw new EventProviderError("rate_limited");
      },
    };
    const result = await new DiscoveryService(fixture, live).search(
      constraints,
      "live",
    );

    expect(result).toMatchObject({
      mode: "fixture",
      requestedMode: "live",
      fallbackReason: "rate_limited",
    });
  });
});
