import { expect, test } from "@playwright/test";

test("searches fixtures and inspects a clearly labeled event", async ({
  page,
  request,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Your night, handled." }),
  ).toBeVisible();
  await expect(
    page.getByText("Live discovery · Stripe test checkout"),
  ).toBeVisible();
  await expect(page.locator(".service-status")).toContainText("Live data");

  await page
    .getByLabel("What are you in the mood for?")
    .fill("Comedy for two under $80 next weekend");
  await page.getByRole("button", { name: "Plan my night" }).click();
  await expect(page.locator(".assistant-reply")).not.toContainText(
    "Tell me what kind of night you want",
  );

  await page.getByLabel("Data source").selectOption("fixture");
  await page.getByLabel("Category").selectOption("comedy");
  await page
    .locator('.search-card select[name="timePreference"]')
    .selectOption("evening");
  await page.getByRole("button", { name: "Find events" }).click();

  await expect(page.getByText("Sample data")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Friday Night Comedy — Demo Event" }),
  ).toBeVisible();
  await page.getByText("View details", { exact: true }).click();
  await expect(
    page.getByText("Sample event—not live inventory."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page.getByRole("heading", { name: "My Plans" })).toBeVisible();
  await expect(page.getByText("Draft · no payment")).toBeVisible();
  await expect(
    page.getByText("A draft is not a reservation, ticket, or purchase."),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("Draft · no payment")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Friday Night Comedy — Demo Event" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Refresh provider status" }).click();
  await expect(
    page.getByText(
      /Checked 1 saved event\. No provider status changes found\./,
    ),
  ).toBeVisible();

  const health = await request.get("/api/v1/health");
  expect(health.ok()).toBeTruthy();
  await expect(health.json()).resolves.toMatchObject({
    status: "ok",
    service: "scout",
  });
});

test("separates exact-time misses from nearest alternatives", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Data source").selectOption("fixture");
  await page.getByLabel("Exact start time").fill("17:00");
  await page.getByRole("button", { name: "Find events" }).click();

  await expect(page.getByText("No exact-time matches.")).toBeVisible();
  await expect(
    page.getByText("No provider event starts within 30 minutes of 5:00 PM."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Nearest alternatives" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "These events do not start within 30 minutes of your requested time.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "New York Basketball Showcase — Demo Event",
    }),
  ).toBeVisible();
});

test("shows the resolved next-Friday date before the user acts on results", async ({
  page,
}) => {
  await page.route("**/api/v1/conversations/messages", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        requestId: "next-friday-ui",
        data: {
          status: "results",
          assistantMessage:
            "For Friday, August 21, I searched the provider facts.",
          intent: {
            action: "search_events",
            startDate: "2026-08-21",
            endDate: "2026-08-21",
            category: "all",
            budgetMax: 80,
            partySize: 2,
            timePreference: "any",
            exactStartTime: null,
            missingFields: [],
          },
          constraints: {
            city: "New York",
            startDate: "2026-08-21",
            endDate: "2026-08-21",
            category: "all",
            budgetMax: 80,
            partySize: 2,
            timePreference: "any",
            exactStartTime: null,
          },
          result: {
            mode: "live",
            requestedMode: "live",
            events: [],
            alternatives: [],
            observedAt: "2026-08-14T16:00:00.000Z",
            fallbackReason: null,
          },
          modelUsed: true,
          toolCalls: [{ name: "search_events", status: "completed" }],
        },
      }),
    });
  });
  await page.goto("/");
  await page
    .getByLabel("What are you in the mood for?")
    .fill("Find a show in New York under $80 next Friday");
  await page.getByRole("button", { name: "Plan my night" }).click();

  await expect(page.locator(".assistant-reply")).toContainText(
    "Friday, August 21",
  );
  await expect(page.locator(".conversation-meta")).toContainText("Fri, Aug 21");
  await expect(page.locator(".conversation-meta")).toContainText("Under $80");
});

test("keeps voice optional and exposes editable lifecycle controls", async ({
  page,
  request,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("button", { name: "Use microphone" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play response" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop audio" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Mute" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Disable voice" }),
  ).toBeVisible();

  await page.evaluate(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: () =>
          Promise.reject(new DOMException("denied", "NotAllowedError")),
      },
    });
  });
  await page.getByRole("button", { name: "Use microphone" }).click();
  await expect(
    page.getByText("Microphone access was denied. You can keep typing."),
  ).toBeVisible();
  await expect(page.getByLabel("What are you in the mood for?")).toBeEditable();

  await page.getByRole("checkbox", { name: "comedy" }).check();
  await page.getByLabel("Usual budget per person").fill("75");
  await page.getByRole("button", { name: "Save corrections" }).click();
  await expect(
    page.getByText("Preferences updated. You can correct them at any time."),
  ).toBeVisible();

  await page
    .getByLabel("What needs attention?")
    .fill("Please inspect the demo workflow.");
  await page.getByRole("button", { name: "Create help record" }).click();
  await expect(
    page.getByText(
      "Help request saved. Scout does not currently offer staffed support.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Please inspect the demo workflow."),
  ).toBeVisible();

  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  await expect(manifest.json()).resolves.toMatchObject({
    display: "standalone",
    short_name: "Scout",
  });
});

test("protects and renders stored operations with correlation filtering", async ({
  page,
  request,
}) => {
  await page.goto("/");

  const unauthorized = await request.get("/api/v1/ops/summary");
  expect(unauthorized.status()).toBe(401);

  await page.getByLabel("Data source").selectOption("fixture");
  await page.getByLabel("Category").selectOption("comedy");
  await page
    .locator('.search-card select[name="timePreference"]')
    .selectOption("evening");
  await page.getByRole("button", { name: "Find events" }).click();
  await page.getByRole("button", { name: "Save as draft" }).click();

  await page
    .getByLabel("Operator access token")
    .fill("e2e-operations-token-long-enough");
  await page.getByRole("button", { name: "Unlock operations" }).click();

  await expect(
    page.getByRole("region", { name: "Operations summary" }),
  ).toBeVisible();
  await expect(page.locator(".operations-timeline")).toContainText(
    "search_events",
  );
  await expect(page.locator(".operations-timeline")).toContainText(
    "plan.draft_created",
  );
  await expect(page.getByText("credentials", { exact: true })).toHaveCount(0);

  const searchItems = page
    .locator(".operations-timeline li")
    .filter({ hasText: "search_events" });
  const searchItemCount = await searchItems.count();
  expect(searchItemCount).toBeGreaterThan(0);
  const correlationId = await searchItems.nth(0).locator("code").innerText();
  await page.getByLabel("Correlation ID").fill(correlationId);
  await page.getByRole("button", { name: "Apply filter" }).click();
  await expect(page.locator(".operations-timeline code")).toHaveCount(2);
  await expect(page.locator(".operations-timeline code")).toHaveText([
    correlationId,
    correlationId,
  ]);

  await page
    .getByLabel("Correlation ID")
    .fill("phase8-correlation-with-no-matches");
  await page.getByRole("button", { name: "Apply filter" }).click();
  await expect(
    page.getByText("No stored operations match this correlation ID."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Lock operations" }).click();
  await expect(
    page.getByRole("button", { name: "Unlock operations" }),
  ).toBeVisible();
});
