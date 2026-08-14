const ACTIVE_STATUSES = new Set(["onsale", "offsale"]);
const PROBLEM_STATUSES = new Set([
  "cancelled",
  "canceled",
  "postponed",
  "rescheduled",
]);
const FALLBACK_IMAGE_WORDS = ["default", "placeholder", "fallback", "generic"];

function first(value) {
  return Array.isArray(value) ? value[0] : undefined;
}

function venueFor(event) {
  return first(event?._embedded?.venues);
}

function normalizedText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function classificationFor(event) {
  const classification = first(event?.classifications) ?? {};
  return {
    segment: classification.segment?.name ?? null,
    genre: classification.genre?.name ?? null,
    subGenre: classification.subGenre?.name ?? null,
  };
}

function categoryFor(event) {
  const { segment, genre, subGenre } = classificationFor(event);
  return [segment, genre, subGenre]
    .filter((value) => value && normalizedText(value) !== "undefined")
    .join(" > ");
}

function hasUsefulImage(event) {
  return (event.images ?? []).some((image) => {
    const url = String(image.url ?? "").toLowerCase();
    const looksFallback = FALLBACK_IMAGE_WORDS.some((word) =>
      url.includes(word),
    );
    return Boolean(url) && !looksFallback && Number(image.width ?? 0) >= 640;
  });
}

function hasPotentialFallbackImage(event) {
  const images = event.images ?? [];
  if (images.length === 0) return false;
  return images.every((image) => {
    const url = String(image.url ?? "").toLowerCase();
    return FALLBACK_IMAGE_WORDS.some((word) => url.includes(word));
  });
}

function eventFacts(event) {
  const venue = venueFor(event);
  const status = normalizedText(event?.dates?.status?.code);
  const hasVenue = Boolean(venue?.name && venue?.city?.name);
  const hasDate = Boolean(
    event?.dates?.start?.dateTime || event?.dates?.start?.localDate,
  );
  const hasProviderUrl = Boolean(event?.url);
  const hasCoordinates = Boolean(
    venue?.location?.latitude && venue?.location?.longitude,
  );
  const hasPriceRange =
    Array.isArray(event?.priceRanges) && event.priceRanges.length > 0;
  const usefulImage = hasUsefulImage(event);
  const category = categoryFor(event);
  const coreComplete = hasVenue && hasDate && hasProviderUrl;
  const demoSuitable =
    coreComplete &&
    usefulImage &&
    Boolean(category) &&
    ACTIVE_STATUSES.has(status);

  return {
    hasVenue,
    hasDate,
    hasProviderUrl,
    hasCoordinates,
    hasPriceRange,
    usefulImage,
    potentialFallbackImage: hasPotentialFallbackImage(event),
    category,
    status: status || "missing",
    coreComplete,
    demoSuitable,
  };
}

function percent(count, total) {
  return total === 0 ? 0 : Number(((count / total) * 100).toFixed(1));
}

export function sanitizeEvent(event) {
  const venue = venueFor(event);
  const classification = classificationFor(event);
  const price = first(event.priceRanges);
  const image =
    (event.images ?? []).find(
      (candidate) => Number(candidate.width ?? 0) >= 640,
    ) ?? first(event.images);

  return {
    provider: "ticketmaster",
    providerEventId: event.id ?? null,
    name: event.name ?? null,
    providerUrl: event.url ?? null,
    start: {
      dateTime: event.dates?.start?.dateTime ?? null,
      localDate: event.dates?.start?.localDate ?? null,
      localTime: event.dates?.start?.localTime ?? null,
      timezone: event.dates?.timezone ?? null,
      status: event.dates?.status?.code ?? null,
    },
    venue: {
      name: venue?.name ?? null,
      city: venue?.city?.name ?? null,
      stateCode: venue?.state?.stateCode ?? null,
      countryCode: venue?.country?.countryCode ?? null,
      latitude: venue?.location?.latitude ?? null,
      longitude: venue?.location?.longitude ?? null,
    },
    classification,
    priceRange: price
      ? {
          min: price.min ?? null,
          max: price.max ?? null,
          currency: price.currency ?? null,
        }
      : null,
    image: image
      ? {
          url: image.url ?? null,
          width: image.width ?? null,
          height: image.height ?? null,
        }
      : null,
  };
}

