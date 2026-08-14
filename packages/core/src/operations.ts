export type OperationsToolStatus = "completed" | "degraded" | "failed";
export type OperationsProviderStatus = "healthy" | "degraded" | "unavailable";

export interface OperationsSummary {
  counts: {
    reservations: number;
    checkouts: number;
    paymentEvents: number;
    auditEvents: number;
    toolInvocations: number;
    providerHealthEvents: number;
  };
  reservationStates: Record<string, number>;
  recentActivityAt: string | null;
}

export interface OperationsTimelineItem {
  id: string;
  kind: "audit" | "tool" | "provider" | "transition" | "payment";
  occurredAt: string;
  correlationId: string;
  label: string;
  status: string | null;
  subject: string | null;
  durationMs: number | null;
  failureCategory: string | null;
  details: Record<string, string | number | boolean | null>;
}

export interface OperationsRepository {
  summary(): Promise<OperationsSummary>;
  timeline(input: {
    correlationId: string | null;
    limit: number;
  }): Promise<OperationsTimelineItem[]>;
}

export interface OperationsRecorder {
  recordTool(input: {
    name: string;
    provider: string | null;
    status: OperationsToolStatus;
    latencyMs: number;
    correlationId: string;
    metadata: Record<string, string | number | boolean | null>;
  }): Promise<void>;
  recordProvider(input: {
    provider: string;
    status: OperationsProviderStatus;
    latencyMs: number | null;
    failureCategory: string | null;
    correlationId: string;
  }): Promise<void>;
}

export function parseOperationsTimelineQuery(input: {
  correlationId?: unknown;
  limit?: unknown;
}) {
  const correlationId =
    typeof input.correlationId === "string" && input.correlationId.length > 0
      ? input.correlationId
      : null;
  if (correlationId !== null && !/^[a-zA-Z0-9._:-]{1,128}$/.test(correlationId))
    throw new Error("invalid correlation id");
  const limit = input.limit === undefined ? 50 : Number(input.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error("invalid limit");
  return { correlationId, limit };
}
