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


test("Gemini review workflow keeps issue comments out of shell source", () => {
  const workflow = read(".github/workflows/code-review.yml");

  assert.doesNotMatch(workflow, /permissions:\s*write-all/);
  assert.match(workflow, /COMMENT_BODY:\s*\$\{\{\s*github\.event\.comment\.body\s*\}\}/);
  assert.doesNotMatch(workflow, /echo\s+["']Comment:\s*\$\{\{/);
  assert.match(workflow, /uses:\s*truongnh1992\/gemini-ai-code-reviewer@[0-9a-f]{40}/);
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


test("AI review commands are restricted to trusted repository collaborators", () => {
  const geminiWorkflow = read(".github/workflows/code-review.yml");
  const prAgentWorkflow = read(".github/workflows/pr_agent.yml");
  const trustedAssociationGate =
    /contains\(fromJSON\('\["OWNER", "MEMBER", "COLLABORATOR"\]'\), github\.event\.comment\.author_association\)/;

  assert.match(geminiWorkflow, trustedAssociationGate);
  assert.match(prAgentWorkflow, trustedAssociationGate);
  assert.match(prAgentWorkflow, /issue_comment:\s*\n\s+types:\s+\[created\]/);
});
