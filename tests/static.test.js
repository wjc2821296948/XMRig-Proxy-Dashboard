import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { PUBLIC_ASSET_PATHS, matchesAllowlistedPath } from "../src/public-assets.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const read = relativePath =>
  readFileSync(join(root, relativePath), "utf8");

test("index references the expected local application entry points", () => {
  const html = read("index.html");

  assert.match(html, /<link[^>]+href="styles\.css"/i);
  assert.match(
    html,
    /<script[^>]+type="module"[^>]+src="src\/main\.js"[^>]*><\/script>/i,
  );

  assert.equal(existsSync(join(root, "styles.css")), true);
  assert.equal(existsSync(join(root, "src/main.js")), true);
});

test("theme muted text tokens use higher-contrast colors in both palettes", () => {
  const css = read("styles.css");
  assert.match(css, /--text-muted:\s*#7f88ad;/, "dark theme muted text should remain legible on indigo surfaces");
  assert.match(css, /--text-muted:\s*#786b54;/, "light theme muted text should remain legible on cream surfaces");
});

test("index keeps the dashboard CSP security boundaries intact", () => {
  const html = read("index.html");
  const match = html.match(
    /<meta[^>]+http-equiv="Content-Security-Policy"[^>]+content="([^"]+)"/i,
  );

  assert.ok(match, "index.html must define an explicit Content Security Policy");
  const csp = match[1];

  for (const directive of [
    "default-src 'self'",
    "script-src 'self'",
    "font-src 'self' data:",
    "img-src 'self' data:",
    "connect-src *",
    "base-uri 'self'",
    "form-action 'self'",
  ]) {
    assert.ok(csp.includes(directive), `missing CSP directive: ${directive}`);
  }
});

test("browser theme-color metadata tracks the active dashboard theme", () => {
  const html = read("index.html");
  const source = read("src/theme-color.js");
  assert.match(html, /<meta name="theme-color" content="#0e0f1a">/);
  assert.match(html, /<script[^>]+src="src\/theme-color\.js"[^>]*><\/script>/);
  assert.match(source, /dark:\s*"#0e0f1a"/);
  assert.match(source, /light:\s*"#f4eee5"/);
  assert.match(source, /MutationObserver/);
  assert.match(source, /attributeFilter:\s*\["data-theme"\]/);
});

test("anti-framing policy is delivered through HTTP response headers", () => {
  const staticHeaders = read("_headers");
  const server = read("bin/server.js");

  assert.match(staticHeaders, /Content-Security-Policy:\s*frame-ancestors 'none'/);
  assert.match(staticHeaders, /X-Frame-Options:\s*DENY/i);
  assert.match(server, /"Content-Security-Policy":\s*"frame-ancestors 'none'"/);
  assert.match(server, /"X-Frame-Options":\s*"DENY"/);
});

test("interactive controls expose a theme-aware keyboard focus ring", () => {
  const css = read("styles.css");
  for (const selector of [
    "button:focus-visible",
    "input:focus-visible",
    "select:focus-visible",
    "textarea:focus-visible",
    "a:focus-visible",
    "[role=\"button\"]:focus-visible",
  ]) {
    assert.ok(css.includes(selector), `missing keyboard focus style: ${selector}`);
  }
  assert.match(css, /outline:\s*2px solid var\(--accent-copper\)/);
});

test("index does not load executable JavaScript from third-party URLs", () => {
  const html = read("index.html");
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)];

  for (const [, src] of scripts) {
    assert.ok(
      !/^https?:\/\//i.test(src),
      `third-party script source is not allowed: ${src}`,
    );
  }
});

