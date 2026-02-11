import { test, expect } from "@playwright/test";
import { login, assertNoServerError } from "../fixtures/helpers";

test.describe("Smoke Tests", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("Dashboard loads after login", async ({ page }) => {
    await assertNoServerError(page);
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("Main app pages load without 500 errors", async ({ page }) => {
    const routes = [
      "/",
      "/settings/staff",
      "/settings/benefits",
      "/settings/rules",
      "/settings/assignments",
      "/health/connection",
      "/documents",
      "/apps/commission",
      "/apps/project-health",
    ];

    for (const route of routes) {
      await page.goto(route, { waitUntil: "networkidle" });
      await assertNoServerError(page);
    }
  });
});
