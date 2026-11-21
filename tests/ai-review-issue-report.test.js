import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildReviewData,
  extractFinalReport,
  extractNoopMessage,
  parseFindingCounts,
} = require('../.github/scripts/ai-review-issue-report.cjs');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ai-review-report-'));
}

test('extracts the final Markdown report but never reasoning text', () => {
  const session = [
    JSON.stringify({ type: 'assistant.reasoning', data: { content: 'private reasoning must not be copied' } }),
    JSON.stringify({
      type: 'assistant.message',
      data: { type: 'text', content: '# AI Maintenance Report\n\n## 1. Summary\n\nshort progress message' },
    }),
    JSON.stringify({
      type: 'assistant.message',
      data: { type: 'text', content: '# AI Maintenance Report\n\n## 4. Findings\n\n### Medium\n\n- **M-1 · Risk** details\n' + 'Evidence '.repeat(40) },
    }),
  ].join('\n');

  const report = extractFinalReport(session);
  assert.match(report, /M-1/);
  assert.doesNotMatch(report, /private reasoning/);
});

test('counts unique actionable findings only inside the Findings section', () => {
  const report = [
    '## 4. Findings',
    '### Medium',
    '- **M-1 · Security** details',
    '- **M-2 · Reliability** details',
    '### Low',
    '- **L-1 · Maintenance** details',
    '### Informational',
    '- PR-Agent is SHA pinned.',
    '## 5. Next steps',
    '- Fix M-1 and L-1 first.',
  ].join('\n');

  assert.deepEqual(parseFindingCounts(report), {
    critical: 0,
    high: 0,
    medium: 2,
    low: 1,
    unclassified: 0,
    parseReliable: true,
    total: 3,
  });
});

test('counts finding IDs when Markdown emphasis and title separators vary', () => {
  const report = [
    '## Findings',
    '### Medium',
    '- M-3 — Security issue',
    '- **M-4: Reliability issue**',
    '- `M-5` · Compatibility issue',
  ].join('\n');
  const counts = parseFindingCounts(report);
  assert.equal(counts.medium, 3);
  assert.equal(counts.total, 3);
});

test('counts findings with changed IDs or bullet formats conservatively', () => {
  const report = [
    '## Findings',
    '### High',
    '- Finding A — unsafe HTML rendering',
    '+ HIGH: missing validation',
  ].join('\n');
  const counts = parseFindingCounts(report);
  assert.equal(counts.high, 0);
  assert.equal(counts.unclassified, 2);
  assert.equal(counts.total, 2);
  assert.equal(counts.parseReliable, true);
});

test('marks an unrecognized or missing Findings section as unreliable', () => {
  assert.equal(parseFindingCounts('# AI Report\n\n## Summary\nAll good.').parseReliable, false);
  assert.equal(parseFindingCounts('## Findings\n\nNo conclusion was provided.').parseReliable, false);
});

test('uses the noop summary when a report has no numbered finding entries', () => {
  const counts = parseFindingCounts(
    '## 4. Findings\n\nNo actionable findings.',
    'Key findings: 1 high, 2 medium, 0 low.',
  );
  assert.equal(counts.high, 1);
  assert.equal(counts.medium, 2);
  assert.equal(counts.total, 3);
});

