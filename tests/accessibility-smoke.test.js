import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = path => readFileSync(join(root, path), "utf8");

test("connection flow exposes labeled controls and keyboard submission", () => {
  const main = read("src/main.js");
  const connect = main.slice(main.indexOf("function renderConnectForm"), main.indexOf("function handleConnect"));

  assert.match(connect, /role="dialog" aria-labelledby="connect-title"/);
  assert.match(connect, /<h2 id="connect-title"/);
  for (const [id, type] of [["apiUrlInput", "url"], ["apiTokenInput", "password"]]) {
    assert.match(connect, new RegExp('<label[^>]+for="' + id + '"'));
    assert.match(connect, new RegExp('<input[^>]+type="' + type + '"[^>]+id="' + id + '"'));
    assert.match(connect, new RegExp('getElementById\\("' + id + '"\\)\\.addEventListener\\("keydown"'));
  }
  assert.match(connect, /<label for="rememberMe">/);
});

test("settings dialog has a name, modal semantics, and labeled form controls", () => {
  const main = read("src/main.js");
  const settings = main.slice(main.indexOf("function openSettingsModal"), main.indexOf("function closeModal"));

  assert.match(settings, /role="dialog"[^>]+aria-labelledby="modal-title" aria-modal="true"/);
  assert.match(settings, /<h3[^>]+id="modal-title"/);
  for (const id of ["sProfileName", "sApiUrl", "sApiToken", "sRefreshInterval", "sTheme"]) {
    assert.match(settings, new RegExp('<label[^>]+for="' + id + '"'));
  }
  assert.match(settings, /<button class="modal-close" aria-label="关闭"/);
  assert.match(settings, /getElementById\("cancelSettings"\)/);
  assert.match(settings, /addEventListener\("keydown", escHandler\)/);
});

test("view-mode control is keyboard-focusable and handles keyboard activation", () => {
  const html = read("index.html");
  const main = read("src/main.js");

  assert.match(html, /id="viewModeBadge"[^>]+role="button" tabindex="0"[^>]+aria-haspopup="menu"[^>]+aria-expanded="false"[^>]+aria-label="只读视图"/);
  assert.match(main, /viewModeBadge\.addEventListener\("keydown"/);
  assert.match(main, /event\.key === "Enter"|e\.key === "Enter"/);
  assert.match(main, /event\.key === " "|e\.key === " "/);
});

test("toast announcements and focus indicators remain accessible", () => {
  const ui = read("src/ui.js");
  const css = read("styles.css");

  assert.match(ui, /setAttribute\("role", "status"\)/);
  assert.match(ui, /setAttribute\("aria-live", "polite"\)/);
  assert.match(ui, /setAttribute\("aria-atomic", "true"\)/);
  assert.match(ui, /removalTimer/);
  for (const selector of ["button:focus-visible", "input:focus-visible", "select:focus-visible", "textarea:focus-visible"]) {
    assert.ok(css.includes(selector), "missing keyboard focus style: " + selector);
  }
});
