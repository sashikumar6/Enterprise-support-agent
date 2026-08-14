import { expect, test } from "@playwright/test";

const securityHeaders = {
  "content-security-policy": /frame-ancestors 'none'/,
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
} as const;

test("serves a responsive, keyboard-oriented public shell", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Scout — Your night, handled");
  await expect(
    page.getByRole("heading", { name: "Your night, handled." }),
  ).toBeVisible();
  await expect(page.getByText("Scout is a feasibility demo.")).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to main content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main-content$/);

  const hasHorizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test("serves healthy APIs and release security headers", async ({
  request,
}) => {
  for (const path of ["/", "/api/v1/health"]) {
    const response = await request.get(path);
    expect(response.ok(), `${path} should be reachable`).toBe(true);
    for (const [name, expected] of Object.entries(securityHeaders)) {
      expect(response.headers()[name], `${path} ${name}`).toMatch(expected);
    }
  }

  const shell = await request.get("/");
  expect(shell.headers()["permissions-policy"]).toContain("microphone=(self)");

  const health = await request.get("/api/v1/health");
  expect(health.headers()["permissions-policy"]).toContain("microphone=()");

  const readiness = await request.get("/api/v1/readiness");
  expect(readiness.ok()).toBe(true);
  await expect(readiness.json()).resolves.toMatchObject({
    status: "ready",
    checks: { environment: "ok", database: "ok" },
  });

  const unauthorized = await request.get("/api/v1/ops/summary");
  expect(unauthorized.status()).toBe(401);
});
