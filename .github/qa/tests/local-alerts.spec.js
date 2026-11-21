import { test, expect } from "@playwright/test";
import { createSummary } from "../fixtures/xmrig-summary.js";
import {
  connectDashboard,
  installNotificationMock,
  mockProxyApi,
  openAlertSettings,
  refreshDashboard,
} from "../fixtures/dashboard.js";

async function configureHashrateAlert(page, { enableNotifications = true } = {}) {
  await openAlertSettings(page);
  await page.locator("#sAlertHashrate").fill("50");
  await page.locator("#sAlertCooldown").fill("0");
  await page.locator("#saveAlertSettings").click();
  await expect(page.locator("#settingsModal")).toBeVisible();
  expect(await page.evaluate(() => window.__qa_permission_request_count)).toBe(0);
  if (enableNotifications) {
    await page.locator("#requestBrowserAlertPermission").click();
    await expect(page.locator("#enableBrowserAlertNotifications")).toBeChecked();
  }
  await page.locator("#cancelSettings").click();
  await expect(page.locator("#settingsModal")).toHaveCount(0);
}

async function notificationCount(page) {
  return page.evaluate(() => window.__qa_notifications.length);
}

test("threshold breach notifies once, recovery permits a new notification, and disabling notifications suppresses delivery without losing state", async ({ page }) => {
  const api = await mockProxyApi(page, createSummary({ hashrate: 100 }));
  await installNotificationMock(page);
  await connectDashboard(page);
  await configureHashrateAlert(page);
  expect(await page.evaluate(() => window.__qa_permission_request_count)).toBe(1);

  api.summary = createSummary({ hashrate: 20 });
  await refreshDashboard(page);
  await expect.poll(() => notificationCount(page)).toBe(1);

  await refreshDashboard(page);
  expect(await notificationCount(page)).toBe(1);

  api.summary = createSummary({ hashrate: 100 });
  await refreshDashboard(page);
  expect(await notificationCount(page)).toBe(1);

  await openAlertSettings(page);
  await page.locator("#enableBrowserAlertNotifications").uncheck();
  await page.locator("#cancelSettings").click();
  await expect(page.locator("#settingsModal")).toHaveCount(0);
  api.summary = createSummary({ hashrate: 20 });
  await refreshDashboard(page);
  expect(await notificationCount(page)).toBe(1);

  await openAlertSettings(page);
  await page.locator("#enableBrowserAlertNotifications").check();
  await page.locator("#cancelSettings").click();
  await expect(page.locator("#settingsModal")).toHaveCount(0);
  await refreshDashboard(page);
  expect(await notificationCount(page)).toBe(1);

  api.summary = createSummary({ hashrate: 100 });
  await refreshDashboard(page);
  api.summary = createSummary({ hashrate: 20 });
  await refreshDashboard(page);
  await expect.poll(() => notificationCount(page)).toBe(2);

  const alertStorage = await page.evaluate(() => localStorage.getItem("xmrig_proxy_alert_settings"));
  expect(alertStorage).not.toContain("QA_ONLY_FAKE_TOKEN_DO_NOT_USE");
  const notifications = await page.evaluate(() => JSON.stringify(window.__qa_notifications));
  expect(notifications).not.toContain("QA_ONLY_FAKE_TOKEN_DO_NOT_USE");
});

test("alert thresholds and notification opt-in survive reload", async ({ page }) => {
  await mockProxyApi(page, createSummary());
  await installNotificationMock(page);
  await connectDashboard(page);
  await configureHashrateAlert(page);

  await page.reload();
  await expect(page.locator(".card-title").filter({ hasText: "当前算力" }).first()).toBeVisible();
  await openAlertSettings(page);
  await expect(page.locator("#sAlertHashrate")).toHaveValue("50");
  await expect(page.locator("#sAlertCooldown")).toHaveValue("0");
  await expect(page.locator("#enableBrowserAlertNotifications")).toBeChecked();
});

test("an offline cached snapshot is display-only and cannot trigger a new alert", async ({ page }) => {
  const api = await mockProxyApi(page, createSummary({ hashrate: 100 }));
  await installNotificationMock(page);
  await connectDashboard(page);
  await configureHashrateAlert(page);

  api.offline = true;
  await page.reload();
  await expect(page.locator("#statusBadge")).toContainText("离线缓存");
  expect(await notificationCount(page)).toBe(0);

  api.offline = false;
  api.summary = createSummary({ hashrate: 20 });
  await refreshDashboard(page);
  await expect.poll(() => notificationCount(page)).toBe(1);
});


test("active-miner and rejected-share thresholds trigger only after strict boundary crossings", async ({ page }) => {
  const api = await mockProxyApi(page, createSummary());
  await installNotificationMock(page);
  await connectDashboard(page);
  await openAlertSettings(page);
  await page.locator("#sAlertMiners").fill("2");
  await page.locator("#sAlertRejected").fill("10");
  await page.locator("#sAlertCooldown").fill("0");
  await page.locator("#saveAlertSettings").click();
  expect(await page.evaluate(() => window.__qa_permission_request_count)).toBe(0);
  await page.locator("#requestBrowserAlertPermission").click();
  await expect(page.locator("#enableBrowserAlertNotifications")).toBeChecked();
  await page.locator("#cancelSettings").click();
  await expect(page.locator("#settingsModal")).toHaveCount(0);

  api.summary = createSummary({ miners: 1 });
  await refreshDashboard(page);
  await expect.poll(() => notificationCount(page)).toBe(1);

  api.summary = createSummary({ miners: 3, accepted: 90, rejected: 10 });
  await refreshDashboard(page);
  expect(await notificationCount(page)).toBe(1);

  api.summary = createSummary({ miners: 3, accepted: 80, rejected: 20 });
  await refreshDashboard(page);
  await expect.poll(() => notificationCount(page)).toBe(2);
  const bodies = await page.evaluate(() => window.__qa_notifications.map(item => item.options.body));
  expect(bodies).toContain("Active miner count is below your configured threshold.");
  expect(bodies).toContain("Rejected-share ratio is above your configured threshold.");
});
