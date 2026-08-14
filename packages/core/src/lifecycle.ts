import type { EventCategory, TimePreference } from "./events";

export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
export const MAX_AUDIO_DURATION_MS = 30_000;
export const MAX_SPEECH_CHARACTERS = 600;
export const SUPPORTED_AUDIO_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
] as const;

export interface SpeechProvider {
  transcribe(audio: Uint8Array, mediaType: string): Promise<string>;
  synthesize(
    text: string,
  ): Promise<{ audio: Uint8Array; mediaType: string; model?: string }>;
}

export class SpeechValidationError extends Error {
  constructor(
    readonly code:
      | "unsupported_format"
      | "too_large"
      | "too_long"
      | "silence"
      | "invalid_text",
  ) {
    super(code);
    this.name = "SpeechValidationError";
  }
}

export function validateAudioInput(input: {
  bytes: number;
  mediaType: string;
  durationMs: number;
}) {
  const mediaType = input.mediaType.split(";")[0]?.toLowerCase();
  if (
    !SUPPORTED_AUDIO_TYPES.includes(
      mediaType as (typeof SUPPORTED_AUDIO_TYPES)[number],
    )
  ) {
    throw new SpeechValidationError("unsupported_format");
  }
  if (input.bytes < 1 || input.bytes > MAX_AUDIO_BYTES) {
    throw new SpeechValidationError(input.bytes < 1 ? "silence" : "too_large");
  }
  if (
    !Number.isFinite(input.durationMs) ||
    input.durationMs <= 0 ||
    input.durationMs > MAX_AUDIO_DURATION_MS
  ) {
    throw new SpeechValidationError("too_long");
  }
  return mediaType;
}

export function validateSpeechText(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > MAX_SPEECH_CHARACTERS) {
    throw new SpeechValidationError("invalid_text");
  }
  return text;
}

export interface PreferenceProfile {
  categories: EventCategory[];
  budgetMax: number | null;
  timePreference: TimePreference;
  favoriteArtists: string[];
  favoriteVenues: string[];
  updatedAt: string | null;
}

export interface InAppAlert {
  id: string;
  reservationId: string;
  kind: "event_status_changed";
  message: string;
  createdAt: string;
  readAt: string | null;
}

export interface HelpRequest {
  id: string;
  reservationId: string | null;
  message: string;
  status: "open";
  createdAt: string;
}

export interface EventStatusChange {
  reservationId: string;
  previousStatus: string | null;
  currentStatus: string | null;
  changed: boolean;
}

export interface LifecycleRepository {
  getPreferences(ownerSessionId: string): Promise<PreferenceProfile>;
  savePreferences(
    ownerSessionId: string,
    profile: PreferenceProfile,
    correlationId: string,
  ): Promise<PreferenceProfile>;
  ownedProviderEvents(ownerSessionId: string): Promise<
    Array<{
      reservationId: string;
      provider: "ticketmaster" | "fixture";
      providerEventId: string;
      status: string | null;
    }>
  >;
  recordStatus(
    ownerSessionId: string,
    input: EventStatusChange,
    correlationId: string,
  ): Promise<void>;
  listAlerts(ownerSessionId: string): Promise<InAppAlert[]>;
  dismissAlert(ownerSessionId: string, alertId: string): Promise<boolean>;
  createHelpRequest(
    ownerSessionId: string,
    reservationId: string | null,
    message: string,
    correlationId: string,
  ): Promise<HelpRequest>;
  listHelpRequests(ownerSessionId: string): Promise<HelpRequest[]>;
}

const categories = new Set<EventCategory>([
  "all",
  "music",
  "sports",
  "arts",
  "comedy",
  "family",
]);
const times = new Set<TimePreference>(["any", "daytime", "evening"]);

export function parsePreferenceProfile(value: unknown): PreferenceProfile {
  if (!value || typeof value !== "object")
    throw new Error("invalid preferences");
  const item = value as Record<string, unknown>;
  const list = (candidate: unknown) =>
    Array.isArray(candidate) &&
    candidate.length <= 10 &&
    candidate.every(
      (entry) =>
        typeof entry === "string" &&
        entry.trim().length >= 1 &&
        entry.length <= 80,
    );
  if (
    !Array.isArray(item.categories) ||
    item.categories.length > 6 ||
    !item.categories.every(
      (entry) =>
        typeof entry === "string" && categories.has(entry as EventCategory),
    )
  )
    throw new Error("invalid categories");
  if (
    item.budgetMax !== null &&
    (typeof item.budgetMax !== "number" ||
      !Number.isFinite(item.budgetMax) ||
      item.budgetMax < 1 ||
      item.budgetMax > 10_000)
  )
    throw new Error("invalid budget");
  if (
    typeof item.timePreference !== "string" ||
    !times.has(item.timePreference as TimePreference)
  )
    throw new Error("invalid time");
  if (!list(item.favoriteArtists) || !list(item.favoriteVenues))
    throw new Error("invalid favorites");
  return {
    categories: [...new Set(item.categories as EventCategory[])],
    budgetMax: item.budgetMax as number | null,
    timePreference: item.timePreference as TimePreference,
    favoriteArtists: (item.favoriteArtists as string[]).map((entry) =>
      entry.trim(),
    ),
    favoriteVenues: (item.favoriteVenues as string[]).map((entry) =>
      entry.trim(),
    ),
    updatedAt: null,
  };
}

export function parseHelpRequest(value: unknown) {
  if (!value || typeof value !== "object")
    throw new Error("invalid help request");
  const item = value as Record<string, unknown>;
  const message = typeof item.message === "string" ? item.message.trim() : "";
  const reservationId =
    item.reservationId === null || item.reservationId === undefined
      ? null
      : item.reservationId;
  if (
    message.length < 5 ||
    message.length > 500 ||
    (reservationId !== null &&
      (typeof reservationId !== "string" ||
        !/^[a-zA-Z0-9._:-]{1,128}$/.test(reservationId)))
  )
    throw new Error("invalid help request");
  return { message, reservationId: reservationId as string | null };
}
