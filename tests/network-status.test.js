import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function replaceGlobal(name, value) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, {
    configurable: true,
    enumerable: previous?.enumerable ?? true,
    writable: true,
    value,
  });

  return () => {
    if (previous) Object.defineProperty(globalThis, name, previous);
    else delete globalThis[name];
  };
}

test("browser offline and online events toggle the localized connectivity notice", async t => {
  let online = false;
  const listeners = new Map();
  const rootAttributes = new Set();
  const bannerAttributes = new Map();
  const banner = {
    className: "",
    hidden: false,
    textContent: "",
    setAttribute(name, value) {
      bannerAttributes.set(name, String(value));
    },
    getAttribute(name) {
      return bannerAttributes.get(name) ?? null;
    },
  };
  const container = {
    prepended: null,
    prepend(element) {
      this.prepended = element;
    },
  };
  const documentMock = {
    createElement(tagName) {
      assert.equal(tagName, "div");
      return banner;
    },
    querySelector(selector) {
      assert.equal(selector, ".container");
      return container;
    },
    documentElement: {
      toggleAttribute(name, force) {
        if (force) rootAttributes.add(name);
        else rootAttributes.delete(name);
      },
    },
  };
  const windowMock = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
  };
  const navigatorMock = {
    get onLine() {
      return online;
    },
  };
  const storageMock = {
    getItem(key) {
      return key === "dashboard_locale" ? "en" : null;
    },
  };

  const restore = [
    replaceGlobal("document", documentMock),
    replaceGlobal("window", windowMock),
    replaceGlobal("navigator", navigatorMock),
    replaceGlobal("localStorage", storageMock),
  ];
  t.after(() => restore.reverse().forEach(restoreGlobal => restoreGlobal()));

  const source = readFileSync(join(root, "src/network-status.js"), "utf8");
  const localizedSource = source.replace(
    'from "./i18n.js";',
    `from "${pathToFileURL(join(root, "src/i18n.js")).href}";`,
  );
  assert.notEqual(localizedSource, source, "the module must import the real i18n helper");

  const moduleUrl = `data:text/javascript;base64,${Buffer.from(localizedSource).toString("base64")}`;
  await import(moduleUrl);

  assert.equal(container.prepended, banner);
  assert.equal(banner.className, "network-status-banner");
  assert.equal(banner.getAttribute("role"), "status");
  assert.equal(banner.getAttribute("aria-live"), "polite");
  assert.equal(
    banner.textContent,
    "Your browser reports that it is offline. This does not indicate whether the Proxy API is reachable.",
  );
  assert.equal(banner.hidden, false, "the initial offline state should show the notice");
  assert.equal(rootAttributes.has("data-network-offline"), true);

  online = true;
  listeners.get("online")();
  assert.equal(banner.hidden, true, "the online event should hide the notice");
  assert.equal(rootAttributes.has("data-network-offline"), false);

  online = false;
  listeners.get("offline")();
  assert.equal(banner.hidden, false, "the offline event should show the notice again");
  assert.equal(rootAttributes.has("data-network-offline"), true);
});
