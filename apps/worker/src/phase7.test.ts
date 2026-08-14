import { describe, expect, it, vi } from "vitest";
import type {
  AIProvider,
  EventStatusChange,
  HelpRequest,
  InAppAlert,
  LifecycleRepository,
  PreferenceProfile,
  SpeechProvider,
} from "@scout/core";

import { createApp } from "./index";

class MemoryLifecycleRepository implements LifecycleRepository {
  profile: PreferenceProfile = {
    categories: [],
    budgetMax: null,
    timePreference: "any",
    favoriteArtists: [],
    favoriteVenues: [],
    updatedAt: null,
  };
  alerts: InAppAlert[] = [];
  alertOwners = new Map<string, string>();
  help: HelpRequest[] = [];
  currentProviderStatus = "cancelled";

  async getPreferences() {
    return this.profile;
  }
  async savePreferences(_owner: string, profile: PreferenceProfile) {
    this.profile = { ...profile, updatedAt: "2026-08-14T12:00:00.000Z" };
    return this.profile;
  }
  async ownedProviderEvents(): ReturnType<
    LifecycleRepository["ownedProviderEvents"]
  > {
    return [
      {
        reservationId: "plan-1",
        provider: "fixture" as const,
        providerEventId: "fixture-1",
        status: this.currentProviderStatus,
      },
    ];
  }
  async recordStatus(owner: string, input: EventStatusChange) {
    if (
      input.changed &&
      !this.alerts.some(
        (item) =>
          item.reservationId === input.reservationId &&
          item.message === `changed to ${input.currentStatus}`,
      )
    ) {
      const alert = {
        id: "alert-1",
        reservationId: input.reservationId,
        kind: "event_status_changed",
        message: `changed to ${input.currentStatus}`,
        createdAt: "2026-08-14T12:00:00.000Z",
        readAt: null,
      } satisfies InAppAlert;
      this.alerts.push(alert);
      this.alertOwners.set(alert.id, owner);
    }
  }
  async listAlerts(owner: string) {
    return this.alerts.filter(
      (item) => this.alertOwners.get(item.id) === owner,
    );
  }
  async dismissAlert(owner: string, alertId: string) {
    const alert = this.alerts.find((item) => item.id === alertId);
    if (!alert || this.alertOwners.get(alertId) !== owner) return false;
    alert.readAt = "2026-08-14T12:00:00.000Z";
    return true;
  }
  async createHelpRequest(
    _owner: string,
    reservationId: string | null,
    message: string,
  ) {
    const item: HelpRequest = {
      id: "help-1",
      reservationId,
      message,
      status: "open",
      createdAt: "2026-08-14T12:00:00.000Z",
    };
    this.help.push(item);
    return item;
  }
  async listHelpRequests() {
    return this.help;
  }
}

const lifecycleRepository = new MemoryLifecycleRepository();
const speechProvider: SpeechProvider = {
  transcribe: vi.fn(async () => "comedy for two next Friday"),
  synthesize: vi.fn(async () => ({
    audio: new Uint8Array([1, 2, 3]),
    mediaType: "audio/mpeg",
  })),
};
const app = createApp({
  speechProvider,
  lifecycleRepository,
  resolveSession: async () => "guest-a",
  clock: () => new Date("2026-08-14T12:00:00Z"),
});
const bindings = {
  APP_ENV: "test",
  DB: {} as D1Database,
  ASSETS: {} as Fetcher,
};

