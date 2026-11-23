import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('.github/workflows/ai-review-auto-fix.md', 'utf8');
const lock = fs.readFileSync('.github/workflows/ai-review-auto-fix.lock.yml', 'utf8');

test('AI Auto Fix uses trusted workflow metadata for unique dated branches', () => {
  assert.match(source, /AI_AUTO_FIX_RUN_ID:\s*\$\{\{\s*github\.run_id\s*\}\}/);
  assert.match(source, /AI_AUTO_FIX_RUN_ATTEMPT:\s*\$\{\{\s*github\.run_attempt\s*\}\}/);
  assert.match(source, /date -u \+%F/);
  assert.ok(source.includes('`ai-auto-fix/<UTC-date>/<run-id>-<run-attempt>-<slug>`'));
  assert.ok(source.includes('`ai-auto-fix/2026-11-23/45042781769-2-html-injection-unvalidated-api-values-renderdashboard`'));
  assert.match(source, /An orphan branch from a different run or attempt must not block this run/);
  assert.match(source, /run ID separates different workflow runs, the attempt separates retries/);
});

test('AI Auto Fix safe output allowlist only accepts the dated run-scoped branch layout', () => {
  assert.match(source, /allowed-branches:\s*\n\s*- ai-auto-fix\/\*\/\*/);
  assert.match(lock, /allowed_branches.*ai-auto-fix\/\*\/\*/);
  assert.doesNotMatch(source, /ai-review-fix\//);
});