test("all relative JavaScript imports resolve to files in the repository", () => {
  const srcDir = join(root, "src");
  const files = readdirSync(srcDir).filter(name => name.endsWith(".js"));

  for (const file of files) {
    const source = read(join("src", file));
    const imports = [
      ...source.matchAll(/\bimport\s+(?:[^"'\n]+?\s+from\s+)?["'](.+?)["']/g),
    ];

    for (const [, specifier] of imports) {
      if (!specifier.startsWith(".")) continue;
      const imported = resolve(srcDir, specifier);
      assert.ok(
        existsSync(imported),
        `broken import in src/${file}: ${specifier}`,
      );
    }
  }
});

test("read-only network access stays centralized in api.js", () => {
  const srcDir = join(root, "src");
  for (const file of readdirSync(srcDir).filter(name => name.endsWith(".js"))) {
    if (file === "api.js") continue;
    const source = read(join("src", file));

    assert.doesNotMatch(
      source,
      /\bfetch\s*\(/,
      `direct fetch() call found in src/${file}`,
    );
  }
});

test("dangerous dynamic-code primitives are absent from application sources", () => {
  const srcDir = join(root, "src");
  const forbidden = [
    /\beval\s*\(/,
    /\bnew\s+Function\s*\(/,
    /\bdocument\.write\s*\(/,
  ];

  for (const file of readdirSync(srcDir).filter(name => name.endsWith(".js"))) {
    const source = read(join("src", file));

    for (const pattern of forbidden) {
      assert.doesNotMatch(
        source,
        pattern,
        `forbidden dynamic-code primitive in src/${file}`,
      );
    }
  }
});


test("PR Agent action is immutable-pinned and cannot write repository content", () => {
  const workflow = read(".github/workflows/pr_agent.yml");

  assert.match(workflow, /uses:\s*the-pr-agent\/pr-agent@[0-9a-f]{40}/);
  assert.match(workflow, /contents:\s*read/);
  assert.doesNotMatch(workflow, /contents:\s*write/);
  for (const command of ["/improve", "/improve_code", "/update_changelog", "/add_docs"]) {
    assert.doesNotMatch(
      workflow,
      new RegExp("github\\.event\\.comment\\.body == '" + command.replace("/", "\\/") + "'"),
    );
  }
});



test("system theme preference follows operating-system appearance changes", () => {
  const main = read("src/main.js");
  const storage = read("src/storage.js");
  assert.match(storage, /new Set\(\["dark", "light", "system"\]\)/);
  assert.match(main, /prefers-color-scheme:\s*light/);
  assert.match(main, /query\.addEventListener\("change", handler\)/);
  assert.match(main, /systemThemeMediaQuery !== query \|\| systemThemeChangeHandler !== handler/);
  assert.match(main, /catch \{[\s\S]*?stale listener/i);
  assert.match(main, /applyThemePreference\(themePreference, \{ persist: true \}\)/);
  assert.match(main, /<option value="system"/);
});

test("every static-server allowlist entry exists in this checkout", () => {
  assert.ok(PUBLIC_ASSET_PATHS.length > 0, "public asset allowlist must not be empty");

  for (const assetPath of PUBLIC_ASSET_PATHS) {
    assert.ok(
      existsSync(join(root, assetPath)),
      `allowlisted asset does not exist: ${assetPath}`,
    );
  }
});

test("path allowlist comparison follows platform-specific casing rules", () => {
  assert.equal(matchesAllowlistedPath("src/main.js", "src/main.js", "win32"), true);
  assert.equal(matchesAllowlistedPath("Src/main.js", "src/main.js", "win32"), true);
  assert.equal(matchesAllowlistedPath("src/main.js", "src/main.js", "linux"), true);
  assert.equal(matchesAllowlistedPath("Src/main.js", "src/main.js", "linux"), false);
});

test("dashboard refreshes when a background tab becomes visible", () => {
  const source = read("src/main.js");
  assert.match(source, /document\.addEventListener\("visibilitychange",\s*\(\) => \{/);
  assert.match(source, /document\.visibilityState !== "visible"/);
  assert.match(source, /!getConfig\(\) \|\| activeDashboardMode !== "readonly"/);
  assert.match(source, /void fetchAndRender\(\)/);
});

test("startup does not restart polling after authentication clears the config", () => {
  const source = read("src/main.js");

  assert.match(
    source,
    /fetchAndRender\(\)\.then\(\(\) => \{[\s\S]*?if \(getConfig\(\)\) startAutoRefresh\(\);/,
    "startup should only start auto-refresh when a saved connection still exists",
  );
  assert.doesNotMatch(
    source,
    /fetchAndRender\(\)\.then\(\(\) => startAutoRefresh\(\)\)/,
    "do not unconditionally restart polling after an auth failure",
  );

  const reconnectStart = source.indexOf("const reconnectProfile = async profile =>");
  const reconnectEnd = source.indexOf('overlay.querySelector(".modal-close")', reconnectStart);
  const reconnectProfile = source.slice(reconnectStart, reconnectEnd);
  assert.match(
    reconnectProfile,
    /if \(err\.status === 401 \|\| err\.status === 403\) \{[\s\S]*?stopAutoRefresh\(\);[\s\S]*?clearConfig\(\);/,
    "profile-switch authentication failures must stop the previous profile's timer",
  );
  assert.match(
    reconnectProfile,
    /else \{[\s\S]*?stopAutoRefresh\(\);[\s\S]*?renderConnectForm\(\{ apiUrl: profile\.apiUrl/,
    "network failures must restore an actionable connection form",
  );
});

test("dashboard theme transitions respect reduced-motion preferences", () => {
  const css = read("styles.css");
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /animation-duration:\s*0\.01ms\s*!important/);
  assert.match(css, /transition-duration:\s*0\.01ms\s*!important/);
  assert.doesNotMatch(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]{0,400}?transition:\s*none/);
});
