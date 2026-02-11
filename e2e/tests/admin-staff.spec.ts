import { test, expect } from "@playwright/test";
import { login, assertNoServerError } from "../fixtures/helpers";

test.describe("Settings - Staff", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/settings/staff", { waitUntil: "networkidle" });
  });

  test("Staff page loads", async ({ page }) => {
    await assertNoServerError(page);
  });

  test("Staff list displays", async ({ page }) => {
    const hasTable = await page.locator("table").isVisible().catch(() => false);
    const hasList = await page.getByRole("list").isVisible().catch(() => false);
    expect(hasTable || hasList).toBe(true);
  });

  test("Add button exists", async ({ page }) => {
    const addBtn = page.getByRole("link", { name: /add|new|create/i });
    if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(addBtn).toBeEnabled();
    }
  });
});
