import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const css = readFileSync(join(root, "styles.css"), "utf8");

test("stat rows align values clearly and retain stable numeric columns", () => {
  assert.match(css, /\.stat-row\s*\{[^}]*align-items:\s*center/s);
  assert.match(css, /\.stat-row:hover\s*\{[^}]*background-color:\s*var\(--bg-card-hover\)/s);
  assert.match(css, /\.stat-value\s*\{[^}]*font-variant-numeric:\s*tabular-nums/s);
  assert.match(css, /\.stat-value\s*\{[^}]*text-align:\s*right/s);
  assert.match(css, /\.stat-label\s*\{[^}]*min-width:\s*0/s);
});
