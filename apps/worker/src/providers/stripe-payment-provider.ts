import {
  DEMO_CHECKOUT_AMOUNT_MINOR,
  DEMO_CHECKOUT_CURRENCY,
  type CreatePaymentCheckout,
  type CreatePaymentRefund,
  type PaymentProvider,
  PaymentProviderError,
  type PaymentWebhookEvent,
  type ProviderCheckout,
  type ProviderRefund,
} from "@scout/core";

const STRIPE_API = "https://api.stripe.com/v1";
const WEBHOOK_TOLERANCE_SECONDS = 300;

interface StripeErrorBody {
  error?: { message?: string; type?: string };
}

interface StripeCheckoutResponse {
  id?: string;
  url?: string;
  expires_at?: number;
}

interface StripeRefundResponse {
  id?: string;
  status?: string;
}

interface StripeEventObject {
  id?: string;
  payment_intent?: string | null;
  status?: string;
  metadata?: Record<string, string>;
}

interface StripeEvent {
  id?: string;
  type?: string;
  created?: number;
  data?: { object?: StripeEventObject };
}

function formBody(values: Record<string, string>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) body.set(key, value);
  return body.toString();
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function hmacHex(secret: string, payload: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function checkoutId(object: StripeEventObject) {
  return object.metadata?.checkout_id || null;
}

export class StripePaymentProvider implements PaymentProvider {
  constructor(
    private readonly secretKey: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly clock: () => Date = () => new Date(),
  ) {
    if (!secretKey.startsWith("sk_test_")) {
      throw new PaymentProviderError(
        "configuration",
        "Stripe sandbox credentials are not configured.",
      );
    }
  }

  private async post<T>(
    path: string,
    values: Record<string, string>,
    idempotencyKey: string,
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(`${STRIPE_API}${path}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.secretKey}`,
          "content-type": "application/x-www-form-urlencoded",
          "idempotency-key": idempotencyKey,
        },
        body: formBody(values),
      });
    } catch {
      throw new PaymentProviderError(
        "unavailable",
        "Stripe could not be reached.",
      );
    }

    const payload = (await response.json().catch(() => ({}))) as T &
      StripeErrorBody;
    if (!response.ok) {
      const category =
        response.status === 401
          ? "authentication"
          : response.status === 429
            ? "rate_limited"
            : response.status >= 500
              ? "unavailable"
              : "invalid_request";
      throw new PaymentProviderError(
        category,
        payload.error?.message || "Stripe rejected the sandbox request.",
      );
    }
    return payload;
  }

  async createCheckout(
    command: CreatePaymentCheckout,
  ): Promise<ProviderCheckout> {
    const payload = await this.post<StripeCheckoutResponse>(
      "/checkout/sessions",
      {
        mode: "payment",
        success_url: command.successUrl,
        cancel_url: command.cancelUrl,
        "payment_method_types[0]": "card",
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": DEMO_CHECKOUT_CURRENCY,
        "line_items[0][price_data][unit_amount]": String(
          DEMO_CHECKOUT_AMOUNT_MINOR,
        ),
        "line_items[0][price_data][product_data][name]":
          `Scout demo reservation · ${command.eventName}`.slice(0, 250),
        "line_items[0][price_data][product_data][description]":
          "Sandbox workflow only. No real ticket, reservation, or charge.",
        "metadata[checkout_id]": command.checkoutId,
        "metadata[reservation_id]": command.reservationId,
        "payment_intent_data[metadata][checkout_id]": command.checkoutId,
        "payment_intent_data[metadata][reservation_id]": command.reservationId,
        "custom_text[submit][message]":
          "Test mode only. Scout will not issue a real event ticket.",
      },
      command.idempotencyKey,
    );

    if (!payload.id || !payload.url) {
      throw new PaymentProviderError(
        "unavailable",
        "Stripe returned an incomplete Checkout Session.",
      );
    }
    return {
      id: payload.id,
      url: payload.url,
      expiresAt: payload.expires_at
        ? new Date(payload.expires_at * 1_000).toISOString()
        : null,
    };
  }

  async expireCheckout(providerCheckoutId: string): Promise<void> {
    await this.post<StripeCheckoutResponse>(
      `/checkout/sessions/${encodeURIComponent(providerCheckoutId)}/expire`,
      {},
      `expire:${providerCheckoutId}`,
    );
  }

  async createRefund(command: CreatePaymentRefund): Promise<ProviderRefund> {
    const payload = await this.post<StripeRefundResponse>(
      "/refunds",
      {
        payment_intent: command.paymentId,
        "metadata[checkout_id]": command.checkoutId,
      },
      command.idempotencyKey,
    );
    if (!payload.id) {
      throw new PaymentProviderError(
        "unavailable",
        "Stripe returned an incomplete refund.",
      );
    }
    return {
      id: payload.id,
      state:
        payload.status === "succeeded"
          ? "succeeded"
          : payload.status === "failed" || payload.status === "canceled"
            ? "failed"
            : "pending",
    };
  }

  async parseWebhook(
    rawBody: string,
    signatureHeader: string,
    secret: string,
  ): Promise<PaymentWebhookEvent> {
    if (!secret.startsWith("whsec_")) {
      throw new PaymentProviderError(
        "configuration",
        "Stripe webhook verification is not configured.",
      );
    }
    const fields = signatureHeader.split(",").map((field) => field.split("="));
    const timestamp = fields.find(([key]) => key === "t")?.[1];
    const signatures = fields
      .filter(([key]) => key === "v1")
      .map(([, value]) => value);
    const timestampNumber = Number(timestamp);
    if (
      !timestamp ||
      !Number.isInteger(timestampNumber) ||
      signatures.length === 0 ||
      Math.abs(this.clock().getTime() / 1_000 - timestampNumber) >
        WEBHOOK_TOLERANCE_SECONDS
    ) {
      throw new PaymentProviderError(
        "invalid_webhook",
        "Stripe webhook signature is invalid or expired.",
      );
    }

    const expected = await hmacHex(secret, `${timestamp}.${rawBody}`);
    if (!signatures.some((signature) => safeEqual(signature, expected))) {
      throw new PaymentProviderError(
        "invalid_webhook",
        "Stripe webhook signature is invalid or expired.",
      );
    }

    let event: StripeEvent;
    try {
      event = JSON.parse(rawBody) as StripeEvent;
    } catch {
      throw new PaymentProviderError(
        "invalid_webhook",
        "Stripe webhook payload is not valid JSON.",
      );
    }
    if (!event.id || !event.type || !event.created || !event.data?.object) {
      throw new PaymentProviderError(
        "invalid_webhook",
        "Stripe webhook payload is incomplete.",
      );
    }

    const object = event.data.object;
    const localCheckoutId = checkoutId(object);
    const occurredAt = new Date(event.created * 1_000).toISOString();
    if (!localCheckoutId) return { id: event.id, type: "ignored", occurredAt };

    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      if (!object.id || !object.payment_intent) {
        throw new PaymentProviderError(
          "invalid_webhook",
          "Stripe checkout completion payload is incomplete.",
        );
      }
      return {
        id: event.id,
        type: "checkout.succeeded",
        checkoutId: localCheckoutId,
        providerCheckoutId: object.id,
        providerPaymentId: object.payment_intent,
        occurredAt,
      };
    }

    if (
      event.type === "checkout.session.async_payment_failed" ||
      event.type === "payment_intent.payment_failed"
    ) {
      return {
        id: event.id,
        type: "checkout.failed",
        checkoutId: localCheckoutId,
        providerCheckoutId: event.type.startsWith("checkout.")
          ? object.id || null
          : null,
        occurredAt,
      };
    }

    if (event.type === "checkout.session.expired") {
      return {
        id: event.id,
        type: "checkout.expired",
        checkoutId: localCheckoutId,
        providerCheckoutId: object.id || null,
        occurredAt,
      };
    }

    if (event.type === "refund.created" || event.type === "refund.updated") {
      if (!object.id) {
        throw new PaymentProviderError(
          "invalid_webhook",
          "Stripe refund payload is incomplete.",
        );
      }
      const type =
        object.status === "succeeded"
          ? "refund.succeeded"
          : object.status === "failed" || object.status === "canceled"
            ? "refund.failed"
            : "refund.pending";
      return {
        id: event.id,
        type,
        checkoutId: localCheckoutId,
        providerRefundId: object.id,
        occurredAt,
      };
    }

    return { id: event.id, type: "ignored", occurredAt };
  }
}
