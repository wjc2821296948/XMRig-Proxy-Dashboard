import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const css = readFileSync(join(root, "styles.css"), "utf8");

test("responsive dashboard grid uses tablet columns while preserving full-width cards", () => {
  assert.match(css, /@media \(max-width: 768px\)\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit, minmax\(min\(100%, 300px\), 1fr\)\)/s);
  assert.match(css, /\.large-card\s*\{\s*grid-column:\s*1 \/ -1;/);
  assert.match(css, /@media \(max-width: 480px\)\s*\{[^}]*\.grid\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(css, /\.metrics-grid\s*\{\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
});
