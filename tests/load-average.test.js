import { test } from "node:test";
import assert from "node:assert/strict";
import { formatLoadAverage } from "../src/load-average.js";

test("formats finite non-negative load averages and masks invalid samples", () => {
  assert.equal(formatLoadAverage([0, 0.25, 1.5]), "0 / 0.25 / 1.5");
  assert.equal(formatLoadAverage([-0.5, 0.3, 0.4]), "— / 0.3 / 0.4");
  assert.equal(formatLoadAverage([NaN, Infinity, "0.7", null]), "— / — / — / —");
  assert.equal(formatLoadAverage(null), "—");
  assert.equal(formatLoadAverage({ 0: 0.1, length: 1 }), "—");
});
