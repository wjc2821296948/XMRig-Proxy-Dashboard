import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const css = readFileSync(join(root, "styles.css"), "utf8");

test("dashboard metric cards prioritize readable, stable numeric values", () => {
  assert.match(css, /\.card-value\s*\{[^}]*font-size:\s*clamp\(/s);
  assert.match(css, /\.card-value\s*\{[^}]*font-variant-numeric:\s*tabular-nums/s);
  assert.match(css, /\.metric-value\s*\{[^}]*font-variant-numeric:\s*tabular-nums/s);
  assert.match(css, /\.metric-item\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /\.metric-label\s*\{\s*font-size:\s*0\.6rem/s);
});
