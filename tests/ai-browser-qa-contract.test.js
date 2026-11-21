import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const parse = path => JSON.parse(read(path));

test("browser QA dependencies stay outside the published dashboard package", () => {
  const app = parse("package.json");
  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    assert.deepEqual(app[field] || {}, {}, `${field} must remain empty in the app package`);
  }
  const qa = parse(".github/qa/package.json");
  assert.equal(qa.private, true);
  assert.equal(qa.devDependencies["@playwright/test"], "1.65.1");
  const lock = parse(".github/qa/package-lock.json");
  assert.equal(lock.packages[""].devDependencies["@playwright/test"], "1.65.1");
  for (const name of ["@playwright/test", "playwright", "playwright-core"]) {
    assert.equal(lock.packages[`node_modules/${name}`].version, "1.65.1");
  }
  assert.ok(read(".github/qa/package-lock.json").includes('"lockfileVersion": 3'));
});

test("deterministic browser E2E uses read-only permissions and no model secrets", () => {
  const workflow = read(".github/workflows/browser-e2e.yml");
  assert.match(workflow, /permissions:\s+contents:\s+read/);
  assert.doesNotMatch(workflow, /secrets\./);
  assert.doesNotMatch(workflow, /pull_request_target/);
  assert.match(workflow, /npm ci --prefix \.github\/qa/);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.doesNotMatch(workflow, /cache:\s*npm/);
});

test("Browser Explorer is bounded, restricted to local hosts, and has no GitHub write permissions", () => {
  const workflow = read(".github/workflows/ai-browser-qa.yml");
  const runner = read(".github/qa/agent/run_explorer.py");
  const exploreJob = workflow.slice(workflow.indexOf("  explore:"), workflow.indexOf("  pr-report:"));
  assert.match(exploreJob, /contents:\s+read/);
  assert.doesNotMatch(workflow, /needs\.route\.outputs\.checkout_ref/);
  assert.match(workflow, /checks\.listForRef/);
  assert.match(workflow, /pr-report:/);
  assert.doesNotMatch(exploreJob, /issues:\s+write|pull-requests:\s+write|GH_TOKEN|github\.token/);
  assert.match(exploreJob, /QA_EXPLORER_LITELLM_API_KEY/);
  assert.match(runner, /Browser\("chromium", allowed_domains=\["127\.0\.0\.1", "localhost"\]\)/);
  assert.match(runner, /max_steps=12/);
  assert.match(runner, /127\.0\.0\.1:18081/);
  assert.doesNotMatch(runner, /GH_TOKEN|GITHUB_TOKEN/);
});

test("Fix Agent and PR creator use separate jobs and distinct API key names", () => {
  const workflow = read(".github/workflows/ai-fix-pr.yml");
  const generator = workflow.slice(workflow.indexOf("  generate:"), workflow.indexOf("  open-pr:"));
  const opener = workflow.slice(workflow.indexOf("  open-pr:"));
  const fixer = read(".github/scripts/qa-fix-agent.py");
  assert.match(generator, /QA_FIXER_LITELLM_API_KEY/);
  assert.doesNotMatch(generator, /contents:\s+write|pull-requests:\s+write|GH_TOKEN/);
  assert.doesNotMatch(opener, /QA_FIXER_LITELLM_API_KEY/);
  assert.match(fixer, /src\/|tests\/|docs\//);
  assert.doesNotMatch(opener, /gh pr merge|merge-pull-request/);
  assert.match(opener, /gh pr create/);
  assert.match(opener, /gh workflow run status-tests\.yml/);
  assert.match(opener, /gh workflow run release-smoke\.yml/);
  assert.match(opener, /gh workflow run browser-e2e\.yml/);
});

test("AI QA documentation lists independent agent keys and slash commands", () => {
  const docs = read("docs/ai-browser-qa.md");
  assert.match(docs, /QA_EXPLORER_LITELLM_API_KEY/);
  assert.match(docs, /QA_FIXER_LITELLM_API_KEY/);
  assert.match(docs, /`\/qa issue 140`/);
  assert.match(docs, /`\/qa fix`/);
});


test("every browser entrypoint module and its local imports are in the static server allowlist", () => {
  const html = read("index.html");
  const allowlistSource = read("src/public-assets.js");
  const allowed = new Set([...allowlistSource.matchAll(/"((?:src|vendor)\/[^"]+\.js)"/g)].map(match => match[1]));
  const pending = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map(match => match[1]);
  const visited = new Set();

  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    assert.ok(allowed.has(file), `${file} must be included in PUBLIC_ASSET_PATHS`);
    const source = read(file);
    for (const match of source.matchAll(/\b(?:from|import)\s*(?:\(\s*)?["'](\.\/[^"']+\.js)["']/g)) {
      pending.push(path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1].slice(2))));
    }
  }
});