export function analyzeCity({ city, reportedTotal, events, requests }) {
  const uniqueEvents = new Map(events.map((event) => [event.id, event]));
  const sampledEvents = [...uniqueEvents.values()];
  const facts = sampledEvents.map(eventFacts);
  const duplicateKeys = new Map();

  sampledEvents.forEach((event) => {
    const venue = venueFor(event);
    const key = [
      event.name,
      event.dates?.start?.dateTime ?? event.dates?.start?.localDate,
      venue?.name,
    ]
      .map(normalizedText)
      .join("|");
    duplicateKeys.set(key, (duplicateKeys.get(key) ?? 0) + 1);
  });

  const apparentDuplicateCount = [...duplicateKeys.values()].reduce(
    (total, count) => total + Math.max(0, count - 1),
    0,
  );
  const categoryCounts = {};
  const statusCounts = {};

  facts.forEach((fact) => {
    if (fact.category)
      categoryCounts[fact.category] = (categoryCounts[fact.category] ?? 0) + 1;
    statusCounts[fact.status] = (statusCounts[fact.status] ?? 0) + 1;
  });

  const count = sampledEvents.length;
  const numberWith = (property) =>
    facts.filter((fact) => fact[property]).length;
  const latencies = requests
    .map((request) => request.latencyMs)
    .filter(Number.isFinite);

  return {
    city,
    reportedTotal,
    sampledEventCount: count,
    uniqueUsefulCategoryCount: Object.keys(categoryCounts).length,
    categoryCounts: Object.fromEntries(
      Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]),
    ),
    completeness: {
      venueDateProviderUrl: percent(numberWith("coreComplete"), count),
      coordinates: percent(numberWith("hasCoordinates"), count),
      priceRanges: percent(numberWith("hasPriceRange"), count),
      usefulImage: percent(numberWith("usefulImage"), count),
      missingImage: percent(
        sampledEvents.filter((event) => (event.images ?? []).length === 0)
          .length,
        count,
      ),
      potentialFallbackImage: percent(
        numberWith("potentialFallbackImage"),
        count,
      ),
    },
    statusCounts,
    problemStatusCount: facts.filter((fact) =>
      PROBLEM_STATUSES.has(fact.status),
    ).length,
    apparentDuplicateCount,
    apparentDuplicateRate: percent(apparentDuplicateCount, count),
    demoSuitableCount: numberWith("demoSuitable"),
    checkoutSuitableCount: facts.filter(
      (fact) => fact.demoSuitable && fact.hasPriceRange,
    ).length,
    requests: {
      attempted: requests.length,
      failed: requests.filter((request) => !request.ok).length,
      averageLatencyMs: latencies.length
        ? Math.round(
            latencies.reduce((sum, latency) => sum + latency, 0) /
              latencies.length,
          )
        : null,
      maximumLatencyMs: latencies.length ? Math.max(...latencies) : null,
    },
  };
}

export function evaluateGates(cityReports) {
  return cityReports.map((report) => {
    const gates = {
      upcomingResults: report.reportedTotal >= 100,
      usefulCategories: report.uniqueUsefulCategoryCount >= 5,
      coreCompleteness: report.completeness.venueDateProviderUrl >= 80,
      demoSuitableEvents: report.demoSuitableCount >= 30,
    };
    return {
      city: report.city,
      gates,
      passes: Object.values(gates).every(Boolean),
    };
  });
}

export function selectLaunchCity(cityReports, gateResults) {
  const passingCities = new Set(
    gateResults.filter((result) => result.passes).map((result) => result.city),
  );
  return (
    cityReports
      .filter((report) => passingCities.has(report.city))
      .sort(
        (left, right) =>
          right.checkoutSuitableCount - left.checkoutSuitableCount ||
          right.reportedTotal - left.reportedTotal,
      )[0]?.city ?? null
  );
}
