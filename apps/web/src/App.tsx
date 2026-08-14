import { useEffect, useState } from "react";

type ServiceState = "checking" | "online" | "unavailable";

export function App() {
  const [serviceState, setServiceState] = useState<ServiceState>("checking");

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/v1/health", { signal: controller.signal })
      .then((response) => {
        setServiceState(response.ok ? "online" : "unavailable");
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setServiceState("unavailable");
        }
      });

    return () => controller.abort();
  }, []);

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
            Tell Scout the kind of night you want. It will turn your constraints
            into clear, explainable options—without hiding what the provider
            does not know.
          </p>

          <form
            className="search-card"
            onSubmit={(event) => event.preventDefault()}
          >
            <label htmlFor="event-request">What sounds good?</label>
            <div className="search-row">
              <input
                id="event-request"
                name="event-request"
                type="text"
                placeholder="A funny date night next Friday, under $120 total"
                disabled
              />
              <button type="submit" disabled>
                Find events
              </button>
            </div>
            <p className="field-note">
              Live discovery arrives in Phase 3. This foundation does not invent
              results.
            </p>
          </form>
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
            <h2>You confirm</h2>
            <p>Consequential demo actions always wait for explicit approval.</p>
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
