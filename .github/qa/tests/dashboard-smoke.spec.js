import { test, expect } from "@playwright/test";
import { createSummary } from "../fixtures/xmrig-summary.js";
import { connectDashboard, installNotificationMock, mockProxyApi, openAlertSettings } from "../fixtures/dashboard.js";

test("dashboard starts, connects to a mocked Proxy, and exposes alert settings without prompting for permission", async ({ page }) => {
  await installNotificationMock(page);
  await mockProxyApi(page, createSummary());
  await connectDashboard(page);

  expect(await page.evaluate(() => window.__qa_permission_request_count)).toBe(0);
  await openAlertSettings(page);
  expect(await page.evaluate(() => window.__qa_permission_request_count)).toBe(0);
  await expect(page.locator("#requestBrowserAlertPermission")).toBeEnabled();
  await expect(page.locator("#sAlertHashrate")).toHaveValue("");
});
