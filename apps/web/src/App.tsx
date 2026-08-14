import type {
  ConversationResult,
  ConversationTurn,
  EventSearchConstraints,
  EventSearchResult,
  RankedEvent,
  SavedPlan,
  PreferenceProfile,
  InAppAlert,
  HelpRequest,
  OperationsSummary,
  OperationsTimelineItem,
} from "@scout/core";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowRight,
  ArrowUp,
  AudioLines,
  Bookmark,
  Check,
  ExternalLink,
  Headphones,
  Mic,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";

type ServiceState = "checking" | "online" | "unavailable";
type SearchState = "idle" | "loading" | "success" | "error";
type VoiceState =
  "idle" | "requesting" | "recording" | "transcribing" | "review";
type OperationsState = "locked" | "loading" | "ready" | "error";

interface SearchResponse {
  data: EventSearchResult;
  constraints: EventSearchConstraints;
  requestId: string;
}

interface ErrorResponse {
  error?: { message?: string; issues?: string[] };
}

interface PlansResponse {
  data: SavedPlan[];
  requestId: string;
}

interface ConversationResponse {
  data: ConversationResult;
  requestId: string;
}

function dateValue(daysFromToday: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) =>
      index === 0 ? String(part) : String(part).padStart(2, "0"),
    )
    .join("-");
}

function formatLocalTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2026, 0, 1, hours, minutes));
}

