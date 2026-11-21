import { expect } from "@playwright/test";
import { createSummary } from "./xmrig-summary.js";

export async function installNotificationMock(page) {
  await page.addInitScript(() => {
    window.__qa_notifications = [];
    window.__qa_permission_request_count = 0;
    class QaNotification {
      static get permission() {
        return localStorage.getItem("__qa_notification_permission") || "default";
      }
      static async requestPermission() {
        window.__qa_permission_request_count += 1;
        localStorage.setItem("__qa_notification_permission", "granted");
        return "granted";
      }
      constructor(title, options = {}) {
        window.__qa_notifications.push({ title, options });
      }
    }
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: QaNotification,
    });
  });
}

export async function mockProxyApi(page, initialSummary = createSummary()) {
  const state = { summary: initialSummary, offline: false, summaryRequests: 0 };
  await page.route("**/1/summary", async route => {
    state.summaryRequests += 1;
    if (state.offline) {
      await route.fulfill({ status: 503, contentType: "text/plain", body: "QA simulated offline" });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(state.summary) });
  });
  await page.route("**/1/config", route => route.fulfill({ status: 404, body: "restricted" }));
  return state;
}

export async function connectDashboard(page) {
  await page.goto("/");
  await expect(page.locator("#connectBtn")).toBeVisible();
  await page.locator("#apiUrlInput").fill("http://127.0.0.1:18080");
  await page.locator("#apiTokenInput").fill("QA_ONLY_FAKE_TOKEN_DO_NOT_USE");
  await page.locator("#connectBtn").click();
  await expect(page.locator(".card-title").filter({ hasText: "当前算力" }).first()).toBeVisible();
  await expect(page.locator("#refreshDashboardButton")).toBeVisible();
}

export async function openAlertSettings(page) {
  await page.locator("#editUrl").click();
  await expect(page.locator("#settingsModal")).toBeVisible();
  await expect(page.locator("#alertSettingsTitle")).toBeVisible();
}

export async function refreshDashboard(page) {
  await page.locator("#refreshDashboardButton").click();
  await expect(page.locator("#refreshDashboardButton")).toHaveAttribute("aria-busy", "false");
}
