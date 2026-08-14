import { describe, expect, it } from "vitest";

import {
  applyCheckoutTransition,
  applyReservationTransition,
  InvalidStateTransitionError,
  VersionConflictError,
} from "./commerce-state";

describe("commerce state machines", () => {
  it("applies valid checkout and reservation transitions", () => {
    expect(
      applyCheckoutTransition(
        { state: "created", version: 0 },
        { to: "pending", expectedVersion: 0, operationId: "checkout-1" },
        new Set(),
      ),
    ).toEqual({
      outcome: "applied",
      aggregate: { state: "pending", version: 1 },
    });

    expect(
      applyReservationTransition(
        { state: "draft", version: 0 },
        { to: "payment_pending", expectedVersion: 0, operationId: "plan-1" },
        new Set(),
      ),
    ).toEqual({
      outcome: "applied",
      aggregate: { state: "payment_pending", version: 1 },
    });
  });

  it("rejects invalid transitions", () => {
    expect(() =>
      applyReservationTransition(
        { state: "draft", version: 0 },
        { to: "confirmed", expectedVersion: 0, operationId: "skip-payment" },
        new Set(),
      ),
    ).toThrow(InvalidStateTransitionError);
  });

  it("treats a repeated operation as a safe replay", () => {
    expect(
      applyCheckoutTransition(
        { state: "pending", version: 1 },
        { to: "pending", expectedVersion: 0, operationId: "checkout-1" },
        new Set(["checkout-1"]),
      ),
    ).toEqual({
      outcome: "replayed",
      aggregate: { state: "pending", version: 1 },
    });
  });

  it("rejects a concurrent-looking stale version", () => {
    expect(() =>
      applyCheckoutTransition(
        { state: "pending", version: 2 },
        { to: "succeeded", expectedVersion: 1, operationId: "late-event" },
        new Set(),
      ),
    ).toThrow(VersionConflictError);
  });
});
