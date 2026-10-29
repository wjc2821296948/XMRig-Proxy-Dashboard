import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const css = readFileSync(join(root, "styles.css"), "utf8");

test("settings modal and form controls use clearer spacing and readable hints", () => {
  assert.match(css, /\.modal\s*\{[^}]*padding:\s*clamp\(/s);
  assert.match(css, /\.modal\s*\{[^}]*max-width:\s*460px/s);
  assert.match(css, /\.modal-header\s*\{[^}]*border-bottom:\s*1px solid var\(--border-light\)/s);
  assert.match(css, /\.modal-close:hover\s*\{[^}]*background:\s*var\(--bg-card-hover\)/s);
  assert.match(css, /\.input-field\s*\{[^}]*min-height:\s*2\.6rem/s);
  assert.match(css, /\.input-hint\s*\{[^}]*line-height:\s*1\.45/s);
});
