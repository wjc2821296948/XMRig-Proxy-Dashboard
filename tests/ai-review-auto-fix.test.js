import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('.github/workflows/ai-review-auto-fix.md', 'utf8');
const lock = fs.readFileSync('.github/workflows/ai-review-auto-fix.lock.yml', 'utf8');

function parseFrontmatterSequence(text, key) {
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(frontmatter, 'workflow frontmatter must exist');
  const lines = frontmatter[1].split(/\r?\n/);
  const keyIndex = lines.findIndex((line) => line.trim() === `${key}:`);
  assert.notEqual(keyIndex, -1, `missing ${key} sequence`);
  const baseIndent = lines[keyIndex].match(/^\s*/)[0].length;
  const values = [];

  for (let index = keyIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    const indent = line.match(/^\s*/)[0].length;
    if (indent <= baseIndent) break;
    const item = line.trim().match(/^-\s+(.+)$/);
    if (!item) continue;
    let value = item[1].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = JSON.parse(value);
    else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    values.push(value);
  }
  return values;
}

function parseCompiledBashAllowlist(text) {
  const policyLine = text.match(/^\s*GH_AW_PI_TOOL_POLICY:\s*'(.+)'\s*$/m);
  assert.ok(policyLine, 'compiled lock must contain the Pi tool policy');
  const policy = JSON.parse(policyLine[1]);
  assert.ok(Array.isArray(policy.bash), 'compiled Pi bash policy must be an array');
  return policy.bash;
}

test('AI Auto Fix injects trusted workflow metadata for unique dated branches', () => {
  assert.ok(source.includes('AI_AUTO_FIX_RUN_ID: ${{ github.run_id }}'));
  assert.ok(source.includes('AI_AUTO_FIX_RUN_ATTEMPT: ${{ github.run_attempt }}'));
  assert.ok(source.includes('`ai-auto-fix/<UTC-date>/<run-id>-<run-attempt>-<slug>`'));
  assert.match(source, /An orphan branch from a different run or attempt must not block this run/);
  assert.match(source, /run ID separates different workflow runs, the attempt separates retries/);
});

test('AI Auto Fix uses repository-scoped GitHub code search instead of broad Bash search', () => {
  assert.match(source, /GitHub `search_code` tool for repository code searches/);
  assert.match(source, /Use the `read` tool to inspect the exact matching file/);
  assert.match(source, /unrestricted argument forms are intentionally not allowlisted/);
});

test('AI Auto Fix Bash allowlist is explicit and matches the compiled lock policy', () => {
  const sourceCommands = parseFrontmatterSequence(source, 'bash');
  const compiledCommands = parseCompiledBashAllowlist(lock);
  const requiredCommands = [
    'npm test',
    'node --check',
    'node --version',
    'git status --short',
    'git log --oneline -5',
    'git log --oneline -3',
    'git branch --show-current',
    'git remote -v',
    'date -u +%F',
  ];
  const unrestrictedSearchCommands = ['grep:*', 'ls:*', 'head:*'];

  for (const command of requiredCommands) {
    assert.ok(sourceCommands.includes(command), `source is missing Bash command: ${command}`);
    assert.ok(compiledCommands.includes(command), `compiled lock is missing Bash command: ${command}`);
  }
  for (const command of unrestrictedSearchCommands) {
    assert.ok(!sourceCommands.includes(command), `source must not allow ${command}`);
    assert.ok(!compiledCommands.includes(command), `compiled lock must not allow ${command}`);
  }
  assert.match(source, /Run one simple command per Bash tool call/);
  assert.match(source, /Do not chain commands with `&&`, `\|\|`, `;`, or pipes\./);
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
