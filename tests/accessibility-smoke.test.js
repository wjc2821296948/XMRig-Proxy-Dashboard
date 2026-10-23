import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = path => readFileSync(join(root, path), "utf8");

/**
 * Extract the content of a template literal assigned at a distinctive source
 * anchor. These smoke tests validate rendered markup, not JavaScript function
 * boundaries, so they should not depend on declaration order or function names.
 */
function extractTemplateLiteral(source, assignment) {
  const assignmentIndex = source.indexOf(assignment);
  assert.notEqual(assignmentIndex, -1, `template assignment not found: ${assignment}`);
  assert.equal(
    source.indexOf(assignment, assignmentIndex + assignment.length),
    -1,
    `expected one template assignment: ${assignment}`,
  );

  const openingBacktick = source.indexOf("`", assignmentIndex + assignment.length);
  assert.notEqual(openingBacktick, -1, `template literal not found after: ${assignment}`);

  for (let index = openingBacktick + 1; index < source.length; index++) {
    if (source[index] === "\\") {
      index++;
      continue;
    }
    if (source[index] === "`") {
      return source.slice(openingBacktick + 1, index);
    }
  }

  assert.fail(`unterminated template literal after: ${assignment}`);
}

test("template extraction is independent of surrounding declarations", () => {
  const source = [
    'function before() { return "}"; }',
    "const markup = `markup with { braces }`;",
    "function after() { return false; }",
  ].join("\n");

  assert.equal(extractTemplateLiteral(source, "const markup ="), "markup with { braces }");
  assert.throws(
    () => extractTemplateLiteral(source, "const missing ="),
    /template assignment not found/,
  );
});

test("connection flow exposes labeled controls and keyboard submission", () => {
  const main = read("src/main.js");
  const connect = extractTemplateLiteral(
    main,
    'const { apiUrl = "", apiToken = "", remember = true } = prefill;\n  els.dashboard.innerHTML =',
  );

  assert.match(connect, /role="dialog" aria-labelledby="connect-title"/);
  assert.match(connect, /<h2 id="connect-title"/);
  for (const [id, type] of [["apiUrlInput", "url"], ["apiTokenInput", "password"]]) {
    assert.match(connect, new RegExp('<label[^>]+for="' + id + '"'));
    assert.match(connect, new RegExp('<input[^>]+type="' + type + '"[^>]+id="' + id + '"'));
    assert.match(main, new RegExp('getElementById\\("' + id + '"\\)\\.addEventListener\\("keydown"'));
  }
  assert.match(connect, /<label for="rememberMe">/);
});

test("settings dialog has a name, modal semantics, and labeled form controls", () => {
  const main = read("src/main.js");
  const settings = extractTemplateLiteral(main, "const modalHtml =");

  assert.match(settings, /role="dialog"[^>]+aria-labelledby="modal-title" aria-modal="true"/);
  assert.match(settings, /<h3[^>]+id="modal-title"/);
  for (const id of ["sProfileName", "sApiUrl", "sApiToken", "sRefreshInterval", "sTheme"]) {
    assert.match(settings, new RegExp('<label[^>]+for="' + id + '"'));
  }
  assert.match(settings, /<button class="modal-close" aria-label="关闭"/);
  assert.match(main, /getElementById\("cancelSettings"\)\.addEventListener\("click"/);
  assert.match(main, /addEventListener\("keydown", escHandler\)/);
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
