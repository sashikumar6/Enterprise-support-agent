import type {
  EventSearchConstraints,
  EventSearchResult,
  RankedEvent,
} from "@scout/core";
import { useEffect, useState, type FormEvent } from "react";

type ServiceState = "checking" | "online" | "unavailable";
type SearchState = "idle" | "loading" | "success" | "error";

interface SearchResponse {
  data: EventSearchResult;
  constraints: EventSearchConstraints;
  requestId: string;
}

interface ErrorResponse {
  error?: { message?: string; issues?: string[] };
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

function formatEventDate(event: RankedEvent) {
  const date = new Date(`${event.localDate}T12:00:00`);
  const day = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
  if (!event.localTime) return `${day} · Time not supplied`;
  const [hours, minutes] = event.localTime.split(":").map(Number);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2026, 0, 1, hours, minutes));
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
    return "Live discovery is not configured, so Scout is showing clearly labeled demo events.";
  }
  if (result.fallbackReason === "invalid_credentials") {
    return "Ticketmaster rejected the configured key. Scout switched to clearly labeled demo events.";
  }
  if (result.fallbackReason === "rate_limited") {
    return "Ticketmaster rate-limited this search. Scout switched to clearly labeled demo events.";
  }
  if (result.fallbackReason === "unavailable") {
    return "Ticketmaster could not complete this search. Scout switched to clearly labeled demo events.";
  }
  return null;
}

export function App() {
  const [serviceState, setServiceState] = useState<ServiceState>("checking");
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId] = useState(() => crypto.randomUUID());

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

  const fallback = result ? fallbackMessage(result.data) : null;

  return (
    <div className="site-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Scout home">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          Scout
        </a>
        <div className="service-status" role="status" aria-live="polite">
          <span className={`status-dot status-dot--${serviceState}`} />
          {serviceState === "checking" && "Checking system"}
          {serviceState === "online" && "System online"}
          {serviceState === "unavailable" && "System unavailable"}
        </div>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <p className="eyebrow">
            New York · Events indexed by Ticketmaster sources
          </p>
          <h1 id="hero-title">Less searching. More going.</h1>
          <p className="hero-copy">
            Set the shape of your night. Scout filters and ranks provider facts
            with clear reasons—and leaves unknown prices unknown.
          </p>

          <form className="search-card" onSubmit={submitSearch}>
            <div className="form-heading">
              <div>
                <p className="step-label">Deterministic discovery</p>
                <h2>Find your fit</h2>
              </div>
              <label className="mode-field">
                Data source
                <select name="mode" defaultValue="live">
                  <option value="live">Live with demo fallback</option>
                  <option value="fixture">Demo fixtures only</option>
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
                {searchState === "loading" ? "Searching…" : "Find events"}
              </button>
            </div>
          </form>
        </section>

        <section
          className="results"
          aria-live="polite"
          aria-busy={searchState === "loading"}
        >
          {searchState === "loading" && (
            <div className="state-card">
              Checking the provider and ranking the evidence…
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
                  {result.data.mode === "live"
                    ? "Live provider data"
                    : "Demo fixture data"}
                </span>
              </div>
              {fallback && (
                <div className="notice" role="status">
                  {fallback}
                </div>
              )}
              {result.data.events.length === 0 ? (
                <div className="state-card">
                  <strong>No matching events.</strong>
                  <p>
                    Try another category, a wider date range, or remove the
                    budget.
                  </p>
                </div>
              ) : (
                <div className="event-grid">
                  {result.data.events.map((item) => (
                    <EventCard key={`${item.source}:${item.id}`} event={item} />
                  ))}
                </div>
              )}
              <p className="freshness">
                Observed {new Date(result.data.observedAt).toLocaleString()} ·
                Request {result.requestId}
              </p>
            </>
          )}
        </section>

        <section className="trust-grid" aria-label="How Scout works">
          <article>
            <span>01</span>
            <h2>Live sources</h2>
            <p>Provider, freshness, and missing-price details stay visible.</p>
          </article>
          <article>
            <span>02</span>
            <h2>Explainable fit</h2>
            <p>
              Code ranks the evidence; AI never creates availability or price.
            </p>
          </article>
          <article>
            <span>03</span>
            <h2>No purchase yet</h2>
            <p>
              Discovery links to the provider. Scout cannot reserve or issue
              tickets in this phase.
            </p>
          </article>
        </section>
      </main>

      <footer>
        <p>
          Scout is a feasibility demo. It does not sell or issue real tickets.
        </p>
      </footer>
    </div>
  );
}

function EventCard({ event }: { event: RankedEvent }) {
  const category =
    event.classification.genre ||
    event.classification.segment ||
    "Category not supplied";
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
        <details>
          <summary>View details</summary>
          <div className="detail-panel">
            <dl>
              <div>
                <dt>Source</dt>
                <dd>
                  {event.source === "ticketmaster"
                    ? "Ticketmaster Discovery"
                    : "Scout demo fixture"}
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
              Open provider page <span aria-hidden="true">↗</span>
            </a>
            <p>
              {event.source === "fixture"
                ? "Demo event only; this is not real inventory."
                : "Provider availability, fees, and final price may differ."}
            </p>
          </div>
        </details>
      </div>
    </article>
  );
}
