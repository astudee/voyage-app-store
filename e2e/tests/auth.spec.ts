import { test, expect } from "@playwright/test";
import { login } from "../fixtures/helpers";

test.describe("Authentication", () => {
  test("Login page renders", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
  });

  test("Valid login redirects to app", async ({ page }) => {
    await login(page);
    expect(page.url()).not.toContain("/login");
  });

  test("Invalid credentials rejected", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.getByLabel("Username").fill("baduser");
    await page.getByLabel("Password").fill("badpass");
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForTimeout(2000);

    const stillOnLogin = page.url().includes("/login");
    const hasError = await page
      .getByText(/invalid|incorrect|error/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(stillOnLogin || hasError).toBe(true);
  });

  test("Unauthenticated access redirects to login", async ({ page }) => {
    await page.goto("/settings/staff", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/login/);
  });
});
