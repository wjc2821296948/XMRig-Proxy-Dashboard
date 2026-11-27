import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('.github/workflows/ai-review-auto-fix.md', 'utf8');
const lock = fs.readFileSync('.github/workflows/ai-review-auto-fix.lock.yml', 'utf8');

test('AI Auto Fix injects trusted workflow metadata for unique dated branches', () => {
  assert.ok(source.includes('env:\n  AI_AUTO_FIX_RUN_ID: ${{ github.run_id }}\n  AI_AUTO_FIX_RUN_ATTEMPT: ${{ github.run_attempt }}'));
  assert.ok(source.includes('- Workflow run ID: `${{ env.AI_AUTO_FIX_RUN_ID }}`'));
  assert.ok(source.includes('- Workflow run attempt: `${{ env.AI_AUTO_FIX_RUN_ATTEMPT }}`'));
  assert.equal((source.match(/AI_AUTO_FIX_RUN_ID:/g) || []).length, 1);
  assert.equal((source.match(/AI_AUTO_FIX_RUN_ATTEMPT:/g) || []).length, 1);
  assert.match(source, /date -u \+%F/);
  assert.ok(source.includes('`ai-auto-fix/<UTC-date>/<run-id>-<run-attempt>-<slug>`'));
  assert.ok(source.includes('`ai-auto-fix/2026-11-23/45042781769-2-html-injection-unvalidated-api-values-renderdashboard`'));
  assert.match(source, /An orphan branch from a different run or attempt must not block this run/);
  assert.match(source, /run ID separates different workflow runs, the attempt separates retries/);
});

test('AI Auto Fix Bash allowlist supports only required read-only command arguments', () => {
  for (const command of [
    'git status --short',
    'git log --oneline -5',
    'git log --oneline -3',
    '"grep:*"',
    '"ls:*"',
    '"head:*"',
    'node --version',
    'git branch --show-current',
    'git remote -v',
    '"date -u +%F"',
  ]) {
    assert.ok(source.includes(`    - ${command}`), `missing Bash allowlist entry: ${command}`);
  }
  assert.ok(!source.includes('    - \"git:*\"'));
  assert.ok(!source.includes('    - \":*\"'));
  assert.match(source, /Run one simple command per Bash tool call/);
  assert.ok(source.includes('Do not chain commands with `&&`, `||`, `;`, or pipes.'));
});

test('AI Auto Fix assigns PRs only from the optional trusted reporter input', () => {
  assert.match(source, /assignee:\n\s+description:.*manually started/);
  assert.match(source, /assignees: \$\{\{ inputs\.assignee \}\}/);
  assert.match(source, /empty value means leave the PR unassigned/i);
  assert.match(lock, /assignees.*inputs\.assignee/);
});

test('AI Auto Fix safe output allowlist only accepts the dated run-scoped branch layout', () => {
  assert.match(source, /allowed-branches:\s*\n\s*- ai-auto-fix\/\*\/\*/);
  assert.match(lock, /allowed_branches.*ai-auto-fix\/\*\/\*/);
  assert.doesNotMatch(source, /ai-review-fix\//);
});
