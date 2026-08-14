# Phase 7 voice and lifecycle acceptance

Status: **VERIFIED COMPLETE**

Date: 2026-08-14

## Outcome implemented

Scout now exposes voice as an optional channel into the same governed text conversation. The browser asks for microphone access only after the user activates the control, records with a visible 30-second cap and cancel action, uploads a bounded clip for transcription, and places the returned transcript in the existing editable request field. Submission remains a separate user action. Raw audio is not stored by application code and speech responses are returned with `Cache-Control: no-store`.

The same Workers AI binding implements provider-neutral Whisper transcription and uses MeloTTS as the primary speech generator. If Cloudflare returns a provider error from MeloTTS, Scout makes one bounded attempt with Cloudflare-hosted Aura-1 before falling back to text. Spoken output is derived from the rendered assistant text, capped at 600 characters, and has play/replay, stop, mute, and disable controls. Any unavailable, quota, format, silence, or permission path preserves typed interaction.

Guest-owned lifecycle state now includes editable preference profiles, saved-event status checks, deduplicated in-app status alerts, and inspectable help-request records. Help copy explicitly says that no staffed human team is contacted. A responsive standalone PWA manifest, icon, and network-first service worker are included.

## Automated acceptance evidence

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm test` — passed: 89 tests total (five Ticketmaster spike tests and 84 Vitest tests).
- `npm run build` — React production build and Worker dry run passed.
- `npm run migrate:local` — `0005_voice_lifecycle.sql` applied successfully.
- `npm run test:e2e` — eight checks passed across desktop Chromium and Pixel 7 emulation on an isolated local Worker:
  - typed conversational path and deterministic fixture discovery;
  - save/reload plan and provider-status refresh;
  - microphone denial with editable typed fallback;
  - visible playback, stop, mute, and disable controls;
  - preference correction and persistence API;
  - honest help-record creation;
  - standalone PWA manifest.

Automated API/unit cases cover supported and unsupported media, empty transcription, 30-second/size bounds, provider/quota failure, editable transcription metadata, 600-character TTS bounds, no-store audio, corrected preferences, provider-reported cancellation changes, alert creation, and help-record honesty. Speech provider tests assert the allowlisted `@cf/openai/whisper-large-v3-turbo`, `@cf/myshell-ai/melotts`, and error-only `@cf/deepgram/aura-1` fallback behavior.

The browser suite uses port 8790 with `reuseExistingServer: false` so it cannot accidentally exercise the owner’s separate port-8787 development/AI session.

## Live provider evidence

On 2026-08-14, the owner ran `npm run dev:ai` with the remote Workers AI binding and granted real browser microphone access. Four real Whisper requests succeeded with clips of 7,137 ms, 14,322 ms, 4,519 ms, and 4,432 ms. Observed inference latency was 2,128 ms, 2,154 ms, 4,252 ms, and 1,515 ms respectively. Every log recorded `persistedRawAudio: false`; the supplied screenshot shows a returned transcript in the normal editable text field and the same governed conversation path produced a read-only five-result response.

The same run exposed a provider-specific failure: MeloTTS returned Cloudflare `AiError 3043: Internal server error`, so the initial UI correctly retained text and reported spoken response unavailability. Scout now attempts Aura-1 only after MeloTTS fails. A subsequent live provider check returned `200 OK`, `audio/mpeg`, `Cache-Control: no-store`, a valid 12,852-byte mono MP3, and a 2,421 ms synthesis latency while logging `model: aura-1`.

## Manual and lifecycle acceptance

On 2026-08-14, the owner confirmed the complete interactive checklist against `dev:ai`:

1. Microphone grant, manual stop, cancel, 30-second automatic stop, intelligible transcription,
   transcript editing, and separate governed submission all worked.
2. Silence produced the typed-fallback experience without breaking typed discovery.
3. Playback, replay, stop, mute/unmute, disable/enable, and spoken/visible response parity worked.
4. The already observed MeloTTS failure and the missing-binding regression both retained typed
   search, satisfying degraded speech behavior without deliberately exhausting free quota.
5. The controlled provider-change regression created one deduplicated in-app alert while retaining
   the saved snapshot; owner scoping and dismissal are covered by the lifecycle repository/API tests.
6. The owner installed the PWA and confirmed standalone launch and responsive controls.

The in-app browser visual inspector remained unavailable because its bundled native dependency was
rejected by the local macOS code-signing policy. Owner-observed interactive evidence and the
isolated desktop/mobile browser suite provide the required browser coverage.

## Privacy and authority review

- No migration or repository stores audio bytes.
- Speech logs contain model, duration/character count, latency, failure category, correlation ID, and `persistedRawAudio: false`; they do not contain audio or transcript text.
- Transcribed input enters the existing message field and requires explicit submission.
- No new AI tool or consequential authority was added.
- Status refresh is read-only against Ticketmaster; immutable saved snapshots remain unchanged.
- Alerts report provider status and direct users to recheck the provider; they do not claim ticket availability.
- Help records are owner-scoped and explicitly labeled as an unstaffed demo workflow.

## Phase decision

**VERIFIED COMPLETE.** Phase 7 implementation, automated checks, live speech/provider evidence,
owner-observed browser controls, lifecycle behavior, and PWA installation all pass. Phase 8 may
begin.
