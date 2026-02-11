import { test, expect } from "@playwright/test";
import { login, assertNoServerError } from "../fixtures/helpers";

test.describe("Connection Health", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("Health page loads", async ({ page }) => {
    await page.goto("/health/connection", { waitUntil: "networkidle" });
    await assertNoServerError(page);
  });

  test("Snowflake status visible", async ({ page }) => {
    await page.goto("/health/connection", { waitUntil: "networkidle" });
    const snowflake = page.getByText(/snowflake/i);
    await expect(snowflake.first()).toBeVisible({ timeout: 15_000 });
  });

  test("BigTime status visible", async ({ page }) => {
    await page.goto("/health/connection", { waitUntil: "networkidle" });
    const bigtime = page.getByText(/bigtime/i);
    await expect(bigtime.first()).toBeVisible({ timeout: 15_000 });
  });
});
