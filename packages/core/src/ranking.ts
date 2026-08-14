import type {
  EventCategory,
  EventSearchConstraints,
  EventSummary,
  RankedEvent,
} from "./events";
import { EXACT_START_WINDOW_MINUTES } from "./events";

const blockedStatuses = new Set([
  "cancelled",
  "canceled",
  "postponed",
  "rescheduled",
]);

function categoryMatches(event: EventSummary, category: EventCategory) {
  if (category === "all") return true;
  const labels = [
    event.classification.segment,
    event.classification.genre,
    event.classification.subGenre,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  const terms: Record<Exclude<EventCategory, "all">, string[]> = {
    music: ["music"],
    sports: ["sport"],
    arts: ["arts", "theatre", "theater", "fine art"],
    comedy: ["comedy"],
    family: ["family", "children", "kids"],
  };
  return terms[category].some((term) => labels.includes(term));
}

function timeMatches(
  event: EventSummary,
  preference: EventSearchConstraints["timePreference"],
) {
  if (preference === "any") return true;
  if (!event.localTime) return false;
  const hour = Number(event.localTime.slice(0, 2));
  return preference === "daytime" ? hour < 17 : hour >= 17;
}

function rankOne(
  event: EventSummary,
  constraints: EventSearchConstraints,
): RankedEvent {
  let score = 40;
  const scoreReasons: string[] = [];

  if (
    constraints.category !== "all" &&
    categoryMatches(event, constraints.category)
  ) {
    score += 25;
    scoreReasons.push("Matches your category");
  }

  if (constraints.timePreference !== "any") {
    if (timeMatches(event, constraints.timePreference)) {
      score += 15;
      scoreReasons.push(`Fits your ${constraints.timePreference} preference`);
    } else if (!event.localTime) {
      scoreReasons.push("Start time is not supplied");
    }
  }

  if (
    constraints.exactStartTime &&
    event.localTime &&
    timeDistance(event, constraints.exactStartTime) <=
      EXACT_START_WINDOW_MINUTES
  ) {
    score += 15;
    scoreReasons.push(
      `Starts within ${EXACT_START_WINDOW_MINUTES} minutes of your exact time`,
    );
  }

  if (constraints.budgetMax !== null) {
    if (event.price && event.price.minimum <= constraints.budgetMax) {
      score += 20;
      scoreReasons.push("Provider minimum is within budget");
    } else if (!event.price) {
      score += 4;
      scoreReasons.push("Provider price is not supplied");
    }
  }

  if (event.status?.toLocaleLowerCase() === "onsale") {
    score += 10;
    scoreReasons.push("Provider reports tickets on sale");
  } else if (!event.status) {
    scoreReasons.push("Provider status is not supplied");
  }

  if (event.image) score += 5;
  if (scoreReasons.length === 0)
    scoreReasons.push("Fits the selected date and city");

  return { ...event, score, scoreReasons };
}

function eligibleEvents(
  events: EventSummary[],
  constraints: EventSearchConstraints,
) {
  return events.filter((event) => {
    const status = event.status?.toLocaleLowerCase();
    return (
      event.venue.city?.toLocaleLowerCase() ===
        constraints.city.toLocaleLowerCase() &&
      event.localDate >= constraints.startDate &&
      event.localDate <= constraints.endDate &&
      (!status || !blockedStatuses.has(status)) &&
      categoryMatches(event, constraints.category) &&
      (!constraints.budgetMax ||
        !event.price ||
        event.price.minimum <= constraints.budgetMax)
    );
  });
}

function minutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeDistance(event: EventSummary, exactStartTime: string) {
  return event.localTime
    ? Math.abs(minutes(event.localTime) - minutes(exactStartTime))
    : Number.POSITIVE_INFINITY;
}

function attractionGroup(event: EventSummary) {
  if (event.attractionId) return `${event.source}:${event.attractionId}`;
  return event.name
    .normalize("NFKD")
    .toLocaleLowerCase()
    .split(/\s+(?:—|–|-)\s+|[([]/, 1)[0]
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function diversify(
  ranked: RankedEvent[],
  limit: number,
  excludedGroups = new Set<string>(),
) {
  const seen = new Set(excludedGroups);
  return ranked
    .filter((event) => {
      const key = attractionGroup(event) || event.id.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function sortRanked(ranked: RankedEvent[]) {
  ranked.sort(
    (left, right) =>
      right.score - left.score ||
      left.localDate.localeCompare(right.localDate) ||
      (left.localTime ?? "99:99").localeCompare(right.localTime ?? "99:99") ||
      left.id.localeCompare(right.id),
  );
  return ranked;
}

export function rankEventResults(
  events: EventSummary[],
  constraints: EventSearchConstraints,
  limit = 12,
): { events: RankedEvent[]; alternatives: RankedEvent[] } {
  const filtered = eligibleEvents(events, constraints);
  if (!constraints.exactStartTime) {
    return {
      events: diversify(
        sortRanked(filtered.map((event) => rankOne(event, constraints))),
        limit,
      ),
      alternatives: [],
    };
  }

  const exact = filtered.filter(
    (event) =>
      timeDistance(event, constraints.exactStartTime!) <=
      EXACT_START_WINDOW_MINUTES,
  );
  const offWindow = filtered.filter(
    (event) =>
      event.localTime !== null &&
      timeDistance(event, constraints.exactStartTime!) >
        EXACT_START_WINDOW_MINUTES,
  );
  const matches = diversify(
    sortRanked(exact.map((event) => rankOne(event, constraints))),
    limit,
  );
  const matchGroups = new Set(matches.map((event) => attractionGroup(event)));
  const alternatives = offWindow.map((event) => rankOne(event, constraints));
  alternatives.sort(
    (left, right) =>
      timeDistance(left, constraints.exactStartTime!) -
        timeDistance(right, constraints.exactStartTime!) ||
      right.score - left.score ||
      left.id.localeCompare(right.id),
  );
  return {
    events: matches,
    alternatives: diversify(alternatives, 3, matchGroups),
  };
}

export function rankEvents(
  events: EventSummary[],
  constraints: EventSearchConstraints,
  limit = 12,
): RankedEvent[] {
  return rankEventResults(events, constraints, limit).events;
}
