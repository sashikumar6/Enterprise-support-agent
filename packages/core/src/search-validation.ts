import type {
  DiscoveryMode,
  EventCategory,
  EventSearchConstraints,
  TimePreference,
} from "./events";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const categories = new Set<EventCategory>([
  "all",
  "music",
  "sports",
  "arts",
  "comedy",
  "family",
]);
const timePreferences = new Set<TimePreference>(["any", "daytime", "evening"]);

export interface EventSearchInput {
  city?: string;
  startDate?: string;
  endDate?: string;
  category?: string;
  budgetMax?: string;
  partySize?: string;
  timePreference?: string;
  mode?: string;
}

export class SearchValidationError extends Error {
  constructor(readonly issues: string[]) {
    super("Search constraints are invalid");
    this.name = "SearchValidationError";
  }
}

function parseDate(value: string | undefined, field: string, issues: string[]) {
  if (!value || !DATE_PATTERN.test(value)) {
    issues.push(`${field} must use YYYY-MM-DD format`);
    return null;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    issues.push(`${field} must be a real calendar date`);
    return null;
  }
  return parsed;
}

function dateInNewYork(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

export function normalizeSearchInput(
  input: EventSearchInput,
  now = new Date(),
): { constraints: EventSearchConstraints; mode: DiscoveryMode } {
  const issues: string[] = [];
  const city = input.city?.trim() || "New York";
  if (city.toLocaleLowerCase() !== "new york") {
    issues.push("city must be New York during the launch-city slice");
  }

  const start = parseDate(input.startDate, "startDate", issues);
  const end = parseDate(input.endDate, "endDate", issues);
  const today = dateInNewYork(now);

  if (start && input.startDate! < today) {
    issues.push("startDate cannot be in the past");
  }
  if (start && end) {
    const spanDays = (end.getTime() - start.getTime()) / 86_400_000;
    if (spanDays < 0) issues.push("endDate cannot be before startDate");
    if (spanDays > 30) issues.push("date range cannot exceed 30 days");
  }

  const category = (input.category || "all") as EventCategory;
  if (!categories.has(category)) issues.push("category is not supported");

  const timePreference = (input.timePreference || "any") as TimePreference;
  if (!timePreferences.has(timePreference)) {
    issues.push("timePreference is not supported");
  }

  const partySize = Number(input.partySize || "2");
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 12) {
    issues.push("partySize must be an integer from 1 to 12");
  }

  let budgetMax: number | null = null;
  if (input.budgetMax?.trim()) {
    budgetMax = Number(input.budgetMax);
    if (!Number.isFinite(budgetMax) || budgetMax < 1 || budgetMax > 10_000) {
      issues.push("budgetMax must be between 1 and 10000");
    }
  }

  const mode = (input.mode || "live") as DiscoveryMode;
  if (mode !== "live" && mode !== "fixture") {
    issues.push("mode must be live or fixture");
  }

  if (issues.length > 0 || !input.startDate || !input.endDate) {
    throw new SearchValidationError(issues);
  }

  return {
    constraints: {
      city: "New York",
      startDate: input.startDate,
      endDate: input.endDate,
      category,
      budgetMax,
      partySize,
      timePreference,
    },
    mode,
  };
}
