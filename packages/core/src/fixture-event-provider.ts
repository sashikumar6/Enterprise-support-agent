import type {
  EventProvider,
  EventSearchConstraints,
  EventSummary,
  ProviderSearchResult,
} from "./events";

function fixtureEvents(
  constraints: EventSearchConstraints,
  observedAt: string,
): EventSummary[] {
  const definitions = [
    [
      "jazz",
      "Downtown Jazz Quartet — Demo Event",
      "19:30:00",
      "Music",
      "Jazz",
      42,
    ],
    [
      "comedy",
      "Friday Night Comedy — Demo Event",
      "20:00:00",
      "Arts & Theatre",
      "Comedy",
      35,
    ],
    [
      "basketball",
      "New York Basketball Showcase — Demo Event",
      "18:30:00",
      "Sports",
      "Basketball",
      68,
    ],
    [
      "family",
      "Family Discovery Day — Demo Event",
      "13:00:00",
      "Miscellaneous",
      "Family",
      null,
    ],
    [
      "theatre",
      "Off-Broadway Stories — Demo Event",
      "19:00:00",
      "Arts & Theatre",
      "Theatre",
      null,
    ],
  ] as const;

  return definitions.map(
    ([id, name, localTime, segment, genre, price], index) => ({
      id: `fixture-${id}`,
      source: "fixture",
      name,
      startsAt: `${constraints.startDate}T${localTime}-04:00`,
      localDate: constraints.startDate,
      localTime,
      timezone: "America/New_York",
      venue: {
        name: [
          "Village Demo Hall",
          "Scout Comedy Cellar",
          "Demo Garden",
          "Scout Museum",
          "Demo Theatre",
        ][index],
        city: "New York",
        stateCode: "NY",
      },
      providerUrl: `https://example.com/scout/${id}`,
      observedAt,
      status: "onsale",
      classification: { segment, genre, subGenre: genre },
      image: null,
      price:
        price === null
          ? null
          : { minimum: price, maximum: price + 20, currency: "USD" },
    }),
  );
}

export class FixtureEventProvider implements EventProvider {
  constructor(private readonly clock: () => Date = () => new Date()) {}

  async search(
    constraints: EventSearchConstraints,
  ): Promise<ProviderSearchResult> {
    const observedAt = this.clock().toISOString();
    return {
      mode: "fixture",
      events: fixtureEvents(constraints, observedAt),
      observedAt,
    };
  }
}
