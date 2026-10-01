import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

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
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ]) {
    assert.ok(csp.includes(directive), `missing CSP directive: ${directive}`);
  }
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
