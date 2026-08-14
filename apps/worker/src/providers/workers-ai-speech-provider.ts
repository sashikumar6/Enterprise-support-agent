import { SpeechValidationError, type SpeechProvider } from "@scout/core";

type AIBinding = {
  run(model: string, input: unknown, options?: unknown): Promise<unknown>;
};

function base64(bytes: Uint8Array) {
  let encoded = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    encoded += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(encoded);
}

function decodeBase64(value: string) {
  const decoded = atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

export class WorkersAISpeechProvider implements SpeechProvider {
  constructor(private readonly ai: AIBinding) {}

  async transcribe(audio: Uint8Array) {
    const response = await this.ai.run("@cf/openai/whisper-large-v3-turbo", {
      audio: base64(audio),
      task: "transcribe",
      language: "en",
      vad_filter: true,
      condition_on_previous_text: false,
    });
    const text =
      response && typeof response === "object" && "text" in response
        ? String(response.text).trim()
        : "";
    if (!text) throw new SpeechValidationError("silence");
    return text.slice(0, 500);
  }

  private async normalizeAudio(response: unknown, model: string) {
    if (response instanceof ArrayBuffer) {
      return {
        audio: new Uint8Array(response),
        mediaType: "audio/mpeg",
        model,
      };
    }
    if (response instanceof Uint8Array) {
      return { audio: response, mediaType: "audio/mpeg", model };
    }
    if (response instanceof Response) {
      if (!response.ok) {
        throw new Error(`Workers AI ${model} returned ${response.status}`);
      }
      return {
        audio: new Uint8Array(await response.arrayBuffer()),
        mediaType: response.headers.get("content-type") ?? "audio/mpeg",
        model,
      };
    }
    if (response instanceof ReadableStream) {
      return {
        audio: new Uint8Array(await new Response(response).arrayBuffer()),
        mediaType: "audio/mpeg",
        model,
      };
    }
    if (typeof response === "string") {
      return {
        audio: decodeBase64(response),
        mediaType: "audio/mpeg",
        model,
      };
    }
    if (
      response &&
      typeof response === "object" &&
      "audio" in response &&
      typeof response.audio === "string"
    ) {
      return {
        audio: decodeBase64(response.audio),
        mediaType: "audio/mpeg",
        model,
      };
    }
    throw new Error("Workers AI returned an invalid speech response");
  }

  async synthesize(text: string) {
    try {
      return await this.normalizeAudio(
        await this.ai.run("@cf/myshell-ai/melotts", {
          prompt: text,
          lang: "en",
        }),
        "melotts",
      );
    } catch {
      return this.normalizeAudio(
        await this.ai.run(
          "@cf/deepgram/aura-1",
          { text },
          { returnRawResponse: true },
        ),
        "aura-1",
      );
    }
  }
}
