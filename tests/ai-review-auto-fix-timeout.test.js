import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('.github/workflows/ai-review-auto-fix.md', 'utf8');
const lock = fs.readFileSync('.github/workflows/ai-review-auto-fix.lock.yml', 'utf8');

test('AI Auto Fix allows the agent execution step up to 120 minutes', () => {
  assert.match(source, /^timeout-minutes:\s*120\s*$/m);

  const lines = lock.split(/\r?\n/);
  const stepStart = lines.findIndex((line) => /^\s*- name: Execute Pi CLI\s*$/.test(line));
  assert.notEqual(stepStart, -1, 'compiled workflow must contain the Execute Pi CLI step');
  const stepEnd = lines.findIndex((line, index) => index > stepStart && /^\s*- name: /.test(line));
  const agentStep = lines.slice(stepStart, stepEnd === -1 ? undefined : stepEnd).join('\n');
  assert.match(agentStep, /^\s+timeout-minutes:\s*120\s*$/m);

  const safeOutputsStart = lines.findIndex((line) => /^  safe_outputs:\s*$/.test(line));
  assert.notEqual(safeOutputsStart, -1, 'compiled workflow must contain the safe_outputs job');
  const safeOutputsEnd = lines.findIndex((line, index) => index > safeOutputsStart && /^  [A-Za-z0-9_-]+:\s*$/.test(line));
  const safeOutputsJob = lines.slice(safeOutputsStart, safeOutputsEnd === -1 ? undefined : safeOutputsEnd).join('\n');
  assert.match(safeOutputsJob, /^    timeout-minutes:\s*45\s*$/m);
});
