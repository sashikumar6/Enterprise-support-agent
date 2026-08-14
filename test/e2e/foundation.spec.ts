import { expect, test } from "@playwright/test";

test("serves the Scout shell and health API", async ({ page, request }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Less searching. More going." }),
  ).toBeVisible();
  await expect(page.getByText("Scout is a feasibility demo.")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("System online");

  const health = await request.get("/api/v1/health");
  expect(health.ok()).toBeTruthy();
  await expect(health.json()).resolves.toMatchObject({
    status: "ok",
    service: "scout",
  });
});
