import { expect, test } from "@playwright/test";

test("searches fixtures and inspects a clearly labeled event", async ({
  page,
  request,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Less searching. More going." }),
  ).toBeVisible();
  await expect(page.getByText("Scout is a feasibility demo.")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("System online");

  await page.getByLabel("Data source").selectOption("fixture");
  await page.getByLabel("Category").selectOption("comedy");
  await page.getByLabel("Time").selectOption("evening");
  await page.getByRole("button", { name: "Find events" }).click();

  await expect(page.getByText("Demo fixture data")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Friday Night Comedy — Demo Event" }),
  ).toBeVisible();
  await page.getByText("View details", { exact: true }).click();
  await expect(
    page.getByText("Demo event only; this is not real inventory."),
  ).toBeVisible();

  const health = await request.get("/api/v1/health");
  expect(health.ok()).toBeTruthy();
  await expect(health.json()).resolves.toMatchObject({
    status: "ok",
    service: "scout",
  });
});