test('builds an open Issue for findings and a closed historical Issue for a clean report', () => {
  const root = makeTempDir();
  const agentDir = path.join(root, 'agent');
  const usageDir = path.join(root, 'usage');
  fs.mkdirSync(agentDir);
  fs.mkdirSync(path.join(usageDir, 'graders'), { recursive: true });
  const report = [
    '# AI Maintenance Bootstrap Report',
    '',
    '## 1. Summary',
    'Model `glm-5.3-flash`.',
    '',
    'All **19 explicit paths read successfully; 0 unavailable**.',
    '',
    '## 4. Findings',
    '### Medium',
    '- **M-1 · Security** raw response values reach innerHTML.',
    '',
    '## 5. Next steps',
    '- Fix M-1.',
  ].join('\n');
  const session = [
    JSON.stringify({ type: 'assistant.message', data: { type: 'text', content: report } }),
    JSON.stringify({ type: 'assistant.reasoning', data: { content: 'do not publish' } }),
  ].join('\n');
  fs.writeFileSync(path.join(agentDir, 'agent-session.jsonl'), session);
  fs.writeFileSync(path.join(agentDir, 'agent_output.json'), JSON.stringify({ items: [{ type: 'noop', message: 'Review complete.' }] }));
  fs.writeFileSync(path.join(usageDir, 'agent_usage.json'), JSON.stringify({ primary_model: 'glm-5.3-flash', ai_credits: 12.5 }));
  fs.writeFileSync(path.join(usageDir, 'graders', 'grader_results.json'), JSON.stringify({ run: { passed: 10, graderCount: 10, failed: 0, errors: 0 } }));

  const run = {
    id: 123456,
    run_attempt: 1,
    event: 'workflow_dispatch',
    conclusion: 'success',
    run_started_at: '2026-11-21T10:00:00Z',
    head_branch: 'main',
    head_sha: 'abcdef1234567890',
    html_url: 'https://github.com/example/project/actions/runs/123456',
  };
  const data = buildReviewData({ agentDir, usageDir, run });
  assert.match(data.title, /2026-11-21.*123456/);
  assert.equal(data.needsAttention, true);
  assert.match(data.body, /M-1 · Security/);
  assert.match(data.body, /glm-5.3-flash/);
  assert.match(data.body, /ai-review-run:123456/);
  assert.match(data.body, /https:\/\/github\.com\/example\/project\/commit\/abcdef1234567890/);

  fs.writeFileSync(path.join(agentDir, 'agent-session.jsonl'), JSON.stringify({
    type: 'assistant.message',
    data: { type: 'text', content: '# AI Maintenance Bootstrap Report\n\n## 4. Findings\n\n### Informational\n\n- No actionable findings.\n\n## 5. Next steps\n\nNone.' },
  }));
  fs.writeFileSync(path.join(agentDir, 'agent_output.json'), JSON.stringify({ items: [{ type: 'noop', message: 'Key findings: 0 high, 0 medium, 0 low.' }] }));
  const clean = buildReviewData({ agentDir, usageDir, run });
  assert.equal(clean.needsAttention, false);
  assert.equal(clean.counts.total, 0);

  fs.writeFileSync(path.join(agentDir, 'agent-session.jsonl'), JSON.stringify({
    type: 'assistant.message',
    data: { type: 'text', content: '# AI Maintenance Bootstrap Report\n\n## 4. Findings\n\nThe finding format changed and cannot be parsed.' },
  }));
  const unparseable = buildReviewData({ agentDir, usageDir, run });
  assert.equal(unparseable.findingCountsReliable, false);
  assert.equal(unparseable.needsAttention, true);
  assert.match(unparseable.body, /could not be parsed safely/i);
  fs.rmSync(root, { recursive: true, force: true });
});

test('keeps failed or incomplete workflow runs open even without a report artifact', () => {
  const root = makeTempDir();
  const data = buildReviewData({
    agentDir: path.join(root, 'missing-agent'),
    fallbackDir: path.join(root, 'missing-fallback'),
    usageDir: path.join(root, 'missing-usage'),
    run: {
      id: 987654,
      run_attempt: 1,
      conclusion: 'failure',
      created_at: '2026-11-21T10:00:00Z',
      head_branch: 'main',
      html_url: 'https://github.com/example/project/actions/runs/987654',
    },
  });
  assert.equal(data.reportComplete, false);
  assert.equal(data.needsAttention, true);
  assert.match(data.body, /no complete Markdown review report was found/i);
  fs.rmSync(root, { recursive: true, force: true });
});

test('extracts noop messages from both agent output and fallback safe-output records', () => {
  const message = extractNoopMessage(
    { items: [{ type: 'noop', message: 'first' }] },
    JSON.stringify({ type: 'noop', message: 'fallback latest' }),
  );
  assert.equal(message, 'fallback latest');
});
