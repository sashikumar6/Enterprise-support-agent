import type {
  EventCategory,
  EventSearchConstraints,
  EventSummary,
  RankedEvent,
} from "./events";

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

export function rankEvents(
  events: EventSummary[],
  constraints: EventSearchConstraints,
  limit = 12,
): RankedEvent[] {
  const filtered = events.filter((event) => {
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

  const ranked = filtered.map((event) => rankOne(event, constraints));
  ranked.sort(
    (left, right) =>
      right.score - left.score ||
      left.localDate.localeCompare(right.localDate) ||
      (left.localTime ?? "99:99").localeCompare(right.localTime ?? "99:99") ||
      left.id.localeCompare(right.id),
  );

  const seen = new Set<string>();
  return ranked
    .filter((event) => {
      const key =
        `${event.name}|${event.localDate}|${event.localTime}|${event.venue.name}`.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}
