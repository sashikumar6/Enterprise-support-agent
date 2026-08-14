import { describe, expect, it, vi } from "vitest";

import { SpeechValidationError } from "@scout/core";
import { WorkersAISpeechProvider } from "./workers-ai-speech-provider";

describe("WorkersAISpeechProvider", () => {
  it("uses bounded Whisper transcription inputs", async () => {
    const run = vi.fn(async () => ({ text: "  jazz next Friday  " }));
    const provider = new WorkersAISpeechProvider({ run });
    await expect(provider.transcribe(new Uint8Array([1, 2, 3]))).resolves.toBe(
      "jazz next Friday",
    );
    expect(run).toHaveBeenCalledWith(
      "@cf/openai/whisper-large-v3-turbo",
      expect.objectContaining({ task: "transcribe", vad_filter: true }),
    );
  });

  it("maps an empty transcript to silence", async () => {
    const provider = new WorkersAISpeechProvider({
      run: vi.fn(async () => ({ text: "" })),
    });
    await expect(
      provider.transcribe(new Uint8Array([1])),
    ).rejects.toBeInstanceOf(SpeechValidationError);
  });

  it("returns MP3 bytes from MeloTTS", async () => {
    const provider = new WorkersAISpeechProvider({
      run: vi.fn(async () => new Uint8Array([1, 2, 3])),
    });
    await expect(provider.synthesize("hello")).resolves.toMatchObject({
      mediaType: "audio/mpeg",
      audio: new Uint8Array([1, 2, 3]),
      model: "melotts",
    });
  });

  it("falls back to raw Aura audio when MeloTTS is unavailable", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("3043: Internal server error"))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([4, 5, 6]), {
          headers: { "content-type": "audio/mpeg" },
        }),
      );
    const provider = new WorkersAISpeechProvider({ run });
    await expect(provider.synthesize("hello")).resolves.toMatchObject({
      mediaType: "audio/mpeg",
      audio: new Uint8Array([4, 5, 6]),
      model: "aura-1",
    });
    expect(run).toHaveBeenNthCalledWith(
      2,
      "@cf/deepgram/aura-1",
      { text: "hello" },
      { returnRawResponse: true },
    );
  });
});
