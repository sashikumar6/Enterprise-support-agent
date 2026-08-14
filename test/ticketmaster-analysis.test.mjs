import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeCity,
  evaluateGates,
  sanitizeEvent,
  selectLaunchCity,
} from "../spike/ticketmaster-analysis.mjs";

function event(overrides = {}) {
  return {
    id: overrides.id ?? "event-1",
    name: overrides.name ?? "Example Concert",
    url:
      overrides.url === undefined
        ? "https://example.test/event"
        : overrides.url,
    dates: {
      start: { dateTime: overrides.dateTime ?? "2026-09-01T20:00:00Z" },
      status: { code: overrides.status ?? "onsale" },
    },
    classifications: [
      {
        segment: { name: overrides.segment ?? "Music" },
        genre: { name: "Rock" },
      },
    ],
    images: overrides.images ?? [
      { url: "https://example.test/image.jpg", width: 1024, height: 576 },
    ],
    priceRanges:
      overrides.priceRanges === undefined
        ? [{ min: 20, max: 80, currency: "USD" }]
        : overrides.priceRanges,
    _embedded: {
      venues: overrides.venues ?? [
        {
          name: "Example Hall",
          city: { name: "Boston" },
          state: { stateCode: "MA" },
          country: { countryCode: "US" },
          location: { latitude: "42.36", longitude: "-71.06" },
        },
      ],
    },
  };
}

test("analyzeCity measures completeness without inventing missing price data", () => {
  const report = analyzeCity({
    city: "Boston",
    reportedTotal: 120,
    events: [event(), event({ id: "event-2", priceRanges: [], images: [] })],
    requests: [{ ok: true, latencyMs: 100 }],
  });

  assert.equal(report.completeness.venueDateProviderUrl, 100);
  assert.equal(report.completeness.priceRanges, 50);
  assert.equal(report.completeness.usefulImage, 50);
  assert.equal(report.checkoutSuitableCount, 1);
  assert.equal(report.demoSuitableCount, 1);
});

test("analyzeCity flags apparent duplicates by name, date, and venue", () => {
  const report = analyzeCity({
    city: "Boston",
    reportedTotal: 2,
    events: [event(), event({ id: "event-2", name: "EXAMPLE concert!" })],
    requests: [],
  });

  assert.equal(report.apparentDuplicateCount, 1);
  assert.equal(report.apparentDuplicateRate, 50);
});

test("evaluateGates requires every documented numeric gate", () => {
  const passing = {
    city: "Boston",
    reportedTotal: 100,
    uniqueUsefulCategoryCount: 5,
    completeness: { venueDateProviderUrl: 80 },
    demoSuitableCount: 30,
  };
  const [result] = evaluateGates([passing]);
  assert.equal(result.passes, true);

  const [failing] = evaluateGates([{ ...passing, demoSuitableCount: 29 }]);
  assert.equal(failing.passes, false);
});

test("sanitizeEvent keeps normalized public fields only", () => {
  const sanitized = sanitizeEvent({
    ...event(),
    secretField: "must-not-survive",
  });
  assert.equal(sanitized.provider, "ticketmaster");
  assert.equal(sanitized.priceRange.currency, "USD");
  assert.equal("secretField" in sanitized, false);
});

test("selectLaunchCity prefers the passing city with more priced demo candidates", () => {
  const reports = [
    { city: "Boston", checkoutSuitableCount: 7, reportedTotal: 445 },
    { city: "New York", checkoutSuitableCount: 101, reportedTotal: 3579 },
    { city: "Philadelphia", checkoutSuitableCount: 24, reportedTotal: 229 },
  ];
  const gates = reports.map((report) => ({ city: report.city, passes: true }));

  assert.equal(selectLaunchCity(reports, gates), "New York");
});
