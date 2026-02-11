import { type Page, expect } from "@playwright/test";

export const ENV = {
  testUser: process.env.TEST_USER || "astudee",
  testPass: process.env.TEST_PASS || "",
};

/**
 * Log in via the NextAuth credentials login page.
 */
export async function login(page: Page): Promise<void> {
  await page.goto("/login", { waitUntil: "networkidle" });

  await page.getByLabel("Username").fill(ENV.testUser);
  await page.getByLabel("Password").fill(ENV.testPass);
  await page.getByRole("button", { name: "Sign In" }).click();

  // Wait for redirect away from login
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15_000,
  });
}

/**
 * Check for server errors on current page
 */
export async function assertNoServerError(page: Page): Promise<void> {
  const errorText = page.getByText(/500|internal server error|application error/i);
  await expect(errorText).not.toBeVisible({ timeout: 3000 });
}
