import type {
  EventProvider,
  EventSearchConstraints,
  EventSearchResult,
  EventSummary,
} from "./events";

const fixtureEvents: EventSummary[] = [
  {
    id: "fixture-broadway-evening",
    source: "fixture",
    name: "Broadway Evening — Demo Event",
    startsAt: "2026-09-04T19:30:00-04:00",
    venueName: "Scout Demo Theatre",
    city: "New York",
    providerUrl: "https://example.com/scout-demo-event",
    observedAt: "2026-08-13T12:00:00Z",
    price: null,
  },
];

export class FixtureEventProvider implements EventProvider {
  async search(
    constraints: EventSearchConstraints,
  ): Promise<EventSearchResult> {
    const city = constraints.city.trim().toLocaleLowerCase();
    const events = fixtureEvents.filter(
      (event) => event.city.toLocaleLowerCase() === city,
    );

    return {
      mode: "fixture",
      events,
      observedAt: new Date().toISOString(),
    };
  }
}
