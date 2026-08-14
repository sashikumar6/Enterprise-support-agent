import { describe, expect, it } from "vitest";

import { parseOperationsTimelineQuery } from "./operations";

describe("operations timeline validation", () => {
  it("normalizes an empty query", () => {
    expect(parseOperationsTimelineQuery({})).toEqual({
      correlationId: null,
      limit: 50,
    });
  });

  it("accepts bounded correlation filters", () => {
    expect(
      parseOperationsTimelineQuery({
        correlationId: "request:phase8-1",
        limit: "25",
      }),
    ).toEqual({ correlationId: "request:phase8-1", limit: 25 });
  });

  it.each([
    { correlationId: "contains spaces" },
    { correlationId: "x".repeat(129) },
    { limit: 0 },
    { limit: 101 },
    { limit: "not-a-number" },
  ])("rejects malformed filters: %j", (input) => {
    expect(() => parseOperationsTimelineQuery(input)).toThrow();
  });
});