describe("Phase 7 voice API", () => {
  it("transcribes a supported clip without persisting raw audio", async () => {
    const form = new FormData();
    form.append(
      "audio",
      new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }),
      "clip.webm",
    );
    form.append("durationMs", "1200");
    const response = await app.request(
      "/api/v1/voice/transcriptions",
      { method: "POST", body: form },
      bindings,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        transcript: "comedy for two next Friday",
        editable: true,
        rawAudioPersisted: false,
      },
    });
  });

  it("routes an edited transcript through the same exact-time contract as typed input", async () => {
    const exactRequest =
      "What kind of shows are available in New York at 5 PM this Friday?";
    const exactIntent = {
      action: "search_events" as const,
      startDate: "2026-08-14",
      endDate: "2026-08-14",
      category: "all" as const,
      budgetMax: null,
      partySize: 2,
      timePreference: "any" as const,
      exactStartTime: "17:00",
      missingFields: [],
    };
    const parityApp = createApp({
      speechProvider: {
        ...speechProvider,
        transcribe: vi.fn(async () => exactRequest),
      },
      aiProvider: {
        extractSearchIntent: vi.fn(async () => exactIntent),
      } satisfies AIProvider,
      clock: () => new Date("2026-08-13T16:00:00Z"),
    });
    const form = new FormData();
    form.append(
      "audio",
      new Blob(["audio"], { type: "audio/webm" }),
      "clip.webm",
    );
    form.append("durationMs", "1000");
    const transcription = await parityApp.request(
      "/api/v1/voice/transcriptions",
      { method: "POST", body: form },
      bindings,
    );
    const transcriptPayload = (await transcription.json()) as {
      data: { transcript: string };
    };

    const submit = (message: string, session: string) =>
      parityApp.request(
        "/api/v1/conversations/messages",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-scout-session": session,
          },
          body: JSON.stringify({ message, mode: "fixture", history: [] }),
        },
        bindings,
      );
    const typed = await submit(exactRequest, "typed-parity");
    const transcribed = await submit(
      transcriptPayload.data.transcript,
      "transcribed-parity",
    );
    const typedPayload = (await typed.json()) as { data: unknown };
    const transcribedPayload = (await transcribed.json()) as { data: unknown };
    expect(transcribedPayload.data).toEqual(typedPayload.data);
    expect(transcribedPayload.data).toMatchObject({
      constraints: { exactStartTime: "17:00" },
    });
  });

  it("rejects unsupported media before provider use", async () => {
    const form = new FormData();
    form.append("audio", new Blob(["x"], { type: "video/mp4" }), "clip.mp4");
    form.append("durationMs", "1000");
    const response = await app.request(
      "/api/v1/voice/transcriptions",
      { method: "POST", body: form },
      bindings,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VOICE_UNSUPPORTED_FORMAT" },
    });
  });

  it("caps TTS text and returns no-store audio", async () => {
    const rejected = await app.request(
      "/api/v1/voice/speech",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "x".repeat(601) }),
      },
      bindings,
    );
    expect(rejected.status).toBe(400);
    const response = await app.request(
      "/api/v1/voice/speech",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "Three options found." }),
      },
      bindings,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
  });

  it("keeps typed interaction available when speech quota/provider fails", async () => {
    const unavailable = createApp({
      speechProvider: {
        transcribe: vi.fn(async () => {
          throw new Error("quota exhausted");
        }),
        synthesize: vi.fn(async () => {
          throw new Error("quota exhausted");
        }),
      },
    });
    const form = new FormData();
    form.append(
      "audio",
      new Blob(["audio"], { type: "audio/webm" }),
      "clip.webm",
    );
    form.append("durationMs", "1000");
    const response = await unavailable.request(
      "/api/v1/voice/transcriptions",
      { method: "POST", body: form },
      bindings,
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "SPEECH_UNAVAILABLE",
        message: expect.stringContaining("Type your request instead"),
      },
    });
  });
});

describe("Phase 7 lifecycle API", () => {
  it("persists corrected preferences", async () => {
    const response = await app.request(
      "/api/v1/preferences",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          categories: ["comedy"],
          budgetMax: 80,
          timePreference: "evening",
          favoriteArtists: [],
          favoriteVenues: ["Beacon Theatre"],
          updatedAt: null,
        }),
      },
      bindings,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { categories: ["comedy"], favoriteVenues: ["Beacon Theatre"] },
    });
  });

  it("creates an honest inspectable help record", async () => {
    const response = await app.request(
      "/api/v1/help-requests",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reservationId: "plan-1",
          message: "Please inspect this demo plan.",
        }),
      },
      bindings,
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      data: { status: "open" },
      staffedService: false,
    });
  });

  it("deduplicates, scopes, and dismisses a provider status alert without changing the saved fact", async () => {
    const changedRepository = new MemoryLifecycleRepository();
    changedRepository.ownedProviderEvents = async () => [
      {
        reservationId: "plan-live",
        provider: "ticketmaster" as const,
        providerEventId: "event-1",
        status: "onsale",
      },
    ];
    const statusApp = createApp({
      lifecycleRepository: changedRepository,
      resolveSession: async () => "guest-a",
      fetcher: vi.fn(async () =>
        Response.json({ dates: { status: { code: "cancelled" } } }),
      ),
    });
    const response = await statusApp.request(
      "/api/v1/plans/status-refresh",
      { method: "POST" },
      { ...bindings, TICKETMASTER_API_KEY: "test-key" },
    );
    await expect(response.json()).resolves.toMatchObject({
      data: {
        changes: [
          {
            previousStatus: "onsale",
            currentStatus: "cancelled",
            changed: true,
          },
        ],
      },
    });
    expect(changedRepository.alerts).toHaveLength(1);
    expect(await changedRepository.ownedProviderEvents()).toEqual([
      expect.objectContaining({ status: "onsale" }),
    ]);

    await statusApp.request(
      "/api/v1/plans/status-refresh",
      { method: "POST" },
      { ...bindings, TICKETMASTER_API_KEY: "test-key" },
    );
    expect(changedRepository.alerts).toHaveLength(1);

    const otherGuestApp = createApp({
      lifecycleRepository: changedRepository,
      resolveSession: async () => "guest-b",
    });
    const otherGuestAlerts = await otherGuestApp.request(
      "/api/v1/alerts",
      {},
      bindings,
    );
    await expect(otherGuestAlerts.json()).resolves.toMatchObject({ data: [] });

    const dismissed = await statusApp.request(
      "/api/v1/alerts/alert-1/dismiss",
      { method: "POST" },
      bindings,
    );
    expect(dismissed.status).toBe(200);
    expect(changedRepository.alerts[0]?.readAt).not.toBeNull();
  });
});
