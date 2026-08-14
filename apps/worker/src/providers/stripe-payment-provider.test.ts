import { describe, expect, it, vi } from "vitest";

import { StripePaymentProvider } from "./stripe-payment-provider";

const now = new Date("2026-08-13T16:00:00Z");

async function signature(payload: string, secret: string, timestamp: number) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const value = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${payload}`),
  );
  return [...new Uint8Array(value)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

describe("StripePaymentProvider", () => {
  it("creates a fixed-price hosted sandbox checkout without exposing the key", async () => {
    const fetcher = vi.fn(async (_input: unknown, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        authorization: "Bearer sk_test_example",
        "idempotency-key": "checkout:local-1",
      });
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("mode")).toBe("payment");
      expect(body.get("line_items[0][price_data][unit_amount]")).toBe("100");
      expect(body.get("metadata[checkout_id]")).toBe("local-1");
      expect(body.get("payment_method_types[0]")).toBe("card");
      return Response.json({
        id: "cs_test_123",
        url: "https://checkout.stripe.com/c/pay/cs_test_123",
        expires_at: 1_787_000_000,
      });
    });
    const provider = new StripePaymentProvider(
      "sk_test_example",
      fetcher as typeof fetch,
      () => now,
    );

    await expect(
      provider.createCheckout({
        checkoutId: "local-1",
        reservationId: "plan-1",
        eventName: "Demo Comedy",
        successUrl: "http://localhost/success",
        cancelUrl: "http://localhost/cancel",
        idempotencyKey: "checkout:local-1",
      }),
    ).resolves.toMatchObject({ id: "cs_test_123" });
  });

  it("verifies and normalizes a successful checkout webhook", async () => {
    const timestamp = Math.floor(now.getTime() / 1_000);
    const payload = JSON.stringify({
      id: "evt_1",
      type: "checkout.session.completed",
      created: timestamp,
      data: {
        object: {
          id: "cs_test_123",
          payment_intent: "pi_123",
          metadata: { checkout_id: "local-1" },
        },
      },
    });
    const secret = "whsec_example";
    const digest = await signature(payload, secret, timestamp);
    const provider = new StripePaymentProvider(
      "sk_test_example",
      vi.fn() as typeof fetch,
      () => now,
    );

    await expect(
      provider.parseWebhook(payload, `t=${timestamp},v1=${digest}`, secret),
    ).resolves.toEqual({
      id: "evt_1",
      type: "checkout.succeeded",
      checkoutId: "local-1",
      providerCheckoutId: "cs_test_123",
      providerPaymentId: "pi_123",
      occurredAt: now.toISOString(),
    });
  });

  it("rejects a forged webhook signature", async () => {
    const timestamp = Math.floor(now.getTime() / 1_000);
    const provider = new StripePaymentProvider(
      "sk_test_example",
      vi.fn() as typeof fetch,
      () => now,
    );
    await expect(
      provider.parseWebhook(
        JSON.stringify({ id: "evt_forged" }),
        `t=${timestamp},v1=forged`,
        "whsec_example",
      ),
    ).rejects.toMatchObject({ category: "invalid_webhook" });
  });

  it("creates a refund against the webhook-supplied PaymentIntent", async () => {
    const fetcher = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("payment_intent")).toBe("pi_123");
      expect(body.get("metadata[checkout_id]")).toBe("local-1");
      return Response.json({ id: "re_123", status: "succeeded" });
    });
    const provider = new StripePaymentProvider(
      "sk_test_example",
      fetcher as typeof fetch,
      () => now,
    );
    await expect(
      provider.createRefund({
        checkoutId: "local-1",
        paymentId: "pi_123",
        idempotencyKey: "refund:local-1",
      }),
    ).resolves.toEqual({ id: "re_123", state: "succeeded" });
  });
});
