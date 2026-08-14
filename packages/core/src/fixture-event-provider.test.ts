import { describe, expect, it } from "vitest";

import { FixtureEventProvider } from "./fixture-event-provider";

describe("FixtureEventProvider", () => {
  it("labels results as fixtures and never invents a provider price", async () => {
    const provider = new FixtureEventProvider();

    const result = await provider.search({
      city: " New York ",
      startsAt: "2026-09-01T00:00:00-04:00",
      endsAt: "2026-09-30T23:59:59-04:00",
    });

    expect(result.mode).toBe("fixture");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ source: "fixture", price: null });
  });
});
