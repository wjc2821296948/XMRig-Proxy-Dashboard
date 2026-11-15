import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../src/locale-bootstrap.js", import.meta.url), "utf8");

function runBootstrap({ localStorage, sessionStorage } = {}) {
  const root = { lang: "zh-CN", dataset: {} };
  const document = { documentElement: root, title: "XMRig Proxy 仪表盘" };
  const context = { document, globalThis: null };
  context.globalThis = context;
  if (localStorage !== undefined) Object.defineProperty(context, "localStorage", { configurable: true, get: typeof localStorage === "function" ? localStorage : () => localStorage });
  if (sessionStorage !== undefined) Object.defineProperty(context, "sessionStorage", { configurable: true, get: typeof sessionStorage === "function" ? sessionStorage : () => sessionStorage });
  vm.runInNewContext(source, context);
  return { root, title: document.title };
}

function storageWith(value) {
  return { getItem(key) { assert.equal(key, "dashboard_locale"); return value; } };
}

test("locale bootstrap reads the remembered locale before first paint", () => {
  const result = runBootstrap({ localStorage: storageWith("en-US") });
  assert.equal(result.root.lang, "en");
  assert.equal(result.root.dataset.locale, "en");
  assert.equal(result.title, "XMRig Proxy Dashboard");
});

test("locale bootstrap falls back to sessionStorage when localStorage has no value", () => {
  const result = runBootstrap({ localStorage: storageWith(null), sessionStorage: storageWith("en-GB") });
  assert.equal(result.root.lang, "en");
  assert.equal(result.root.dataset.locale, "en");
});

test("locale bootstrap tries sessionStorage when localStorage is inaccessible", () => {
  const denied = () => { throw new Error("storage denied"); };
  const result = runBootstrap({ localStorage: denied, sessionStorage: storageWith("en") });
  assert.equal(result.root.dataset.locale, "en");
});

test("locale bootstrap safely defaults to Chinese when both storages are unavailable", () => {
  const denied = () => { throw new Error("storage denied"); };
  const result = runBootstrap({ localStorage: denied, sessionStorage: denied });
  assert.equal(result.root.lang, "zh-CN");
  assert.equal(result.root.dataset.locale, "zh-CN");
  assert.equal(result.title, "XMRig Proxy 仪表盘");
});
