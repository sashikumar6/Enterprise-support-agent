import type {
  DiscoveryMode,
  EventCategory,
  EventSearchConstraints,
  EventSearchResult,
  TimePreference,
} from "./events";
import { EXACT_START_WINDOW_MINUTES } from "./events";
import {
  normalizeSearchInput,
  SearchValidationError,
} from "./search-validation";

export type ConversationRole = "user" | "assistant";

export interface ConversationTurn {
  role: ConversationRole;
  content: string;
}

export interface SearchIntent {
  action: "search_events" | "clarify";
  startDate: string | null;
  endDate: string | null;
  category: EventCategory | null;
  budgetMax: number | null;
  partySize: number | null;
  timePreference: TimePreference | null;
  exactStartTime: string | null;
  missingFields: string[];
}

export interface AIProvider {
  extractSearchIntent(input: {
    message: string;
    today: string;
    contextSummary: string;
  }): Promise<SearchIntent>;
}

const allowedCategories = new Set<EventCategory>([
  "all",
  "music",
  "sports",
  "arts",
  "comedy",
  "family",
]);
const allowedTimes = new Set<TimePreference>(["any", "daytime", "evening"]);

export function parseSearchIntent(input: unknown): SearchIntent {
  if (typeof input !== "object" || input === null) {
    throw new Error("AI intent must be an object");
  }
  const value = input as Record<string, unknown>;
  if (value.action !== "search_events" && value.action !== "clarify") {
    throw new Error("AI intent action is invalid");
  }
  const nullableDate = (candidate: unknown) =>
    candidate === null || /^\d{4}-\d{2}-\d{2}$/.test(String(candidate));
  if (!nullableDate(value.startDate) || !nullableDate(value.endDate)) {
    throw new Error("AI intent dates are invalid");
  }
  if (
    value.category !== null &&
    (typeof value.category !== "string" ||
      !allowedCategories.has(value.category as EventCategory))
  ) {
    throw new Error("AI intent category is invalid");
  }
  if (
    value.timePreference !== null &&
    (typeof value.timePreference !== "string" ||
      !allowedTimes.has(value.timePreference as TimePreference))
  ) {
    throw new Error("AI intent time preference is invalid");
  }
  if (
    value.exactStartTime !== null &&
    (typeof value.exactStartTime !== "string" ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.exactStartTime))
  ) {
    throw new Error("AI intent exact start time is invalid");
  }
  if (
    value.budgetMax !== null &&
    (typeof value.budgetMax !== "number" ||
      !Number.isFinite(value.budgetMax) ||
      value.budgetMax < 1 ||
      value.budgetMax > 10_000)
  ) {
    throw new Error("AI intent budget is invalid");
  }
  if (
    value.partySize !== null &&
    (typeof value.partySize !== "number" ||
      !Number.isInteger(value.partySize) ||
      value.partySize < 1 ||
      value.partySize > 12)
  ) {
    throw new Error("AI intent party size is invalid");
  }
  if (
    !Array.isArray(value.missingFields) ||
    value.missingFields.some(
      (field) => typeof field !== "string" || field.length > 40,
    ) ||
    value.missingFields.length > 6
  ) {
    throw new Error("AI intent missing fields are invalid");
  }
  return {
    action: value.action,
    startDate: value.startDate as string | null,
    endDate: value.endDate as string | null,
    category: value.category as EventCategory | null,
    budgetMax: value.budgetMax as number | null,
    partySize: value.partySize as number | null,
    timePreference: value.timePreference as TimePreference | null,
    exactStartTime: value.exactStartTime as string | null,
    missingFields: value.missingFields as string[],
  };
}

export type ConversationResult =
  | {
      status: "clarification";
      assistantMessage: string;
      intent: SearchIntent;
      modelUsed: boolean;
      toolCalls: [];
    }
  | {
      status: "results";
      assistantMessage: string;
      intent: SearchIntent;
      constraints: EventSearchConstraints;
      result: EventSearchResult;
      modelUsed: boolean;
      toolCalls: [{ name: "search_events"; status: "completed" }];
    }
  | {
      status: "fallback";
      assistantMessage: string;
      modelUsed: false;
      toolCalls: [];
    };

export class ConversationValidationError extends Error {
  constructor(readonly issues: string[]) {
    super("Conversation input is invalid");
    this.name = "ConversationValidationError";
  }
}

