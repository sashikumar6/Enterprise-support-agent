import { expect, test } from "@playwright/test";

test("completes the production Stripe test-mode golden path", async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.SCOUT_PRODUCTION_GOLDEN !== "1" ||
      testInfo.project.name !== "release-desktop",
    "The consequential production test-mode journey is opt-in and desktop-only.",
  );
  test.setTimeout(120_000);

  await page.goto("/");
  await page.getByLabel("Data source").selectOption("fixture");
  await page.getByLabel("Category").selectOption("comedy");
  await page.getByRole("button", { name: "Find events" }).click();
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page.getByText("Draft · no payment")).toBeVisible();

  await page.getByRole("button", { name: "Review $1 test checkout" }).click();
  await expect(page.getByText("Review test checkout")).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm and continue to Stripe" })
    .click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });

  await page.getByLabel(/email/i).fill("scout-release@example.com");

  const paymentFrame = page.frameLocator(
    'iframe[title*="Secure payment input frame"]',
  );
  const cardNumber = paymentFrame.getByLabel(/card number/i);
  if (await cardNumber.isVisible().catch(() => false)) {
    await cardNumber.fill("4242424242424242");
    await paymentFrame.getByLabel(/expiration/i).fill("1234");
    await paymentFrame
      .getByRole("textbox", { name: /security code|cvc/i })
      .fill("123");
  } else {
    await page.getByLabel(/card number/i).fill("4242424242424242");
    await page.getByLabel(/expiration/i).fill("1234");
    await page.getByRole("textbox", { name: /security code|cvc/i }).fill("123");
  }

  const cardholder = page.getByLabel(/cardholder name|name on card/i);
  if (await cardholder.isVisible().catch(() => false)) {
    await cardholder.fill("Scout Release");
  }
  const postalCode = page.getByLabel(/zip|postal/i);
  if (await postalCode.isVisible().catch(() => false)) {
    await postalCode.fill("10001");
  }
  const saveInformation = page.getByRole("checkbox", {
    name: "Save my information for faster checkout",
  });
  if (await saveInformation.isChecked().catch(() => false)) {
    await saveInformation.uncheck();
  }

  await page.getByTestId("hosted-payment-submit-button").click();
  await page.waitForURL(/scout-production\.veeravaagu-vishal\.workers\.dev/, {
    timeout: 60_000,
  });
  await expect(page.getByText("Confirmed · test reservation")).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByText("Test mode · no event ticket was issued."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Cancel test reservation" }).click();
  await expect(page.getByText("Review test cancellation")).toBeVisible();
  await page.getByRole("button", { name: "Confirm test refund" }).click();
  await expect(
    page.getByText(
      /Cancellation · test refund pending|Cancelled · test refund complete/,
    ),
  ).toBeVisible();

  await expect
    .poll(
      async () => {
        await page.reload();
        await page
          .getByText(
            /Cancellation · test refund pending|Cancelled · test refund complete/,
          )
          .waitFor({ timeout: 5_000 });
        return page.getByText("Cancelled · test refund complete").count();
      },
      { timeout: 45_000 },
    )
    .toBe(1);
});
