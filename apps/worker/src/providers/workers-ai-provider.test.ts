import { describe, expect, it, vi } from "vitest";

import { WorkersAIProvider } from "./workers-ai-provider";

describe("WorkersAIProvider", () => {
  it("returns only validated structured search intent", async () => {
    const run = vi.fn(async () => ({
      response: JSON.stringify({
        action: "search_events",
        startDate: "2026-08-15",
        endDate: "2026-08-16",
        category: "music",
        budgetMax: 100,
        partySize: 2,
        timePreference: "evening",
        exactStartTime: "17:00",
        missingFields: [],
      }),
    }));
    const provider = new WorkersAIProvider({ run });
    await expect(
      provider.extractSearchIntent({
        message: "Jazz this weekend for two",
        today: "2026-08-13",
        contextSummary: "",
      }),
    ).resolves.toMatchObject({
      action: "search_events",
      category: "music",
      exactStartTime: "17:00",
    });
    expect(run).toHaveBeenCalledOnce();
  });

  it("rejects invented actions and malformed values", async () => {
    const provider = new WorkersAIProvider({
      run: vi.fn(async () => ({
        response: JSON.stringify({ action: "purchase_tickets" }),
      })),
    });
    await expect(
      provider.extractSearchIntent({
        message: "Buy it",
        today: "2026-08-13",
        contextSummary: "",
      }),
    ).rejects.toThrow();
  });

  it("rejects malformed exact-time output", async () => {
    const provider = new WorkersAIProvider({
      run: vi.fn(async () => ({
        response: JSON.stringify({
          action: "search_events",
          startDate: "2026-08-15",
          endDate: "2026-08-15",
          category: "all",
          budgetMax: null,
          partySize: 2,
          timePreference: "any",
          exactStartTime: "5 PM",
          missingFields: [],
        }),
      })),
    });
    await expect(
      provider.extractSearchIntent({
        message: "Shows at 5 PM",
        today: "2026-08-13",
        contextSummary: "",
      }),
    ).rejects.toThrow("exact start time");
  });
});
