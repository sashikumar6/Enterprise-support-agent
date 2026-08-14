import { describe, expect, it } from "vitest";

import {
  MAX_AUDIO_BYTES,
  parseHelpRequest,
  parsePreferenceProfile,
  SpeechValidationError,
  validateAudioInput,
  validateSpeechText,
} from "./lifecycle";

describe("voice validation", () => {
  it("accepts a bounded supported recording", () => {
    expect(
      validateAudioInput({
        bytes: 100,
        mediaType: "audio/webm;codecs=opus",
        durationMs: 29_999,
      }),
    ).toBe("audio/webm");
  });

  it.each([
    [
      { bytes: 10, mediaType: "video/mp4", durationMs: 1000 },
      "unsupported_format",
    ],
    [
      { bytes: MAX_AUDIO_BYTES + 1, mediaType: "audio/webm", durationMs: 1000 },
      "too_large",
    ],
    [{ bytes: 10, mediaType: "audio/webm", durationMs: 30_001 }, "too_long"],
    [{ bytes: 0, mediaType: "audio/webm", durationMs: 1000 }, "silence"],
  ])("rejects invalid audio", (input, code) => {
    try {
      validateAudioInput(input);
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(SpeechValidationError);
      expect((error as SpeechValidationError).code).toBe(code);
    }
  });

  it("caps spoken text", () => {
    expect(validateSpeechText("hello")).toBe("hello");
    expect(() => validateSpeechText("x".repeat(601))).toThrow(
      SpeechValidationError,
    );
  });
});

describe("lifecycle validation", () => {
  it("normalizes an editable preference profile", () => {
    expect(
      parsePreferenceProfile({
        categories: ["music", "music"],
        budgetMax: 80,
        timePreference: "evening",
        favoriteArtists: [" Miles Davis "],
        favoriteVenues: [],
      }),
    ).toMatchObject({
      categories: ["music"],
      favoriteArtists: ["Miles Davis"],
      updatedAt: null,
    });
  });

  it("rejects unsafe profile and help values", () => {
    expect(() => parsePreferenceProfile({ categories: ["unknown"] })).toThrow();
    expect(() =>
      parseHelpRequest({ reservationId: "bad id", message: "help me" }),
    ).toThrow();
  });
});
