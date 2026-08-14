export const DEMO_CHECKOUT_AMOUNT_MINOR = 100;
export const DEMO_CHECKOUT_CURRENCY = "usd";

export interface CreatePaymentCheckout {
  checkoutId: string;
  reservationId: string;
  eventName: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
}

export interface ProviderCheckout {
  id: string;
  url: string;
  expiresAt: string | null;
}

export interface CreatePaymentRefund {
  checkoutId: string;
  paymentId: string;
  idempotencyKey: string;
}

export interface ProviderRefund {
  id: string;
  state: "pending" | "succeeded" | "failed";
}

export type PaymentWebhookEvent =
  | {
      id: string;
      type: "checkout.succeeded";
      checkoutId: string;
      providerCheckoutId: string;
      providerPaymentId: string;
      occurredAt: string;
    }
  | {
      id: string;
      type: "checkout.failed" | "checkout.expired";
      checkoutId: string;
      providerCheckoutId: string | null;
      occurredAt: string;
    }
  | {
      id: string;
      type: "refund.pending" | "refund.succeeded" | "refund.failed";
      checkoutId: string;
      providerRefundId: string;
      occurredAt: string;
    }
  | {
      id: string;
      type: "ignored";
      occurredAt: string;
    };

export interface PaymentProvider {
  createCheckout(command: CreatePaymentCheckout): Promise<ProviderCheckout>;
  expireCheckout(providerCheckoutId: string): Promise<void>;
  createRefund(command: CreatePaymentRefund): Promise<ProviderRefund>;
  parseWebhook(
    rawBody: string,
    signature: string,
    secret: string,
  ): Promise<PaymentWebhookEvent>;
}

export interface CheckoutSummary {
  id: string;
  state: "created" | "pending" | "succeeded" | "failed" | "expired";
  refundState: "not_requested" | "pending" | "succeeded" | "failed";
  amountMinor: number;
  currency: string;
  completedAt: string | null;
  providerPaymentId: string | null;
}

export interface CheckoutLaunch extends CheckoutSummary {
  reservationId: string;
  redirectUrl: string;
}

export interface StartCheckout {
  id: string;
  ownerSessionId: string;
  reservationId: string;
  expectedReservationVersion: number;
  idempotencyKey: string;
  providerCheckoutId: string;
  redirectUrl: string;
  expiresAt: string | null;
  correlationId: string;
}

export interface CheckoutCandidate {
  reservationId: string;
  reservationVersion: number;
  eventName: string;
}

export interface CommerceRepository {
  findCheckoutCandidate(
    ownerSessionId: string,
    reservationId: string,
  ): Promise<CheckoutCandidate | null>;
  findCheckoutLaunch(
    ownerSessionId: string,
    reservationId: string,
    idempotencyKey: string,
  ): Promise<CheckoutLaunch | null>;
  startCheckout(command: StartCheckout): Promise<CheckoutLaunch>;
  processPaymentEvent(
    event: PaymentWebhookEvent,
    correlationId: string,
  ): Promise<"applied" | "replayed" | "rejected">;
  findCancellationCandidate(
    ownerSessionId: string,
    reservationId: string,
  ): Promise<CancellationCandidate | null>;
  findCancellation(
    ownerSessionId: string,
    reservationId: string,
    idempotencyKey: string,
  ): Promise<CancellationResult | null>;
  startCancellation(command: StartCancellation): Promise<CancellationResult>;
}

export interface CancellationCandidate {
  reservationId: string;
  reservationVersion: number;
  checkoutId: string;
  providerPaymentId: string;
}

export interface StartCancellation extends CancellationCandidate {
  ownerSessionId: string;
  idempotencyKey: string;
  providerRefundId: string;
  correlationId: string;
}

export interface CancellationResult {
  reservationId: string;
  checkoutId: string;
  reservationState: "cancellation_pending";
  refundState: "pending";
  providerRefundId: string;
}

export class PaymentProviderError extends Error {
  constructor(
    public readonly category:
      | "configuration"
      | "authentication"
      | "invalid_request"
      | "rate_limited"
      | "unavailable"
      | "invalid_webhook",
    message: string,
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}
