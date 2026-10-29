import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  getLocale,
  listTranslations,
  normalizeLocale,
  saveLocale,
  translate,
} from "../src/i18n.js";

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(String(key), String(value)); }
}

test("normalizes supported locale aliases and defaults unsupported values", () => {
  assert.equal(normalizeLocale("en-US"), "en");
  assert.equal(normalizeLocale("EN-gb"), "en");
  assert.equal(normalizeLocale("zh"), "zh-CN");
  assert.equal(normalizeLocale("zh-Hans-CN"), "zh-CN");
  assert.equal(normalizeLocale("fr"), DEFAULT_LOCALE);
  assert.equal(normalizeLocale(null), DEFAULT_LOCALE);
});

test("persists only the locale preference and defaults to Chinese", () => {
  const storage = new MemoryStorage();
  assert.equal(getLocale(storage), DEFAULT_LOCALE);
  assert.equal(saveLocale("en", storage), true);
  assert.equal(storage.getItem(LOCALE_STORAGE_KEY), "en");
  assert.equal(getLocale(storage), "en");
  assert.equal(saveLocale("fr", storage), false);
});

test("storage failures degrade safely without throwing", () => {
  const denied = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("quota exceeded"); },
  };
  assert.equal(getLocale(denied), DEFAULT_LOCALE);
  assert.equal(saveLocale("en", denied), false);
  assert.equal(saveLocale("zh-CN", null), false);
});

test("translations select a dictionary and fall back to Chinese then the key", () => {
  assert.equal(translate("settings.title", "en"), "Settings");
  assert.equal(translate("settings.title", "zh-CN"), "设置");
  assert.equal(translate("untranslated.key", "en"), "untranslated.key");
});

test("interpolation substitutes only strings and finite numbers", () => {
  assert.equal(listTranslations("en")["refresh.now"], "Refresh now");
  assert.equal(translate("example {count} {name}", "en", { count: 3, name: "<operator>" }), "example 3 <operator>");
  assert.equal(translate("example {count}", "en", { count: Infinity }), "example {count}");
});
