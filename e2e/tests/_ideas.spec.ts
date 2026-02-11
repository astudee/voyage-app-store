/**
 * TEST IDEAS — Add future tests here with test.skip()
 * When ready to implement, move to the appropriate file and remove skip.
 */

import { test } from "@playwright/test";

test.describe("Ideas - Commission Calculator", () => {
  test.skip("Run commission calculation", async ({ page }) => {
    // TODO: Select date range, calculate, verify results
  });

  test.skip("Export to Excel", async ({ page }) => {
    // TODO: Calculate, download, verify file
  });
});

test.describe("Ideas - Benefits", () => {
  test.skip("Calculate benefits", async ({ page }) => {
    // TODO: Select staff, run calculation
  });
});

test.describe("Ideas - Document Manager", () => {
  test.skip("List documents in Import tab", async ({ page }) => {
    // TODO: Navigate to /documents/import, verify files display
  });

  test.skip("Upload document", async ({ page }) => {
    // TODO: Upload file, verify appears in list
  });
});

test.describe("Ideas - Performance", () => {
  test.skip("Dashboard loads under 3 seconds", async ({ page }) => {
    // TODO: Measure load time
  });
});