export function parseConversationInput(input: unknown): {
  message: string;
  mode: DiscoveryMode;
  history: ConversationTurn[];
} {
  const issues: string[] = [];
  if (typeof input !== "object" || input === null) {
    throw new ConversationValidationError(["body must be an object"]);
  }
  const candidate = input as Record<string, unknown>;
  const message =
    typeof candidate.message === "string" ? candidate.message.trim() : "";
  if (message.length < 2 || message.length > 500) {
    issues.push("message must be between 2 and 500 characters");
  }
  const mode = candidate.mode === undefined ? "live" : candidate.mode;
  if (mode !== "live" && mode !== "fixture") {
    issues.push("mode must be live or fixture");
  }
  const rawHistory = candidate.history === undefined ? [] : candidate.history;
  if (!Array.isArray(rawHistory) || rawHistory.length > 6) {
    issues.push("history must contain at most 6 turns");
  }
  const history: ConversationTurn[] = [];
  if (Array.isArray(rawHistory)) {
    for (const turn of rawHistory) {
      if (
        typeof turn !== "object" ||
        turn === null ||
        !("role" in turn) ||
        (turn.role !== "user" && turn.role !== "assistant") ||
        !("content" in turn) ||
        typeof turn.content !== "string" ||
        turn.content.trim().length === 0 ||
        turn.content.length > 500
      ) {
        issues.push(
          "each history turn needs a valid role and 1-500 character content",
        );
        break;
      }
      history.push({ role: turn.role, content: turn.content.trim() });
    }
  }
  if (issues.length > 0) throw new ConversationValidationError(issues);
  return { message, mode: mode as DiscoveryMode, history };
}

export function summarizeConversation(history: ConversationTurn[]) {
  return history
    .slice(-4)
    .map(
      (turn) =>
        `${turn.role}: ${turn.content.replace(/\s+/g, " ").slice(0, 240)}`,
    )
    .join("\n")
    .slice(0, 800);
}

function clarificationMessage(intent: SearchIntent) {
  const missing = new Set(intent.missingFields);
  if (missing.has("conflictingDates"))
    return "I found more than one date in that request. Which single date or date range should I search?";
  if (missing.has("dates"))
    return "What date or date range should I search in New York?";
  if (missing.has("partySize")) return "How many people are going?";
  return "Tell me a little more about the kind of event you want.";
}

function newYorkDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const fields = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${fields.year}-${fields.month}-${fields.day}`;
}

const weekdays = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function resolveRelativeDateRange(
  message: string,
  today: string,
):
  | { status: "none" }
  | { status: "conflict" }
  | { status: "resolved"; startDate: string; endDate: string } {
  const normalized = message.toLocaleLowerCase();
  const candidates: Array<{ startDate: string; endDate: string }> = [];
  const addCandidate = (startDate: string, endDate = startDate) =>
    candidates.push({ startDate, endDate });

  if (/\btoday\b/.test(normalized)) addCandidate(today);
  if (/\btomorrow\b/.test(normalized)) addCandidate(addDays(today, 1));

  const current = new Date(`${today}T12:00:00Z`).getUTCDay();
  for (const match of normalized.matchAll(
    /\b(this|next)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/g,
  )) {
    const requested = weekdays.indexOf(match[2]);
    const thisOccurrence = addDays(today, (requested - current + 7) % 7);
    addCandidate(
      match[1] === "next" ? addDays(thisOccurrence, 7) : thisOccurrence,
    );
  }

  for (const match of normalized.matchAll(/\b(this|next)\s+weekend\b/g)) {
    if (current === 0) {
      if (match[1] === "this") addCandidate(today);
      else addCandidate(addDays(today, 6), addDays(today, 7));
      continue;
    }
    const saturday = addDays(today, (6 - current + 7) % 7);
    const startDate = match[1] === "next" ? addDays(saturday, 7) : saturday;
    addCandidate(startDate, addDays(startDate, 1));
  }

  const unique = new Map(
    candidates.map((candidate) => [
      `${candidate.startDate}:${candidate.endDate}`,
      candidate,
    ]),
  );
  if (unique.size === 0) return { status: "none" };
  if (unique.size > 1) return { status: "conflict" };
  return { status: "resolved", ...[...unique.values()][0] };
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function displayTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 0, 1, hours, minutes)));
}

function shiftedTime(value: string, offset: number) {
  const [hours, minutes] = value.split(":").map(Number);
  const total = (hours * 60 + minutes + offset + 1_440) % 1_440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function eventFacts(result: EventSearchResult["events"]) {
  return result
    .slice(0, 3)
    .map(
      (event) =>
        `${event.name}${event.localTime ? ` at ${displayTime(event.localTime)}` : " (start time not supplied)"}`,
    )
    .join("; ");
}

function groundedMessage(
  constraints: EventSearchConstraints,
  result: EventSearchResult,
) {
  const dateLabel =
    constraints.startDate === constraints.endDate
      ? displayDate(constraints.startDate)
      : `${displayDate(constraints.startDate)} through ${displayDate(constraints.endDate)}`;
  if (constraints.exactStartTime) {
    const requested = displayTime(constraints.exactStartTime);
    const lower = displayTime(
      shiftedTime(constraints.exactStartTime, -EXACT_START_WINDOW_MINUTES),
    );
    const upper = displayTime(
      shiftedTime(constraints.exactStartTime, EXACT_START_WINDOW_MINUTES),
    );
    if (result.events.length > 0) {
      return `For ${dateLabel} at ${requested}, I found ${result.events.length} ${result.events.length === 1 ? "event" : "events"} starting between ${lower} and ${upper}: ${eventFacts(result.events)}. Prices and availability remain provider facts.`;
    }
    const alternatives = eventFacts(result.alternatives);
    return `For ${dateLabel} at ${requested}, I found no events starting between ${lower} and ${upper}.${alternatives ? ` Nearest alternatives: ${alternatives}.` : " The provider returned no nearby alternatives."} Prices and availability remain provider facts.`;
  }

  if (result.events.length === 0) {
    return `I searched provider facts for ${dateLabel} but found no matches. Try a wider date range or fewer constraints.`;
  }
  return `For ${dateLabel}, I found ${result.events.length} ${result.events.length === 1 ? "option" : "options"}. Strongest matches: ${eventFacts(result.events)}. Prices and availability remain provider facts.`;
}

export class AIOrchestrator {
  constructor(
    private readonly provider: AIProvider | null,
    private readonly search: (
      constraints: EventSearchConstraints,
      mode: DiscoveryMode,
    ) => Promise<EventSearchResult>,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async run(input: {
    message: string;
    mode: DiscoveryMode;
    history: ConversationTurn[];
  }): Promise<ConversationResult> {
    if (!this.provider) {
      return {
        status: "fallback",
        assistantMessage:
          "Conversational search is unavailable right now. The exact filters below still search live provider data.",
        modelUsed: false,
        toolCalls: [],
      };
    }

    let intent: SearchIntent;
    const today = newYorkDate(this.clock());
    try {
      intent = await this.provider.extractSearchIntent({
        message: input.message,
        today,
        contextSummary: summarizeConversation(input.history),
      });
      const relativeDate = resolveRelativeDateRange(input.message, today);
      if (relativeDate.status === "conflict") {
        intent = {
          ...intent,
          action: "clarify",
          missingFields: ["conflictingDates"],
        };
      } else if (relativeDate.status === "resolved") {
        intent = {
          ...intent,
          startDate: relativeDate.startDate,
          endDate: relativeDate.endDate,
        };
      }
    } catch {
      return {
        status: "fallback",
        assistantMessage:
          "I couldn’t safely interpret that request. Use the exact filters below and Scout will keep working without AI.",
        modelUsed: false,
        toolCalls: [],
      };
    }

    if (intent.action === "clarify") {
      return {
        status: "clarification",
        assistantMessage: clarificationMessage(intent),
        intent,
        modelUsed: true,
        toolCalls: [],
      };
    }

    try {
      const normalized = normalizeSearchInput(
        {
          city: "New York",
          startDate: intent.startDate ?? undefined,
          endDate: intent.endDate ?? undefined,
          category: intent.category ?? "all",
          budgetMax:
            intent.budgetMax === null ? undefined : String(intent.budgetMax),
          partySize: intent.partySize === null ? "2" : String(intent.partySize),
          timePreference: intent.timePreference ?? "any",
          exactStartTime: intent.exactStartTime ?? undefined,
          mode: input.mode,
        },
        this.clock(),
      );
      const result = await this.search(normalized.constraints, normalized.mode);
      return {
        status: "results",
        assistantMessage: groundedMessage(normalized.constraints, result),
        intent,
        constraints: normalized.constraints,
        result,
        modelUsed: true,
        toolCalls: [{ name: "search_events", status: "completed" }],
      };
    } catch (error) {
      if (error instanceof SearchValidationError) {
        return {
          status: "clarification",
          assistantMessage:
            "I need a valid New York date range within the next 30 days before I can search.",
          intent,
          modelUsed: true,
          toolCalls: [],
        };
      }
      throw error;
    }
  }
}
