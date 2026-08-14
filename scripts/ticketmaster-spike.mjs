import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  analyzeCity,
  evaluateGates,
  sanitizeEvent,
  selectLaunchCity,
} from "../spike/ticketmaster-analysis.mjs";

const API_ROOT = "https://app.ticketmaster.com/discovery/v2/events.json";
const PAGE_SIZE = 200;
const MAX_EVENTS_PER_CITY = 1_000;
const REQUEST_INTERVAL_MS = 600;
const CITIES = [
  { city: "Boston", stateCode: "MA" },
  { city: "New York", stateCode: "NY" },
  { city: "Philadelphia", stateCode: "PA" },
];

function parseEnv(contents) {
  return Object.fromEntries(
    contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

async function loadApiKey() {
  if (process.env.TICKETMASTER_API_KEY) return process.env.TICKETMASTER_API_KEY;
  const env = parseEnv(await readFile(resolve(".env.local"), "utf8"));
  const key = env.TICKETMASTER_API_KEY;
  if (!key || key === "PASTE_YOUR_CONSUMER_KEY_HERE") {
    throw new Error("TICKETMASTER_API_KEY is missing from .env.local");
  }
  return key;
}

function isoWithoutMilliseconds(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function wait(milliseconds) {
  return new Promise((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds),
  );
}

async function fetchPage({
  apiKey,
  city,
  stateCode,
  startDateTime,
  endDateTime,
  page,
}) {
  const url = new URL(API_ROOT);
  url.search = new URLSearchParams({
    apikey: apiKey,
    city,
    stateCode,
    countryCode: "US",
    startDateTime,
    endDateTime,
    size: String(PAGE_SIZE),
    page: String(page),
    sort: "date,asc",
  });

  const startedAt = performance.now();
  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });
  const latencyMs = Math.round(performance.now() - startedAt);
  if (!response.ok) {
    throw Object.assign(
      new Error(`Ticketmaster returned HTTP ${response.status}`),
      {
        status: response.status,
        latencyMs,
      },
    );
  }
  return { payload: await response.json(), latencyMs };
}

async function collectCity({
  apiKey,
  city,
  stateCode,
  startDateTime,
  endDateTime,
}) {
  const events = [];
  const requests = [];
  let reportedTotal = 0;
  let pagesToFetch = 1;

  for (let page = 0; page < pagesToFetch; page += 1) {
    if (page > 0) await wait(REQUEST_INTERVAL_MS);
    try {
      const { payload, latencyMs } = await fetchPage({
        apiKey,
        city,
        stateCode,
        startDateTime,
        endDateTime,
        page,
      });
      requests.push({ page, ok: true, latencyMs });
      reportedTotal = payload.page?.totalElements ?? 0;
      const totalPages = payload.page?.totalPages ?? 1;
      pagesToFetch = Math.min(
        totalPages,
        Math.ceil(MAX_EVENTS_PER_CITY / PAGE_SIZE),
      );
      events.push(...(payload._embedded?.events ?? []));
    } catch (error) {
      requests.push({
        page,
        ok: false,
        latencyMs: error.latencyMs ?? null,
        status: error.status ?? null,
      });
      throw new Error(`${city} request failed: ${error.message}`);
    }
  }

  return { city, reportedTotal, events, requests };
}

function booleanMark(value) {
  return value ? "PASS" : "FAIL";
}

function buildMarkdown({
  generatedAt,
  window,
  cityReports,
  gateResults,
  recommendation,
}) {
  const rows = cityReports.map((report) => {
    const gates = gateResults.find((result) => result.city === report.city);
    return `| ${report.city} | ${report.reportedTotal} | ${report.sampledEventCount} | ${report.uniqueUsefulCategoryCount} | ${report.completeness.venueDateProviderUrl}% | ${report.completeness.priceRanges}% | ${report.completeness.usefulImage}% | ${report.demoSuitableCount} | ${report.apparentDuplicateRate}% | ${booleanMark(gates.passes)} |`;
  });

  const details = cityReports
    .map((report) => {
      const categories = Object.entries(report.categoryCounts)
        .slice(0, 12)
        .map(([name, count]) => `- ${name}: ${count}`)
        .join("\n");
      return `## ${report.city}\n\n- Provider-reported events: ${report.reportedTotal}\n- Events analyzed: ${report.sampledEventCount}\n- Coordinate completeness: ${report.completeness.coordinates}%\n- Missing-image rate: ${report.completeness.missingImage}%\n- Potential fallback-image rate: ${report.completeness.potentialFallbackImage}%\n- Statuses: ${JSON.stringify(report.statusCounts)}\n- Problem status events: ${report.problemStatusCount}\n- Checkout-suitable events with provider price data: ${report.checkoutSuitableCount}\n- Requests: ${report.requests.attempted}; failures: ${report.requests.failed}; average latency: ${report.requests.averageLatencyMs} ms; maximum latency: ${report.requests.maximumLatencyMs} ms\n\nTop categories:\n\n${categories}`;
    })
    .join("\n\n");

  return `# Ticketmaster data-quality spike\n\nGenerated: ${generatedAt}\n\nWindow: ${window.start} through ${window.end}\n\n## Decision\n\n**${recommendation}**\n\nThe automated image check treats a non-placeholder image at least 640 px wide as useful. Generic artwork can only be confirmed by manual visual review. Price ranges are optional provider data and are not treated as final checkout prices.\n\n| City | Reported | Analyzed | Categories | Core complete | Price present | Useful image | Demo-suitable | Duplicate rate | Gates |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---|\n${rows.join("\n")}\n\n${details}\n`;
}

async function main() {
  const apiKey = await loadApiKey();
  const now = new Date();
  const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000);
  const window = {
    start: isoWithoutMilliseconds(now),
    end: isoWithoutMilliseconds(end),
  };
  const collected = [];

  for (const city of CITIES) {
    process.stdout.write(`Analyzing ${city.city}... `);
    const result = await collectCity({
      apiKey,
      ...city,
      startDateTime: window.start,
      endDateTime: window.end,
    });
    collected.push(result);
    console.log(`${result.events.length} events sampled`);
    await wait(REQUEST_INTERVAL_MS);
  }

  const cityReports = collected.map(analyzeCity);
  const gateResults = evaluateGates(cityReports);
  const passingCities = gateResults
    .filter((result) => result.passes)
    .map((result) => result.city);
  const launchCity = selectLaunchCity(cityReports, gateResults);
  const recommendation = launchCity
    ? `GO — continue with the event vertical and use ${launchCity} as the launch city. All passing candidates: ${passingCities.join(", ")}.`
    : "NO-GO — no city passes every initial acceptance gate; review the evidence before scaffolding the product.";
  const generatedAt = new Date().toISOString();
  const report = {
    generatedAt,
    window,
    recommendation,
    launchCity,
    gateResults,
    cities: cityReports,
  };
  const samples = Object.fromEntries(
    collected.map((result) => [
      result.city,
      result.events
        .filter((event) => sanitizeEvent(event))
        .slice(0, 10)
        .map(sanitizeEvent),
    ]),
  );

  const outputDirectory = resolve("reports/ticketmaster");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    resolve(outputDirectory, "data-quality-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(
    resolve(outputDirectory, "data-quality-report.md"),
    buildMarkdown({
      generatedAt,
      window,
      cityReports,
      gateResults,
      recommendation,
    }),
  );
  await writeFile(
    resolve(outputDirectory, "sanitized-samples.json"),
    `${JSON.stringify({ generatedAt, window, events: samples }, null, 2)}\n`,
  );
  console.log(recommendation);
  console.log("Reports written to reports/ticketmaster/");
}

main().catch((error) => {
  console.error(`Spike failed: ${error.message}`);
  process.exitCode = 1;
});
