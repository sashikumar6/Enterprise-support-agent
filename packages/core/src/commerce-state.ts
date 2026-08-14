export type CheckoutState =
  "created" | "pending" | "succeeded" | "failed" | "expired";

export type ReservationState =
  | "draft"
  | "payment_pending"
  | "confirmed"
  | "cancellation_pending"
  | "cancelled";

interface VersionedState<State extends string> {
  state: State;
  version: number;
}

interface TransitionCommand<State extends string> {
  to: State;
  expectedVersion: number;
  operationId: string;
}

interface TransitionResult<State extends string> {
  outcome: "applied" | "replayed";
  aggregate: VersionedState<State>;
}

export class InvalidStateTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Cannot transition from ${from} to ${to}.`);
    this.name = "InvalidStateTransitionError";
  }
}

export class VersionConflictError extends Error {
  constructor(expected: number, actual: number) {
    super(`Expected version ${expected}, but found ${actual}.`);
    this.name = "VersionConflictError";
  }
}

const checkoutTransitions: Record<CheckoutState, readonly CheckoutState[]> = {
  created: ["pending", "expired"],
  pending: ["succeeded", "failed", "expired"],
  succeeded: [],
  failed: [],
  expired: [],
};

const reservationTransitions: Record<
  ReservationState,
  readonly ReservationState[]
> = {
  draft: ["payment_pending"],
  payment_pending: ["confirmed", "draft"],
  confirmed: ["cancellation_pending"],
  cancellation_pending: ["cancelled", "confirmed"],
  cancelled: [],
};

function applyTransition<State extends string>(
  current: VersionedState<State>,
  command: TransitionCommand<State>,
  appliedOperationIds: ReadonlySet<string>,
  allowed: Record<State, readonly State[]>,
): TransitionResult<State> {
  if (appliedOperationIds.has(command.operationId)) {
    return { outcome: "replayed", aggregate: current };
  }
  if (command.expectedVersion !== current.version) {
    throw new VersionConflictError(command.expectedVersion, current.version);
  }
  if (!allowed[current.state].includes(command.to)) {
    throw new InvalidStateTransitionError(current.state, command.to);
  }
  return {
    outcome: "applied",
    aggregate: { state: command.to, version: current.version + 1 },
  };
}

export function applyCheckoutTransition(
  current: VersionedState<CheckoutState>,
  command: TransitionCommand<CheckoutState>,
  appliedOperationIds: ReadonlySet<string>,
) {
  return applyTransition(
    current,
    command,
    appliedOperationIds,
    checkoutTransitions,
  );
}

export function applyReservationTransition(
  current: VersionedState<ReservationState>,
  command: TransitionCommand<ReservationState>,
  appliedOperationIds: ReadonlySet<string>,
) {
  return applyTransition(
    current,
    command,
    appliedOperationIds,
    reservationTransitions,
  );
}