function formatConstraintDates(constraints: EventSearchConstraints) {
  const format = (value: string) =>
    new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value}T12:00:00Z`));
  return constraints.startDate === constraints.endDate
    ? format(constraints.startDate)
    : `${format(constraints.startDate)}–${format(constraints.endDate)}`;
}

function formatEventDate(event: RankedEvent) {
  const date = new Date(`${event.localDate}T12:00:00`);
  const day = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
  if (!event.localTime) return `${day} · Time not supplied`;
  const [hours, minutes] = event.localTime.split(":").map(Number);
  const time = formatLocalTime(`${hours}:${String(minutes).padStart(2, "0")}`);
  return `${day} · ${time}`;
}

function formatPrice(event: RankedEvent) {
  if (!event.price) return "Provider price not supplied";
  const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: event.price.currency,
    maximumFractionDigits: 0,
  });
  return `${currency.format(event.price.minimum)}–${currency.format(event.price.maximum)} provider range`;
}

function fallbackMessage(result: EventSearchResult) {
  if (result.fallbackReason === "missing_key") {
    return "Live discovery is unavailable. Scout is showing clearly labeled sample events.";
  }
  if (result.fallbackReason === "invalid_credentials") {
    return "Live discovery could not connect. Scout switched to clearly labeled sample events.";
  }
  if (result.fallbackReason === "rate_limited") {
    return "Live discovery is temporarily busy. Scout switched to clearly labeled sample events.";
  }
  if (result.fallbackReason === "unavailable") {
    return "Live discovery could not complete this search. Scout switched to clearly labeled sample events.";
  }
  return null;
}

function formatOperationalTime(value: string | null) {
  if (!value) return "No recorded activity";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function App() {
  const [serviceState, setServiceState] = useState<ServiceState>("checking");
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId] = useState(() => crypto.randomUUID());
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [savingEvent, setSavingEvent] = useState<string | null>(null);
  const [reviewingPlan, setReviewingPlan] = useState<string | null>(null);
  const [commerceBusy, setCommerceBusy] = useState<string | null>(null);
  const [conversationMessage, setConversationMessage] = useState("");
  const [conversationBusy, setConversationBusy] = useState(false);
  const [conversationReply, setConversationReply] = useState(
    "Tell me what kind of night you want. I’ll turn it into exact, reviewable filters.",
  );
  const [conversationHistory, setConversationHistory] = useState<
    ConversationTurn[]
  >([]);
  const [conversationMeta, setConversationMeta] = useState<string[]>([]);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const [speechMuted, setSpeechMuted] = useState(
    () => localStorage.getItem("scout-speech-muted") === "true",
  );
  const [speechEnabled, setSpeechEnabled] = useState(
    () => localStorage.getItem("scout-speech-enabled") !== "false",
  );
  const [speechBusy, setSpeechBusy] = useState(false);
  const [preferences, setPreferences] = useState<PreferenceProfile>({
    categories: [],
    budgetMax: null,
    timePreference: "any",
    favoriteArtists: [],
    favoriteVenues: [],
    updatedAt: null,
  });
  const [alerts, setAlerts] = useState<InAppAlert[]>([]);
  const [helpRequests, setHelpRequests] = useState<HelpRequest[]>([]);
  const [lifecycleNotice, setLifecycleNotice] = useState<string | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [operationsState, setOperationsState] =
    useState<OperationsState>("locked");
  const [operationsSummary, setOperationsSummary] =
    useState<OperationsSummary | null>(null);
  const [operationsTimeline, setOperationsTimeline] = useState<
    OperationsTimelineItem[]
  >([]);
  const [operationsError, setOperationsError] = useState<string | null>(null);
  const [operationsCorrelation, setOperationsCorrelation] = useState("");
  const [commerceNotice, setCommerceNotice] = useState<string | null>(() => {
    const state = new URLSearchParams(window.location.search).get("checkout");
    if (state === "return") {
      return "Payment returned to Scout. Verification is still in progress.";
    }
    if (state === "cancelled") {
      return "Test checkout was closed. Nothing was confirmed or charged.";
    }
    return null;
  });
  const saveKeys = useRef(new Map<string, string>());
  const checkoutKeys = useRef(new Map<string, string>());
  const cancellationKeys = useRef(new Map<string, string>());
  const recorder = useRef<MediaRecorder | null>(null);
  const recordingStream = useRef<MediaStream | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const recordingStartedAt = useRef(0);
  const recordingTimer = useRef<number | null>(null);
  const recordingCancelled = useRef(false);
  const spokenAudio = useRef<HTMLAudioElement | null>(null);
  const spokenUrl = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/v1/health", { signal: controller.signal })
      .then((response) =>
        setServiceState(response.ok ? "online" : "unavailable"),
      )
      .catch((caught: unknown) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          setServiceState("unavailable");
        }
      });
    return () => controller.abort();
  }, []);

  const loadPlans = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/v1/plans", { signal });
    if (!response.ok) throw new Error("Saved plans are unavailable.");
    const payload = (await response.json()) as PlansResponse;
    setPlans(payload.data);
    return payload.data;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadPlans(controller.signal)
      .catch((caught: unknown) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          setPlansError(
            caught instanceof Error
              ? caught.message
              : "Saved plans are unavailable.",
          );
        }
      })
      .finally(() => setPlansLoading(false));
    return () => controller.abort();
  }, [loadPlans]);

  const loadLifecycle = useCallback(async () => {
    const [preferenceResponse, alertResponse, helpResponse] = await Promise.all(
      [
        fetch("/api/v1/preferences"),
        fetch("/api/v1/alerts"),
        fetch("/api/v1/help-requests"),
      ],
    );
    if (preferenceResponse.ok)
      setPreferences(
        ((await preferenceResponse.json()) as { data: PreferenceProfile }).data,
      );
    if (alertResponse.ok)
      setAlerts(((await alertResponse.json()) as { data: InAppAlert[] }).data);
    if (helpResponse.ok)
      setHelpRequests(
        ((await helpResponse.json()) as { data: HelpRequest[] }).data,
      );
  }, []);

  useEffect(() => {
    void loadLifecycle();
  }, [loadLifecycle]);

  useEffect(
    () => () => {
      if (recordingTimer.current) window.clearInterval(recordingTimer.current);
      recordingStream.current?.getTracks().forEach((track) => track.stop());
      spokenAudio.current?.pause();
      if (spokenUrl.current) URL.revokeObjectURL(spokenUrl.current);
    },
    [],
  );

  async function uploadRecording(blob: Blob, durationMs: number) {
    setVoiceState("transcribing");
    const form = new FormData();
    form.append("audio", blob, "scout-recording");
    form.append("durationMs", String(Math.min(durationMs, 30_000)));
    try {
      const response = await fetch("/api/v1/voice/transcriptions", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as {
        data?: { transcript: string };
        error?: { message?: string };
      };
      if (!response.ok || !payload.data?.transcript)
        throw new Error(
          payload.error?.message ||
            "Transcription failed. Type your request instead.",
        );
      setConversationMessage(payload.data.transcript);
      setVoiceState("review");
      setVoiceError(null);
    } catch (caught) {
      setVoiceState("idle");
      setVoiceError(
        caught instanceof Error
          ? caught.message
          : "Transcription failed. Type your request instead.",
      );
    }
  }

  async function startRecording() {
    setVoiceError(null);
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setVoiceError(
        "Voice recording is not supported here. Type your request instead.",
      );
      return;
    }
    setVoiceState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStream.current = stream;
      const preferred = [
        "audio/webm;codecs=opus",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const activeRecorder = preferred
        ? new MediaRecorder(stream, { mimeType: preferred })
        : new MediaRecorder(stream);
      recorder.current = activeRecorder;
      audioChunks.current = [];
      recordingCancelled.current = false;
      recordingStartedAt.current = Date.now();
      setVoiceSeconds(0);
      activeRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunks.current.push(event.data);
      };
      activeRecorder.onstop = () => {
        if (recordingTimer.current)
          window.clearInterval(recordingTimer.current);
        stream.getTracks().forEach((track) => track.stop());
        recordingStream.current = null;
        if (recordingCancelled.current) {
          setVoiceState("idle");
          return;
        }
        const duration = Math.min(
          Date.now() - recordingStartedAt.current,
          30_000,
        );
        const blob = new Blob(audioChunks.current, {
          type: activeRecorder.mimeType || "audio/webm",
        });
        void uploadRecording(blob, duration);
      };
      activeRecorder.start();
      setVoiceState("recording");
      recordingTimer.current = window.setInterval(() => {
        const elapsed = Math.min(
          30,
          Math.ceil((Date.now() - recordingStartedAt.current) / 1000),
        );
        setVoiceSeconds(elapsed);
        if (elapsed >= 30 && activeRecorder.state === "recording")
          activeRecorder.stop();
      }, 250);
    } catch (caught) {
      setVoiceState("idle");
      setVoiceError(
        caught instanceof DOMException && caught.name === "NotAllowedError"
          ? "Microphone access was denied. You can keep typing."
          : "The microphone could not start. You can keep typing.",
      );
    }
  }

  function stopRecording(cancel = false) {
    recordingCancelled.current = cancel;
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  async function speakReply() {
    if (!speechEnabled || speechMuted || !conversationReply) return;
    setSpeechBusy(true);
    try {
      const response = await fetch("/api/v1/voice/speech", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: conversationReply.slice(0, 600) }),
      });
      if (!response.ok)
        throw new Error(
          "Spoken response is unavailable; the text remains available.",
        );
      spokenAudio.current?.pause();
      if (spokenUrl.current) URL.revokeObjectURL(spokenUrl.current);
      spokenUrl.current = URL.createObjectURL(await response.blob());
      spokenAudio.current = new Audio(spokenUrl.current);
      await spokenAudio.current.play();
      setVoiceError(null);
    } catch (caught) {
      setVoiceError(
        caught instanceof Error
          ? caught.message
          : "Spoken response is unavailable; the text remains available.",
      );
    } finally {
      setSpeechBusy(false);
    }
  }

  function setMuted(muted: boolean) {
    setSpeechMuted(muted);
    localStorage.setItem("scout-speech-muted", String(muted));
    if (muted) spokenAudio.current?.pause();
  }

  function setSpokenEnabled(enabled: boolean) {
    setSpeechEnabled(enabled);
    localStorage.setItem("scout-speech-enabled", String(enabled));
    if (!enabled) spokenAudio.current?.pause();
  }

  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get("checkout") !== "return"
    )
      return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      void loadPlans()
        .then((current) => {
          if (current.some((plan) => plan.state === "confirmed")) {
            setCommerceNotice(
              "Payment verification received. Your test reservation is confirmed.",
            );
            window.clearInterval(timer);
          } else if (attempts >= 15) {
            setCommerceNotice(
              "Payment verification is still pending. Your plan will update only after Scout receives a verified Stripe webhook.",
            );
            window.clearInterval(timer);
          }
        })
        .catch(() => window.clearInterval(timer));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [loadPlans]);

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchState("loading");
    setError(null);

    const form = new FormData(event.currentTarget);
    const query = new URLSearchParams();
    for (const [key, value] of form.entries()) {
      if (String(value).trim()) query.set(key, String(value));
    }

    try {
      const response = await fetch(`/api/v1/events/search?${query}`, {
        headers: { "x-scout-session": sessionId },
      });
      const payload = (await response.json()) as SearchResponse & ErrorResponse;
      if (!response.ok) {
        const details = payload.error?.issues?.join(" ");
        throw new Error(
          details || payload.error?.message || "Search could not be completed.",
        );
      }
      setResult(payload);
      setSearchState("success");
    } catch (caught) {
      setSearchState("error");
      setError(
        caught instanceof Error
          ? caught.message
          : "Search could not be completed.",
      );
    }
  }

  async function submitConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = conversationMessage.trim();
    if (!message) return;
    setConversationBusy(true);
    setError(null);
    const history = conversationHistory.slice(-6);

    try {
      const response = await fetch("/api/v1/conversations/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-scout-session": sessionId,
        },
        body: JSON.stringify({ message, history, mode: "live" }),
      });
      const payload = (await response.json()) as ConversationResponse &
        ErrorResponse;
      if (!response.ok || !payload.data) {
        throw new Error(
          payload.error?.message || "Scout could not interpret that request.",
        );
      }
      setConversationReply(payload.data.assistantMessage);
      setConversationHistory([
        ...history,
        { role: "user", content: message },
        { role: "assistant", content: payload.data.assistantMessage },
      ]);
      setConversationMessage("");

      if (payload.data.status === "results") {
        setResult({
          data: payload.data.result,
          constraints: payload.data.constraints,
          requestId: payload.requestId,
        });
        setSearchState("success");
        setConversationMeta([
          formatConstraintDates(payload.data.constraints),
          payload.data.constraints.category === "all"
            ? "Any category"
            : payload.data.constraints.category,
          `${payload.data.constraints.partySize} people`,
          payload.data.constraints.budgetMax === null
            ? "Open budget"
            : `Under $${payload.data.constraints.budgetMax}`,
          payload.data.constraints.exactStartTime
            ? `Starts near ${formatLocalTime(payload.data.constraints.exactStartTime)}`
            : payload.data.constraints.timePreference === "any"
              ? "Any time"
              : payload.data.constraints.timePreference,
        ]);
        window.setTimeout(
          () =>
            document
              .querySelector("#results")
              ?.scrollIntoView({ behavior: "smooth" }),
          80,
        );
      } else {
        setConversationMeta(
          payload.data.status === "fallback"
            ? ["Exact filters ready below"]
            : ["One detail needed"],
        );
      }
    } catch (caught) {
      setConversationReply(
        caught instanceof Error
          ? caught.message
          : "Scout could not interpret that request.",
      );
      setConversationMeta(["Exact filters still available"]);
    } finally {
      setConversationBusy(false);
    }
  }

  async function savePlan(event: RankedEvent) {
    const eventKey = `${event.source}:${event.id}`;
    setSavingEvent(eventKey);
    setPlansError(null);
    let idempotencyKey = saveKeys.current.get(eventKey);
    if (!idempotencyKey) {
      idempotencyKey = crypto.randomUUID();
      saveKeys.current.set(eventKey, idempotencyKey);
    }

    try {
      const response = await fetch("/api/v1/plans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event, idempotencyKey }),
      });
      const payload = (await response.json()) as {
        data?: SavedPlan;
      } & ErrorResponse;
      if (!response.ok || !payload.data) {
        throw new Error(
          payload.error?.message || "This plan could not be saved.",
        );
      }
      setPlans((current) => {
        const withoutReplay = current.filter(
          (plan) => plan.id !== payload.data?.id,
        );
        return [payload.data as SavedPlan, ...withoutReplay];
      });
      document.querySelector("#plans")?.scrollIntoView({ behavior: "smooth" });
    } catch (caught) {
      setPlansError(
        caught instanceof Error
          ? caught.message
          : "This plan could not be saved.",
      );
    } finally {
      setSavingEvent(null);
    }
  }

  async function beginCheckout(plan: SavedPlan) {
    setCommerceBusy(plan.id);
    setPlansError(null);
    let idempotencyKey = checkoutKeys.current.get(plan.id);
    if (!idempotencyKey) {
      idempotencyKey = crypto.randomUUID();
      checkoutKeys.current.set(plan.id, idempotencyKey);
    }
    try {
      const response = await fetch("/api/v1/checkouts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reservationId: plan.id,
          idempotencyKey,
          confirmed: true,
        }),
      });
      const payload = (await response.json()) as {
        data?: { redirectUrl?: string };
      } & ErrorResponse;
      if (!response.ok || !payload.data?.redirectUrl) {
        throw new Error(
          payload.error?.message || "Test checkout could not be started.",
        );
      }
      window.location.assign(payload.data.redirectUrl);
    } catch (caught) {
      setPlansError(
        caught instanceof Error
          ? caught.message
          : "Test checkout could not be started.",
      );
      setCommerceBusy(null);
    }
  }

  async function cancelReservation(plan: SavedPlan) {
    setCommerceBusy(plan.id);
    setPlansError(null);
    let idempotencyKey = cancellationKeys.current.get(plan.id);
    if (!idempotencyKey) {
      idempotencyKey = crypto.randomUUID();
      cancellationKeys.current.set(plan.id, idempotencyKey);
    }
    try {
      const response = await fetch(`/api/v1/reservations/${plan.id}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmed: true, idempotencyKey }),
      });
      const payload = (await response.json()) as ErrorResponse;
      if (!response.ok) {
        throw new Error(
          payload.error?.message || "Cancellation could not be started.",
        );
      }
      await loadPlans();
      setReviewingPlan(null);
      setCommerceNotice(
        "Test cancellation requested. Scout will update the plan after refund verification.",
      );
    } catch (caught) {
      setPlansError(
        caught instanceof Error
          ? caught.message
          : "Cancellation could not be started.",
      );
    } finally {
      setCommerceBusy(null);
    }
  }

  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const split = (name: string) =>
      String(form.get(name) || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 10);
    const profile = {
      categories: form.getAll("categories") as PreferenceProfile["categories"],
      budgetMax: form.get("budgetMax") ? Number(form.get("budgetMax")) : null,
      timePreference: form.get(
        "timePreference",
      ) as PreferenceProfile["timePreference"],
      favoriteArtists: split("favoriteArtists"),
      favoriteVenues: split("favoriteVenues"),
      updatedAt: null,
    };
    setLifecycleBusy(true);
    try {
      const response = await fetch("/api/v1/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(profile),
      });
      const payload = (await response.json()) as {
        data?: PreferenceProfile;
        error?: { message?: string };
      };
      if (!response.ok || !payload.data)
        throw new Error(
          payload.error?.message || "Preferences could not be saved.",
        );
      setPreferences(payload.data);
      setLifecycleNotice(
        "Preferences updated. You can correct them at any time.",
      );
    } catch (caught) {
      setLifecycleNotice(
        caught instanceof Error
          ? caught.message
          : "Preferences could not be saved.",
      );
    } finally {
      setLifecycleBusy(false);
    }
  }

  async function refreshStatuses() {
    setLifecycleBusy(true);
    try {
      const response = await fetch("/api/v1/plans/status-refresh", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        data?: { checked: number; changes: Array<{ changed: boolean }> };
        error?: { message?: string };
      };
      if (!response.ok || !payload.data)
        throw new Error(payload.error?.message || "Status refresh failed.");
      await loadLifecycle();
      const changed = payload.data.changes.filter(
        (item) => item.changed,
      ).length;
      setLifecycleNotice(
        `Checked ${payload.data.checked} saved ${payload.data.checked === 1 ? "event" : "events"}. ${changed ? `${changed} status change${changed === 1 ? "" : "s"} found.` : "No provider status changes found."}`,
      );
    } catch (caught) {
      setLifecycleNotice(
        caught instanceof Error ? caught.message : "Status refresh failed.",
      );
    } finally {
      setLifecycleBusy(false);
    }
  }

  async function dismissAlert(id: string) {
    const response = await fetch(`/api/v1/alerts/${id}/dismiss`, {
      method: "POST",
    });
    if (response.ok)
      setAlerts((current) =>
        current.map((alert) =>
          alert.id === id
            ? { ...alert, readAt: new Date().toISOString() }
            : alert,
        ),
      );
  }

  async function requestHelp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLifecycleBusy(true);
    try {
      const response = await fetch("/api/v1/help-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reservationId: form.get("reservationId") || null,
          message: form.get("message"),
        }),
      });
      const payload = (await response.json()) as {
        data?: HelpRequest;
        error?: { message?: string };
      };
      if (!response.ok || !payload.data)
        throw new Error(
          payload.error?.message || "Help record could not be created.",
        );
      setHelpRequests((current) => [payload.data as HelpRequest, ...current]);
      setLifecycleNotice(
        "Help request saved. Scout does not currently offer staffed support.",
      );
    } catch (caught) {
      setLifecycleNotice(
        caught instanceof Error
          ? caught.message
          : "Help record could not be created.",
      );
    } finally {
      setLifecycleBusy(false);
    }
  }

  async function loadOperations(correlationId = operationsCorrelation) {
    setOperationsState("loading");
    setOperationsError(null);
    try {
      const query = new URLSearchParams({ limit: "50" });
      if (correlationId.trim())
        query.set("correlationId", correlationId.trim());
      const [summaryResponse, timelineResponse] = await Promise.all([
        fetch("/api/v1/ops/summary"),
        fetch(`/api/v1/ops/timeline?${query}`),
      ]);
      if (summaryResponse.status === 401 || timelineResponse.status === 401) {
        setOperationsState("locked");
        throw new Error("Operator authentication is required.");
      }
      const summaryPayload = (await summaryResponse.json()) as {
        data?: OperationsSummary;
        error?: { message?: string };
      };
      const timelinePayload = (await timelineResponse.json()) as {
        data?: OperationsTimelineItem[];
        error?: { message?: string };
      };
      if (
        !summaryResponse.ok ||
        !timelineResponse.ok ||
        !summaryPayload.data ||
        !timelinePayload.data
      )
        throw new Error(
          summaryPayload.error?.message ||
            timelinePayload.error?.message ||
            "Operations data is unavailable.",
        );
      setOperationsSummary(summaryPayload.data);
      setOperationsTimeline(timelinePayload.data);
      setOperationsState("ready");
    } catch (caught) {
      setOperationsError(
        caught instanceof Error
          ? caught.message
          : "Operations data is unavailable.",
      );
      setOperationsState((current) =>
        current === "locked" ? "locked" : "error",
      );
    }
  }

  async function unlockOperations(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const accessToken = String(form.get("accessToken") || "");
    setOperationsState("loading");
    setOperationsError(null);
    try {
      const response = await fetch("/api/v1/ops/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessToken }),
      });
      const payload = (await response.json()) as ErrorResponse;
      if (!response.ok)
        throw new Error(
          payload.error?.message || "Operator authentication failed.",
        );
      formElement.reset();
      await loadOperations("");
    } catch (caught) {
      setOperationsState("locked");
      setOperationsError(
        caught instanceof Error
          ? caught.message
          : "Operator authentication failed.",
      );
    }
  }

  async function lockOperations() {
    await fetch("/api/v1/ops/session", { method: "DELETE" });
    setOperationsSummary(null);
    setOperationsTimeline([]);
    setOperationsCorrelation("");
    setOperationsError(null);
    setOperationsState("locked");
  }

  const fallback = result ? fallbackMessage(result.data) : null;

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="announcement" aria-label="Scout product update">
        <span>New</span>
        <p>Live New York discovery, shaped around your plans.</p>
        <a href="#discover">
          Explore Scout <span aria-hidden="true">→</span>
        </a>
      </aside>
      <header className="topbar">
        <a className="brand" href="#main-content" aria-label="Scout home">
          <span className="brand-mark" aria-hidden="true">
            <Sparkles size={17} strokeWidth={2.4} />
          </span>
          Scout
        </a>
        <nav className="product-nav" aria-label="Primary navigation">
          <a href="#discover">Discover</a>
          <a href="#results">Recommendations</a>
          <a href="#plans">My plans</a>
        </nav>
        <div className="topbar-actions">
          <a className="plans-link" href="#plans">
            <Bookmark size={15} aria-hidden="true" />
            Plans <span>{plans.length}</span>
          </a>
          <div className="service-status" role="status" aria-live="polite">
            <span className={`status-dot status-dot--${serviceState}`} />
            {serviceState === "checking" && "Connecting"}
            {serviceState === "online" && "Live data"}
            {serviceState === "unavailable" && "Service issue"}
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-grid">
            <div className="hero-copy-block">
              <p className="eyebrow">AI events concierge · New York</p>
              <h1 id="hero-title">Your night, handled.</h1>
              <p className="hero-copy">
                Tell Scout what kind of night you want. Get live, explainable
                options—and stay in control from discovery to a saved plan.
              </p>
              <div className="hero-actions">
                <a className="hero-primary" href="#event-request">
                  Start with Scout <ArrowRight size={16} aria-hidden="true" />
                </a>
                <a className="hero-secondary" href="#discover">
                  Search with filters
                </a>
              </div>
              <div className="hero-proof" aria-label="Scout product safeguards">
                <span>
                  <strong>Live</strong> provider facts
                </span>
                <span>
                  <strong>Clear</strong> ranking reasons
                </span>
                <span>
                  <strong>Safe</strong> test checkout
                </span>
              </div>
            </div>

            <div className="concierge-stage">
              <div className="floating-signal floating-signal--provider">
                <span className="signal-icon" aria-hidden="true">
                  <Check size={15} strokeWidth={3} />
                </span>
                <span>
                  <strong>Live inventory</strong>Ticketmaster connected
                </span>
              </div>
              <div className="floating-signal floating-signal--control">
                <span className="signal-icon" aria-hidden="true">
                  <ShieldCheck size={15} strokeWidth={2.5} />
                </span>
                <span>
                  <strong>You approve actions</strong>No autonomous purchase
                </span>
              </div>
              <div className="concierge-card">
                <div className="concierge-heading">
                  <div className="assistant-avatar" aria-hidden="true">
                    <Sparkles size={17} strokeWidth={2.4} />
                  </div>
                  <div>
                    <strong>Scout concierge</strong>
                    <span>Live event discovery</span>
                  </div>
                  <span className="live-badge">Search only</span>
                </div>
                <div
                  className="assistant-reply"
                  role="status"
                  aria-live="polite"
                >
                  {conversationBusy ? (
                    <AgentActivity label="Finding the strongest matches" />
                  ) : (
                    <>
                      <span aria-hidden="true">✦</span>
                      <p>{conversationReply}</p>
                    </>
                  )}
                </div>
                <div
                  className="speech-controls"
                  aria-label="Spoken response controls"
                >
                  <button
                    className="icon-control"
                    type="button"
                    onClick={() => void speakReply()}
                    disabled={!speechEnabled || speechMuted || speechBusy}
                    aria-label={
                      speechBusy
                        ? "Preparing audio"
                        : spokenUrl.current
                          ? "Replay response"
                          : "Play response"
                    }
                    data-tooltip={
                      spokenUrl.current ? "Replay response" : "Play response"
                    }
                  >
                    {speechBusy ? (
                      <AudioLines size={15} aria-hidden="true" />
                    ) : (
                      <Volume2 size={15} aria-hidden="true" />
                    )}
                  </button>
                  <button
                    className="icon-control"
                    type="button"
                    onClick={() => spokenAudio.current?.pause()}
                    disabled={!spokenAudio.current}
                    aria-label="Stop audio"
                    data-tooltip="Stop audio"
                  >
                    <Square size={13} fill="currentColor" aria-hidden="true" />
                  </button>
                  <button
                    className="icon-control"
                    type="button"
                    aria-pressed={speechMuted}
                    aria-label={speechMuted ? "Unmute" : "Mute"}
                    data-tooltip={speechMuted ? "Unmute" : "Mute"}
                    onClick={() => setMuted(!speechMuted)}
                  >
                    {speechMuted ? (
                      <VolumeX size={15} aria-hidden="true" />
                    ) : (
                      <Volume2 size={15} aria-hidden="true" />
                    )}
                  </button>
                  <button
                    className="icon-control"
                    type="button"
                    aria-pressed={!speechEnabled}
                    aria-label={
                      speechEnabled ? "Disable voice" : "Enable voice"
                    }
                    data-tooltip={
                      speechEnabled ? "Disable voice" : "Enable voice"
                    }
                    onClick={() => setSpokenEnabled(!speechEnabled)}
                  >
                    <Headphones size={15} aria-hidden="true" />
                  </button>
                </div>
                {conversationMeta.length > 0 && (
                  <div className="conversation-meta">
                    {conversationMeta.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                )}
                <form className="concierge-form" onSubmit={submitConversation}>
                  <label htmlFor="event-request">
                    What are you in the mood for?
                  </label>
                  <textarea
                    id="event-request"
                    value={conversationMessage}
                    onChange={(event) =>
                      setConversationMessage(event.target.value)
                    }
                    maxLength={500}
                    rows={3}
                    placeholder="A funny date night next Friday, under $80 each…"
                  />
                  <div className="voice-controls">
                    {voiceState === "idle" || voiceState === "review" ? (
                      <button
                        className="icon-control icon-control--composer"
                        type="button"
                        onClick={() => void startRecording()}
                        aria-label="Use microphone"
                        data-tooltip="Use microphone"
                      >
                        <Mic size={16} aria-hidden="true" />
                      </button>
                    ) : voiceState === "requesting" ? (
                      <button type="button" disabled>
                        Requesting permission…
                      </button>
                    ) : voiceState === "recording" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => stopRecording(false)}
                        >
                          Stop · {voiceSeconds}s / 30s
                        </button>
                        <button
                          type="button"
                          onClick={() => stopRecording(true)}
                        >
                          Cancel recording
                        </button>
                      </>
                    ) : (
                      <button type="button" disabled>
                        Transcribing…
                      </button>
                    )}
                    {voiceState === "review" && (
                      <span>Transcript ready—edit it above, then submit.</span>
                    )}
                  </div>
                  {voiceError && (
                    <p className="voice-error" role="alert">
                      {voiceError}
                    </p>
                  )}
                  <div
                    className="prompt-suggestions"
                    aria-label="Example requests"
                  >
                    {["Live jazz this weekend", "Comedy for two under $80"].map(
                      (prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => setConversationMessage(prompt)}
                        >
                          {prompt}
                        </button>
                      ),
                    )}
                  </div>
                  <button
                    className="concierge-submit"
                    type="submit"
                    disabled={conversationBusy || !conversationMessage.trim()}
                  >
                    {conversationBusy ? "Planning…" : "Plan my night"}
                    <ArrowUp size={16} aria-hidden="true" />
                  </button>
                </form>
                <p className="concierge-footnote">
                  AI can search and explain. It cannot reserve, pay, or cancel.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          id="discover"
          className="discover-section"
          aria-labelledby="discover-title"
        >
          <div className="section-intro">
            <div>
              <p className="step-label">Structured discovery</p>
              <h2 id="discover-title">Every detail, in your hands.</h2>
            </div>
            <p>
              Prefer precise controls? Use the same discovery engine with every
              constraint visible and editable.
            </p>
          </div>
          <form className="search-card" onSubmit={submitSearch}>
            <div className="form-heading">
              <div>
                <p className="step-label">Your search</p>
                <h3>What does a great night look like?</h3>
              </div>
              <label className="mode-field">
                Data source
                <select name="mode" defaultValue="live">
                  <option value="live">Live results</option>
                  <option value="fixture">Sample results</option>
                </select>
              </label>
            </div>

            <input type="hidden" name="city" value="New York" />
            <div className="form-grid">
              <label>
                From
                <input
                  name="startDate"
                  type="date"
                  defaultValue={dateValue(1)}
                  min={dateValue(0)}
                  required
                />
              </label>
              <label>
                Through
                <input
                  name="endDate"
                  type="date"
                  defaultValue={dateValue(8)}
                  min={dateValue(0)}
                  required
                />
              </label>
              <label>
                Category
                <select name="category" defaultValue="all">
                  <option value="all">Anything</option>
                  <option value="music">Music</option>
                  <option value="sports">Sports</option>
                  <option value="arts">Arts &amp; theatre</option>
                  <option value="comedy">Comedy</option>
                  <option value="family">Family</option>
                </select>
              </label>
              <label>
                Time
                <select name="timePreference" defaultValue="any">
                  <option value="any">Any time</option>
                  <option value="daytime">Daytime</option>
                  <option value="evening">Evening</option>
                </select>
              </label>
              <label>
                Exact start time
                <input name="exactStartTime" type="time" step="60" />
              </label>
              <label>
                Party size
                <input
                  name="partySize"
                  type="number"
                  defaultValue="2"
                  min="1"
                  max="12"
                  required
                />
              </label>
              <label>
                Budget per person
                <span className="money-input">
                  <span aria-hidden="true">$</span>
                  <input
                    name="budgetMax"
                    type="number"
                    min="1"
                    max="10000"
                    placeholder="Optional"
                  />
                </span>
              </label>
            </div>

            <div className="form-action">
              <p>Up to 30 days · Provider availability is not guaranteed</p>
              <button type="submit" disabled={searchState === "loading"}>
                <Search size={16} aria-hidden="true" />
                {searchState === "loading" ? "Searching…" : "Find events"}
              </button>
            </div>
          </form>
        </section>

        <section
          id="results"
          className="results"
          aria-live="polite"
          aria-busy={searchState === "loading"}
        >
          {searchState === "loading" && (
            <div className="state-card">
              <AgentActivity label="Checking live inventory and ranking the evidence" />
            </div>
          )}
          {searchState === "error" && (
            <div className="state-card state-card--error">
              <strong>Search needs attention.</strong>
              <p>{error}</p>
            </div>
          )}
          {result && searchState === "success" && (
            <>
              <div className="results-heading">
                <div>
                  <p className="step-label">Ranked by fit</p>
                  <h2>
                    {result.data.events.length}{" "}
                    {result.data.events.length === 1 ? "event" : "events"} to
                    consider
                  </h2>
                </div>
                <span
                  className={`source-pill source-pill--${result.data.mode}`}
                >
                  {result.data.mode === "live" ? "Live results" : "Sample data"}
                </span>
              </div>
              {fallback && (
                <div className="notice" role="status">
                  {fallback}
                </div>
              )}
              {result.data.events.length === 0 ? (
                <div className="state-card">
                  <strong>
                    {result.constraints.exactStartTime
                      ? "No exact-time matches."
                      : "No matching events."}
                  </strong>
                  <p>
                    {result.constraints.exactStartTime
                      ? `No provider event starts within 30 minutes of ${formatLocalTime(result.constraints.exactStartTime)}.`
                      : "Try another category, a wider date range, or remove the budget."}
                  </p>
                </div>
              ) : (
                <div className="event-grid">
                  {result.data.events.map((item) => (
                    <EventCard
                      key={`${item.source}:${item.id}`}
                      event={item}
                      onSave={savePlan}
                      saving={savingEvent === `${item.source}:${item.id}`}
                      saved={plans.some(
                        (plan) =>
                          plan.event.source === item.source &&
                          plan.event.id === item.id,
                      )}
                    />
                  ))}
                </div>
              )}
              {result.data.alternatives.length > 0 && (
                <div className="alternatives">
                  <div className="results-heading">
                    <div>
                      <p className="step-label">
                        Outside the exact-time window
                      </p>
                      <h3>Nearest alternatives</h3>
                    </div>
                  </div>
                  <div className="notice">
                    These events do not start within 30 minutes of your
                    requested time.
                  </div>
                  <div className="event-grid">
                    {result.data.alternatives.map((item) => (
                      <EventCard
                        key={`alternative:${item.source}:${item.id}`}
                        event={item}
                        onSave={savePlan}
                        saving={savingEvent === `${item.source}:${item.id}`}
                        saved={plans.some(
                          (plan) =>
                            plan.event.source === item.source &&
                            plan.event.id === item.id,
                        )}
                      />
                    ))}
                  </div>
                </div>
              )}
              <p className="freshness">
                Observed {new Date(result.data.observedAt).toLocaleString()} ·
                Request {result.requestId}
              </p>
            </>
          )}
        </section>

        <section id="plans" className="plans" aria-labelledby="plans-title">
          <div className="results-heading">
            <div>
              <p className="step-label">Durable drafts</p>
              <h2 id="plans-title">My Plans</h2>
            </div>
          </div>
          <p className="plans-intro">
            Saved events stay private to this browser until you check out.
          </p>
          {commerceNotice && (
            <div className="notice" role="status">
              {commerceNotice}
            </div>
          )}
          {plansError && (
            <div className="state-card state-card--error" role="alert">
              <strong>My Plans needs attention.</strong>
              <p>{plansError}</p>
            </div>
          )}
          {plansLoading ? (
            <div className="state-card">Loading saved plans…</div>
          ) : plans.length === 0 ? (
            <div className="state-card">
              <strong>No saved plans yet.</strong>
              <p>
                Search above and save an event to keep its observed details.
              </p>
            </div>
          ) : (
            <div className="plan-list">
              {plans.map((plan) => (
                <article className="plan-card" key={plan.id}>
                  <div>
                    <span className="plan-state">{planStateLabel(plan)}</span>
                    <h3>{plan.event.name}</h3>
                    <p>{formatEventDate(plan.event)}</p>
                    <p>
                      {plan.event.venue.name || "Venue not supplied"} ·{" "}
                      {formatPrice(plan.event)}
                    </p>
                    {plan.state === "draft" && (
                      <p className="plan-trust-note">
                        A draft is not a reservation, ticket, or purchase.
                      </p>
                    )}
                    {plan.state === "confirmed" && plan.checkout && (
                      <div className="demo-receipt">
                        <strong>Receipt</strong>
                        <span>
                          ${(plan.checkout.amountMinor / 100).toFixed(2)}{" "}
                          {plan.checkout.currency.toUpperCase()}
                        </span>
                        <span>Receipt {plan.checkout.id}</span>
                        <span>
                          Confirmed{" "}
                          {plan.checkout.completedAt
                            ? new Date(
                                plan.checkout.completedAt,
                              ).toLocaleString()
                            : "by verified webhook"}
                        </span>
                        <em>Test mode · no event ticket was issued.</em>
                      </div>
                    )}
                    {reviewingPlan === plan.id && plan.state === "draft" && (
                      <div className="confirmation-card" role="group">
                        <strong>Review test checkout</strong>
                        <p>
                          Stripe will simulate a $1.00 USD payment. It creates
                          no real charge, reservation, or event ticket.
                        </p>
                        <div>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => setReviewingPlan(null)}
                          >
                            Go back
                          </button>
                          <button
                            type="button"
                            className="commerce-button"
                            disabled={commerceBusy === plan.id}
                            onClick={() => void beginCheckout(plan)}
                          >
                            {commerceBusy === plan.id
                              ? "Starting…"
                              : "Confirm and continue to Stripe"}
                          </button>
                        </div>
                      </div>
                    )}
                    {reviewingPlan === plan.id &&
                      plan.state === "confirmed" && (
                        <div className="confirmation-card" role="group">
                          <strong>Review test cancellation</strong>
                          <p>
                            This requests a refund of the $1.00 Stripe test
                            payment. It does not cancel an event ticket.
                          </p>
                          <div>
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => setReviewingPlan(null)}
                            >
                              Keep plan
                            </button>
                            <button
                              type="button"
                              className="commerce-button commerce-button--danger"
                              disabled={commerceBusy === plan.id}
                              onClick={() => void cancelReservation(plan)}
                            >
                              {commerceBusy === plan.id
                                ? "Requesting…"
                                : "Confirm test refund"}
                            </button>
                          </div>
                        </div>
                      )}
                    {plan.state === "draft" && reviewingPlan !== plan.id && (
                      <button
                        type="button"
                        className="commerce-button"
                        onClick={() => setReviewingPlan(plan.id)}
                      >
                        Review $1 test checkout
                      </button>
                    )}
                    {plan.state === "confirmed" &&
                      reviewingPlan !== plan.id && (
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => setReviewingPlan(plan.id)}
                        >
                          Cancel test reservation
                        </button>
                      )}
                  </div>
                  <div className="plan-facts">
                    <span>
                      {plan.event.source === "ticketmaster"
                        ? "Ticketmaster snapshot"
                        : "Sample event snapshot"}
                    </span>
                    <span>
                      Saved {new Date(plan.createdAt).toLocaleString()}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section
          id="lifecycle"
          className="lifecycle"
          aria-labelledby="lifecycle-title"
        >
          <div className="results-heading">
            <div>
              <p className="step-label">After you save</p>
              <h2 id="lifecycle-title">Preferences &amp; assistance</h2>
            </div>
            <button
              className="secondary-button"
              type="button"
              disabled={lifecycleBusy || plans.length === 0}
              onClick={() => void refreshStatuses()}
            >
              <RefreshCw size={15} aria-hidden="true" />
              Refresh provider status
            </button>
          </div>
          <p className="plans-intro">
            Keep preferences current, recheck saved events, or ask for help.
            Availability always comes from the event provider.
          </p>
          {lifecycleNotice && (
            <div className="notice" role="status">
              {lifecycleNotice}
            </div>
          )}
          {alerts
            .filter((alert) => !alert.readAt)
            .map((alert) => (
              <div className="lifecycle-alert" key={alert.id}>
                <div>
                  <strong>Saved-event update</strong>
                  <p>{alert.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void dismissAlert(alert.id)}
                >
                  Dismiss
                </button>
              </div>
            ))}
          <div className="lifecycle-grid">
            <form
              className="lifecycle-card"
              onSubmit={savePreferences}
              key={preferences.updatedAt ?? "empty-preferences"}
            >
              <h3>Preference profile</h3>
              <fieldset>
                <legend>Favorite categories</legend>
                {["music", "sports", "arts", "comedy", "family"].map(
                  (category) => (
                    <label key={category}>
                      <input
                        type="checkbox"
                        name="categories"
                        value={category}
                        defaultChecked={preferences.categories.includes(
                          category as PreferenceProfile["categories"][number],
                        )}
                      />{" "}
                      {category}
                    </label>
                  ),
                )}
              </fieldset>
              <label>
                Usual budget per person
                <input
                  name="budgetMax"
                  type="number"
                  min="1"
                  max="10000"
                  defaultValue={preferences.budgetMax ?? ""}
                />
              </label>
              <label>
                Preferred time
                <select
                  name="timePreference"
                  defaultValue={preferences.timePreference}
                >
                  <option value="any">Any time</option>
                  <option value="daytime">Daytime</option>
                  <option value="evening">Evening</option>
                </select>
              </label>
              <label>
                Favorite artists, comma separated
                <input
                  name="favoriteArtists"
                  defaultValue={preferences.favoriteArtists.join(", ")}
                  maxLength={500}
                />
              </label>
              <label>
                Favorite venues, comma separated
                <input
                  name="favoriteVenues"
                  defaultValue={preferences.favoriteVenues.join(", ")}
                  maxLength={500}
                />
              </label>
              <button
                className="commerce-button"
                type="submit"
                disabled={lifecycleBusy}
              >
                Save corrections
              </button>
            </form>
            <form className="lifecycle-card" onSubmit={requestHelp}>
              <h3>Request help</h3>
              <p>
                This records a request in Scout’s operations data. Nobody is
                automatically contacted.
              </p>
              <label>
                Related plan
                <select name="reservationId" defaultValue="">
                  <option value="">General question</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.event.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                What needs attention?
                <textarea
                  name="message"
                  minLength={5}
                  maxLength={500}
                  required
                  rows={4}
                />
              </label>
              <button
                className="commerce-button"
                type="submit"
                disabled={lifecycleBusy}
              >
                Create help record
              </button>
              {helpRequests.length > 0 && (
                <div className="help-history">
                  <strong>Inspectable records</strong>
                  {helpRequests.map((request) => (
                    <p key={request.id}>
                      <span>Open</span> {request.message}
                    </p>
                  ))}
                </div>
              )}
            </form>
          </div>
        </section>

        <section
          id="operations"
          className="operations"
          aria-labelledby="operations-title"
        >
          <div className="results-heading">
            <div>
              <p className="step-label">Protected reviewer evidence</p>
              <h2 id="operations-title">Operations</h2>
            </div>
            {operationsState === "ready" && (
              <button
                className="secondary-button"
                type="button"
                onClick={() => void lockOperations()}
              >
                Lock operations
              </button>
            )}
          </div>
          <p className="plans-intro">
            This read-only view uses redacted D1 records. It never displays
            prompts, transcripts, audio, cookies, credentials, or card data.
          </p>

          {(operationsState === "locked" || operationsState === "loading") &&
            !operationsSummary && (
              <form className="operations-login" onSubmit={unlockOperations}>
                <label htmlFor="ops-token">Operator access token</label>
                <input
                  id="ops-token"
                  name="accessToken"
                  type="password"
                  autoComplete="current-password"
                  minLength={24}
                  required
                />
                <button
                  className="commerce-button"
                  type="submit"
                  disabled={operationsState === "loading"}
                >
                  {operationsState === "loading"
                    ? "Unlocking…"
                    : "Unlock operations"}
                </button>
              </form>
            )}
          {operationsError && (
            <div className="state-card state-card--error" role="alert">
              {operationsError}
            </div>
          )}

          {operationsSummary && operationsState !== "locked" && (
            <div className="operations-console">
              <div
                className="operations-summary"
                aria-label="Operations summary"
                role="region"
              >
                {Object.entries(operationsSummary.counts).map(
                  ([label, count]) => (
                    <article key={label}>
                      <strong>{count}</strong>
                      <span>{label.replace(/([A-Z])/g, " $1")}</span>
                    </article>
                  ),
                )}
              </div>
              <p className="operations-freshness">
                Latest stored activity:{" "}
                {formatOperationalTime(operationsSummary.recentActivityAt)}
              </p>
              <form
                className="operations-filter"
                onSubmit={(event) => {
                  event.preventDefault();
                  void loadOperations();
                }}
              >
                <label htmlFor="ops-correlation">Correlation ID</label>
                <input
                  id="ops-correlation"
                  value={operationsCorrelation}
                  onChange={(event) =>
                    setOperationsCorrelation(event.target.value)
                  }
                  placeholder="Filter one request, or leave blank"
                  maxLength={128}
                />
                <button className="secondary-button" type="submit">
                  Apply filter
                </button>
              </form>

              {operationsTimeline.length === 0 ? (
                <div className="state-card">
                  No stored operations match this correlation ID.
                </div>
              ) : (
                <ol className="operations-timeline">
                  {operationsTimeline.map((item) => (
                    <li key={`${item.kind}:${item.id}`}>
                      <div className="operations-item-heading">
                        <span>{item.kind}</span>
                        <strong>{item.label}</strong>
                        {item.status && (
                          <em
                            className={`operations-status operations-status--${item.status}`}
                          >
                            {item.status}
                          </em>
                        )}
                      </div>
                      <p>
                        {formatOperationalTime(item.occurredAt)} ·{" "}
                        <code>{item.correlationId}</code>
                      </p>
                      <dl>
                        {item.subject && (
                          <>
                            <dt>Subject</dt>
                            <dd>{item.subject}</dd>
                          </>
                        )}
                        {item.durationMs !== null && (
                          <>
                            <dt>Duration</dt>
                            <dd>{item.durationMs} ms</dd>
                          </>
                        )}
                        {item.failureCategory && (
                          <>
                            <dt>Failure</dt>
                            <dd>{item.failureCategory}</dd>
                          </>
                        )}
                      </dl>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </section>

        <section className="trust-grid" aria-label="How Scout works">
          <article>
            <span>01</span>
            <h2>Live sources</h2>
            <p>Fresh event details with source and pricing context.</p>
          </article>
          <article>
            <span>02</span>
            <h2>Explainable fit</h2>
            <p>Clear reasons show why each recommendation fits your request.</p>
          </article>
          <article>
            <span>03</span>
            <h2>You stay in control</h2>
            <p>Scout asks before every checkout, cancellation, or refund.</p>
          </article>
        </section>
      </main>

      <footer>
        <p>Live discovery · Stripe test checkout</p>
      </footer>
    </div>
  );
}

function AgentActivity({ label }: { label: string }) {
  return (
    <span className="agent-activity">
      <span className="pixel-loader" aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => (
          <span
            key={index}
            style={{ animationDelay: `${(index % 4) * 90}ms` }}
          />
        ))}
      </span>
      <span className="agent-activity-label">{label}</span>
    </span>
  );
}

function planStateLabel(plan: SavedPlan) {
  if (plan.state === "draft") {
    return plan.checkout?.state === "failed"
      ? "Draft · test payment failed"
      : plan.checkout?.state === "expired"
        ? "Draft · test checkout expired"
        : "Draft · no payment";
  }
  if (plan.state === "payment_pending") return "Test payment · verifying";
  if (plan.state === "confirmed") return "Confirmed · test reservation";
  if (plan.state === "cancellation_pending")
    return "Cancellation · test refund pending";
  return "Cancelled · test refund complete";
}

function EventCard({
  event,
  onSave,
  saving,
  saved,
}: {
  event: RankedEvent;
  onSave: (event: RankedEvent) => Promise<void>;
  saving: boolean;
  saved: boolean;
}) {
  const category =
    event.classification.genre ||
    event.classification.segment ||
    "Unclassified";
  return (
    <article className="event-card">
      {event.image ? (
        <img src={event.image.url} alt="" loading="lazy" />
      ) : (
        <div className="event-art" aria-hidden="true">
          <span>{category.slice(0, 1)}</span>
        </div>
      )}
      <div className="event-card-body">
        <div className="event-meta">
          <span>{category}</span>
          <span>{event.score} fit</span>
        </div>
        <h3>{event.name}</h3>
        <p className="event-date">{formatEventDate(event)}</p>
        <p className="event-venue">
          {event.venue.name || "Venue not supplied"} ·{" "}
          {event.venue.city || "City not supplied"}
        </p>
        <p className="event-price">{formatPrice(event)}</p>
        <div className="reason-list" aria-label="Why this event ranked here">
          {event.scoreReasons.slice(0, 3).map((reason) => (
            <span key={reason}>{reason}</span>
          ))}
        </div>
        <button
          className="save-button"
          type="button"
          disabled={saving || saved}
          onClick={() => void onSave(event)}
        >
          <Bookmark size={15} aria-hidden="true" />
          {saving ? "Saving…" : saved ? "Saved to My Plans" : "Save as draft"}
        </button>
        <details>
          <summary>View details</summary>
          <div className="detail-panel">
            <dl>
              <div>
                <dt>Source</dt>
                <dd>
                  {event.source === "ticketmaster"
                    ? "Ticketmaster Discovery"
                    : "Scout sample data"}
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{event.status || "Not supplied"}</dd>
              </div>
              <div>
                <dt>Timezone</dt>
                <dd>{event.timezone || "Not supplied"}</dd>
              </div>
              <div>
                <dt>Provider ID</dt>
                <dd>{event.id}</dd>
              </div>
            </dl>
            <a href={event.providerUrl} target="_blank" rel="noreferrer">
              Open provider page <ExternalLink size={14} aria-hidden="true" />
            </a>
            <p>
              {event.source === "fixture"
                ? "Sample event—not live inventory."
                : "Provider availability, fees, and final price may differ."}
            </p>
          </div>
        </details>
      </div>
    </article>
  );
}
