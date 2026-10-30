import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const css = readFileSync(join(root, "styles.css"), "utf8");

/**
 * Return the contents of a CSS block, accounting for nested braces while
 * ignoring braces inside comments and quoted strings.
 */
function extractCssBlock(source, openingBraceIndex) {
  assert.equal(source[openingBraceIndex], "{", "Expected a CSS block opening brace");

  let depth = 0;
  let quote = null;
  let inComment = false;

  for (let index = openingBraceIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (inComment) {
      if (char === "*" && next === "/") {
        inComment = false;
        index += 1;
      }
      continue;
    }

    if (quote !== null) {
      if (char === "\\") {
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "/" && next === "*") {
      inComment = true;
      index += 1;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(openingBraceIndex + 1, index);
    }
  }

  assert.fail("Unclosed CSS block");
}

function extractMediaBlock(source, query) {
  const marker = `@media (${query})`;
  const mediaIndex = source.indexOf(marker);
  assert.notEqual(mediaIndex, -1, `Missing media query: ${marker}`);

  const openingBraceIndex = source.indexOf("{", mediaIndex + marker.length);
  assert.notEqual(openingBraceIndex, -1, `Missing block for media query: ${marker}`);
  return extractCssBlock(source, openingBraceIndex);
}

function extractRuleBody(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(`(?:^|\\n)\\s*${escapedSelector}\\s*\\{`);
  const match = expression.exec(source);
  assert.ok(match, `Missing CSS rule: ${selector}`);

  const openingBraceIndex = match.index + match[0].lastIndexOf("{");
  return extractCssBlock(source, openingBraceIndex);
}

test("responsive dashboard grid uses tablet columns while preserving full-width cards", () => {
  const tablet = extractMediaBlock(css, "max-width: 768px");
  const tabletGrid = extractRuleBody(tablet, ".grid");
  const tabletLargeCard = extractRuleBody(tablet, ".large-card");

  assert.match(
    tabletGrid,
    /grid-template-columns:\\s*repeat\\(auto-fit, minmax\\(min\\(100%, 300px\\), 1fr\\)\\)/,
  );
  assert.match(tabletLargeCard, /grid-column:\\s*1 \\/ -1;/);

  const phone = extractMediaBlock(css, "max-width: 480px");
  const phoneGrid = extractRuleBody(phone, ".grid");
  const phoneMetricsGrid = extractRuleBody(phone, ".metrics-grid");

  assert.match(phoneGrid, /grid-template-columns:\\s*minmax\\(0, 1fr\\)/);
  assert.match(phoneMetricsGrid, /grid-template-columns:\\s*repeat\\(2, minmax\\(0, 1fr\\)\\)/);
});
