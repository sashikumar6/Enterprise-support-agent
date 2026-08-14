import { describe, expect, it, vi } from "vitest";

import type { EventSearchConstraints } from "@scout/core";

import {
  normalizeTicketmasterEvent,
  TicketmasterEventProvider,
} from "./ticketmaster-event-provider";

const constraints: EventSearchConstraints = {
  city: "New York",
  startDate: "2026-08-14",
  endDate: "2026-08-20",
  category: "music",
  budgetMax: 100,
  partySize: 2,
  timePreference: "evening",
};

const rawEvent = {
  id: "tm-1",
  name: "Dizzy Gillespie All-Star Big Band",
  url: "https://www.ticketweb.com/event/tm-1",
  dates: {
    start: {
      dateTime: "2026-08-15T00:30:00Z",
      localDate: "2026-08-14",
      localTime: "20:30:00",
    },
    timezone: "America/New_York",
    status: { code: "onsale" },
  },
  classifications: [
    {
      segment: { name: "Music" },
      genre: { name: "Jazz" },
      subGenre: { name: "Jazz" },
    },
  ],
  priceRanges: [{ min: 38.1, max: 54.99, currency: "USD" }],
  images: [
    {
      url: "https://example.com/small.jpg",
      width: 305,
      height: 225,
      ratio: "4_3",
    },
    {
      url: "https://example.com/wide.jpg",
      width: 1136,
      height: 639,
      ratio: "16_9",
    },
  ],
  _embedded: {
    venues: [
      {
        name: "Blue Note Jazz Club",
        city: { name: "New York" },
        state: { stateCode: "NY" },
      },
    ],
  },
};

describe("TicketmasterEventProvider", () => {
  it("normalizes only provider facts and prefers a wide image", () => {
    expect(
      normalizeTicketmasterEvent(rawEvent, "2026-08-13T12:00:00Z"),
    ).toMatchObject({
      id: "tm-1",
      source: "ticketmaster",
      localDate: "2026-08-14",
      venue: { name: "Blue Note Jazz Club", city: "New York" },
      price: { minimum: 38.1, maximum: 54.99, currency: "USD" },
      image: { url: "https://example.com/wide.jpg" },
    });
  });

  it("builds a bounded server-side request and returns normalized events", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ _embedded: { events: [rawEvent] } }),
    );
    const provider = new TicketmasterEventProvider(
      "test-consumer-key",
      fetcher,
      () => new Date("2026-08-13T12:00:00Z"),
    );

    const result = await provider.search(constraints);
    const requestedUrl = new URL(String(fetcher.mock.calls[0]![0]));

    expect(requestedUrl.searchParams.get("apikey")).toBe("test-consumer-key");
    expect(requestedUrl.searchParams.get("classificationName")).toBe("Music");
    expect(requestedUrl.searchParams.get("size")).toBe("100");
    expect(result).toMatchObject({ mode: "live", events: [{ id: "tm-1" }] });
  });

  it("maps upstream rate limits without leaking the response body", async () => {
    const provider = new TicketmasterEventProvider(
      "test-consumer-key",
      async () => new Response("provider detail", { status: 429 }),
    );

    await expect(provider.search(constraints)).rejects.toMatchObject({
      failure: "rate_limited",
    });
  });

  it("treats a successful response with no events as an empty live result", async () => {
    const provider = new TicketmasterEventProvider(
      "test-consumer-key",
      async () => Response.json({ page: { totalElements: 0 } }),
    );

    await expect(provider.search(constraints)).resolves.toMatchObject({
      mode: "live",
      events: [],
    });
  });
});
