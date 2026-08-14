import type { RankedEvent } from "./events";
import type { CheckoutSummary } from "./payment-provider";

export interface SavedPlan {
  id: string;
  state:
    | "draft"
    | "payment_pending"
    | "confirmed"
    | "cancellation_pending"
    | "cancelled";
  version: number;
  createdAt: string;
  updatedAt: string;
  event: RankedEvent;
  checkout: CheckoutSummary | null;
}

export interface CreateDraftPlan {
  ownerSessionId: string;
  event: RankedEvent;
  idempotencyKey: string;
  correlationId: string;
}

export interface CreateDraftPlanResult {
  plan: SavedPlan;
  replayed: boolean;
}

export interface PlanRepository {
  createDraft(command: CreateDraftPlan): Promise<CreateDraftPlanResult>;
  listForOwner(ownerSessionId: string): Promise<SavedPlan[]>;
}

export class PlanValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super("The selected event is not a valid normalized event.");
    this.name = "PlanValidationError";
  }
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasNullableStrings(
  value: unknown,
  fields: readonly string[],
): value is Record<string, string | null> {
  return (
    isRecord(value) && fields.every((field) => isNullableString(value[field]))
  );
}

function isValidInstant(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function parseDraftPlanInput(value: unknown): {
  event: RankedEvent;
  idempotencyKey: string;
} {
  const issues: string[] = [];
  if (!isRecord(value))
    throw new PlanValidationError(["Body must be an object."]);

  const idempotencyKey = value.idempotencyKey;
  if (
    typeof idempotencyKey !== "string" ||
    !/^[a-zA-Z0-9._:-]{1,128}$/.test(idempotencyKey)
  ) {
    issues.push("idempotencyKey must contain 1–128 safe characters.");
  }

  const event = value.event;
  if (!isRecord(event)) {
    issues.push("event must be an object.");
  } else {
    if (typeof event.id !== "string" || event.id.length > 256 || !event.id)
      issues.push("event.id is required.");
    if (event.source !== "ticketmaster" && event.source !== "fixture")
      issues.push("event.source is invalid.");
    if (
      typeof event.name !== "string" ||
      !event.name ||
      event.name.length > 500
    )
      issues.push("event.name is required.");
    if (
      typeof event.localDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(event.localDate) ||
      !Number.isFinite(Date.parse(`${event.localDate}T12:00:00Z`))
    )
      issues.push("event.localDate is required.");
    if (event.startsAt !== null && !isValidInstant(event.startsAt))
      issues.push("event.startsAt is invalid.");
    if (
      event.localTime !== null &&
      (typeof event.localTime !== "string" ||
        !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(event.localTime))
    )
      issues.push("event.localTime is invalid.");
    if (!isNullableString(event.timezone))
      issues.push("event.timezone is invalid.");
    if (typeof event.providerUrl !== "string")
      issues.push("event.providerUrl is required.");
    else {
      try {
        const url = new URL(event.providerUrl);
        if (url.protocol !== "https:")
          issues.push("event.providerUrl must use HTTPS.");
      } catch {
        issues.push("event.providerUrl must be a valid URL.");
      }
    }
    if (!isValidInstant(event.observedAt))
      issues.push("event.observedAt is required.");
    if (!isNullableString(event.status))
      issues.push("event.status is invalid.");
    if (!hasNullableStrings(event.venue, ["name", "city", "stateCode"]))
      issues.push("event.venue is invalid.");
    if (
      !hasNullableStrings(event.classification, [
        "segment",
        "genre",
        "subGenre",
      ])
    )
      issues.push("event.classification is required.");
    if (
      event.image !== null &&
      (!isRecord(event.image) ||
        typeof event.image.url !== "string" ||
        (event.image.width !== null && typeof event.image.width !== "number") ||
        (event.image.height !== null && typeof event.image.height !== "number"))
    )
      issues.push("event.image is invalid.");
    if (
      event.price !== null &&
      (!isRecord(event.price) ||
        typeof event.price.minimum !== "number" ||
        !Number.isFinite(event.price.minimum) ||
        typeof event.price.maximum !== "number" ||
        !Number.isFinite(event.price.maximum) ||
        event.price.minimum < 0 ||
        event.price.maximum < event.price.minimum ||
        typeof event.price.currency !== "string" ||
        !/^[A-Z]{3}$/.test(event.price.currency))
    )
      issues.push("event.price is invalid.");
    if (typeof event.score !== "number" || !Number.isFinite(event.score))
      issues.push("event.score is invalid.");
    if (
      !Array.isArray(event.scoreReasons) ||
      event.scoreReasons.length > 12 ||
      !event.scoreReasons.every(
        (reason) => typeof reason === "string" && reason.length <= 300,
      )
    )
      issues.push("event.scoreReasons is invalid.");
  }

  if (issues.length > 0) throw new PlanValidationError(issues);
  return {
    event: event as unknown as RankedEvent,
    idempotencyKey: idempotencyKey as string,
  };
}
