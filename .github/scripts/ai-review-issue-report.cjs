'use strict';

const fs = require('node:fs');
const path = require('node:path');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function extractFinalReport(sessionJsonl) {
  const messages = readJsonLinesFromText(sessionJsonl)
    .filter((entry) => entry.type === 'assistant.message'
      && entry.data?.type === 'text'
      && typeof entry.data.content === 'string');

  for (const entry of messages.reverse()) {
    const content = entry.data.content.trim();
    if (content.length >= 80 && /^#\s+.*(?:Report|审查报告)/im.test(content)
      && /^##\s+.*Findings|^##\s+\d+\..*Findings/im.test(content)) {
      return content;
    }
  }
  return '';
}

function readJsonLinesFromText(text) {
  return String(text || '').split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

function extractNoopMessage(agentOutput, safeOutputLines) {
  const messages = [];
  if (Array.isArray(agentOutput?.items)) {
    for (const item of agentOutput.items) {
      if (item?.type === 'noop' && typeof item.message === 'string') messages.push(item.message);
    }
  }
  for (const item of readJsonLinesFromText(safeOutputLines)) {
    if (item.type === 'noop' && typeof item.message === 'string') messages.push(item.message);
  }
  return messages.at(-1) || '';
}

function parseFindingCounts(report, noopMessage = '') {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, unclassified: 0, parseReliable: false };
  const idSets = { C: new Set(), H: new Set(), M: new Set(), L: new Set() };
  const fallbackItems = new Set();
  const source = String(report || '');
  const headingMatch = /^##\s+(?:\d+\.\s*)?Findings\b[^\r\n]*$/im.exec(source);
  if (!headingMatch) { counts.total = 0; return counts; }
  const remainder = source.slice(headingMatch.index + headingMatch[0].length);
  const nextHeading = /^##\s+/m.exec(remainder);
  const section = nextHeading ? remainder.slice(0, nextHeading.index) : remainder;
  let severity = null;
  let hasFinding = false;
  let hasExplicitNoFindings = false;
  let severityTableSeen = false;
  let paragraph = [];
  const severityKey = (value) => ({ critical: 'critical', high: 'high', medium: 'medium', low: 'low' })[value] || null;
  const flushParagraph = () => {
    const value = paragraph.join(' ').trim();
    paragraph = [];
    if (!value || severity === 'informational' || /^no\s+(?:actionable\s+)?findings\b/i.test(value)) return;
    hasFinding = true;
    const key = severityKey(severity);
    if (key) fallbackItems.add(key + ':' + value);
    else counts.unclassified += 1;
  };

  // Count by severity headings, list entries, and Markdown table rows.
  for (const line of section.split(/\r?\n/)) {
    const heading = line.match(/^###\s+(Critical|High|Medium|Low|Informational)\b/i);
    if (heading) { flushParagraph(); severity = heading[1].toLowerCase(); severityTableSeen = false; continue; }
    if (/^\s*[-*+•‣▪–—]\s*No\s+(?:actionable\s+)?findings\b/i.test(line)
      || /^\s*No\s+(?:actionable\s+)?findings\b/i.test(line)) {
      flushParagraph(); hasExplicitNoFindings = true; continue;
    }
    const item = line.match(/^\s*(?:[-*+•‣▪–—]|\d+[.)])\s+(\S.*)$/);
    if (item) {
      flushParagraph();
      if (severity === 'informational') continue;
      hasFinding = true;
      const id = item[1].match(/(?:^|[\s*\x60])([CHML])\s*[-–—:]\s*(\d+)\b/i);
      if (id) idSets[id[1].toUpperCase()].add(id[2]);
      else {
        const key = severityKey(severity);
        if (key) fallbackItems.add(key + ':' + item[1].trim());
        else counts.unclassified += 1;
      }
      continue;
    }
    if (/^\s*\|/.test(line)) {
      const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
      if (cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
      if (severity && severity !== 'informational' && cells.length >= 2) {
        const firstCell = cells[0].replace(/^[*`]+|[*`]+$/g, '').trim();
        if (/^(?:#|id\b)/i.test(firstCell) || /^finding$/i.test(firstCell)) continue;
        hasFinding = true;
        severityTableSeen = true;
        const id = firstCell.match(/^([CHML])\s*[-–—:]?\s*(\d+)$/i);
        if (id) idSets[id[1].toUpperCase()].add(id[2]);
        else {
          const key = severityKey(severity);
          if (key) fallbackItems.add(key + ':' + cells.join(' | '));
          else counts.unclassified += 1;
        }
      }
      continue;
    }
    if (!line.trim() || /^\s*(?:```|~~~)/.test(line) || /^\s*<!--/.test(line)) continue;
    if (/^\s{2,}\S/.test(line) && hasFinding) continue;
    if (severityTableSeen) continue;
    if (severity && severity !== 'informational') paragraph.push(line.trim());
  }
  flushParagraph();
  counts.critical = idSets.C.size;
  counts.high = idSets.H.size;
  counts.medium = idSets.M.size;
  counts.low = idSets.L.size;
  for (const key of ['critical', 'high', 'medium', 'low']) {
    counts[key] += [...fallbackItems].filter((item) => item.startsWith(key + ':')).length;
  }
  if (!hasFinding && noopMessage) {
    const labels = [
      ['critical', /(?:^|[,;:]\s*)(\d+)\s+critical\b/i],
      ['high', /(?:^|[,;:]\s*)(\d+)\s+high\b/i],
      ['medium', /(?:^|[,;:]\s*)(\d+)\s+medium\b/i],
      ['low', /(?:^|[,;:]\s*)(\d+)\s+low\b/i],
    ];
    for (const [key, pattern] of labels) {
      const match = noopMessage.match(pattern);
      if (match) counts[key] = Number(match[1]);
    }
    const summaryReliable = labels.every(([, pattern]) => pattern.test(noopMessage));
    const summaryTotal = counts.critical + counts.high + counts.medium + counts.low;
    if (summaryReliable && (summaryTotal > 0 || !hasExplicitNoFindings)) {
      counts.parseReliable = true;
    }
  }
  counts.parseReliable = counts.parseReliable || hasFinding || hasExplicitNoFindings;
  counts.total = counts.critical + counts.high + counts.medium + counts.low + counts.unclassified;
  return counts;
}

function buildCommitUrl(run) {
  const sha = String(run?.head_sha || '');
  if (!/^[a-f0-9]{7,64}$/i.test(sha) || !run?.html_url) return '';
  try {
    const runUrl = new URL(run.html_url);
    if (runUrl.protocol !== 'https:' || runUrl.username || runUrl.password) return '';
    const match = runUrl.pathname.match(/^\/([^/]+)\/([^/]+)\/actions\/runs\/(\d+)\/?$/);
    if (!match || (run.id != null && match[3] !== String(run.id))) return '';
    const owner = decodeURIComponent(match[1]);
    const repo = decodeURIComponent(match[2]);
    const fullName = run.repository?.full_name;
    if (fullName && fullName.toLowerCase() !== (owner + '/' + repo).toLowerCase()) return '';
    const commitUrl = new URL(runUrl.origin);
    commitUrl.pathname = '/' + match[1] + '/' + match[2] + '/commit/' + sha;
    return commitUrl.toString();
  } catch {
    return '';
  }
}

async function upsertRerunSummary({ github, owner, repo, issueNumber, report }) {
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner, repo, issue_number: issueNumber, per_page: 100,
  });
  const existing = comments.find((comment) => (comment.body || '').includes(report.rerunMarker));
  const body = [
    'Latest rerun: attempt ' + report.attempt + ' — ' + (report.needsAttention ? 'requires attention' : 'no findings detected') + '.',
    'Actions run: [#' + report.runId + '](' + report.runUrl + ')',
    report.rerunMarker,
  ].join('\n');
  if (existing) {
    await github.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body });
    return 'updated';
  }
  await github.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body });
  return 'created';
}

function getReportIssueState(report, existingIssue = null) {
  // A rerun must never override a human's decision to keep a report open or close it.
  // Only the initial creation chooses state from the report contents.
  if (existingIssue?.state === 'open' || existingIssue?.state === 'closed') {
    return existingIssue.state;
  }
  return report?.needsAttention ? 'open' : 'closed';
}

function shouldDispatchAutoFix(report, issue) {
  const isReporterBot = issue?.user?.login === 'github-actions[bot]';
  const hasReviewLabel = Array.isArray(issue?.labels)
    && issue.labels.some((label) => (typeof label === 'string' ? label : label?.name) === 'ai-review');
  const body = String(issue?.body || '');
  const isReportIssue = typeof issue?.title === 'string'
    && issue.title.startsWith('AI Review Report')
    && /<!-- ai-review-run:\d+ -->/.test(body)
    && body.includes('## Full AI review report');
  return Boolean(
    isReporterBot
    && isReportIssue
    && report?.executionSucceeded
    && report?.counts?.parseReliable
    && report.counts.total > 0
    && report.counts.unclassified === 0
    && issue?.state === 'open'
    && hasReviewLabel,
  );
}

function firstExisting(...paths) {
  return paths.find((candidate) => candidate && fs.existsSync(candidate));
}

function extractInventorySummary(report) {
  const source = String(report || '');
  const legacyMatch = source.match(/(\d+)\s+explicit paths read successfully[;,]\s*(\d+)\s+unavailable/i);
  if (legacyMatch) return `${legacyMatch[1]} read; ${legacyMatch[2]} unavailable`;

  const heading = /^##\s+(?:\d+\.\s*)?Bounded file inventory\b[^\r\n]*$/im.exec(source);
  if (!heading) return 'not available';
  const remainder = source.slice(heading.index + heading[0].length);
  const nextHeading = /^##\s+/m.exec(remainder);
  const section = nextHeading ? remainder.slice(0, nextHeading.index) : remainder;
  const lines = section.split(/\r?\n/);
  let tableStarted = false;
  const readPaths = new Set();
  const unavailablePaths = new Set();
  let unavailableWithoutPath = 0;

  for (const line of lines) {
    if (!/^\s*\|/.test(line)) continue;
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
    if (!tableStarted) {
      if (/^group$/i.test(cells[0] || '') && /^files$/i.test(cells[1] || '') && /^result$/i.test(cells[2] || '')) {
        tableStarted = true;
      }
      continue;
    }
    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    if (cells.length < 3) continue;
    const paths = [...cells[1].matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    if (/\b(?:read|success|available)\b|✅/i.test(cells[2])) {
      for (const filePath of paths) readPaths.add(filePath);
    } else if (/unavailable|not read|failed|missing/i.test(cells[2])) {
      if (paths.length) for (const filePath of paths) unavailablePaths.add(filePath);
      else unavailableWithoutPath += 1;
    }
  }

  return tableStarted
    ? `${readPaths.size} read; ${unavailablePaths.size + unavailableWithoutPath} unavailable`
    : 'not available';
}

function buildReviewData({ agentDir, fallbackDir, usageDir, run }) {
  const agentSessionPath = firstExisting(
    path.join(agentDir || '', 'agent-session.jsonl'),
    path.join(fallbackDir || '', 'agent-session.jsonl'),
  );
  const agentOutputPath = firstExisting(
    path.join(agentDir || '', 'agent_output.json'),
    path.join(fallbackDir || '', 'agent_output.json'),
  );
  const safeOutputsPath = firstExisting(
    path.join(agentDir || '', 'safeoutputs.jsonl'),
    path.join(fallbackDir || '', 'safeoutputs.jsonl'),
  );
  const usagePath = firstExisting(
    path.join(usageDir || '', 'agent_usage.json'),
    path.join(agentDir || '', 'agent_usage.json'),
    path.join(fallbackDir || '', 'agent_usage.json'),
  );
  const gradersPath = firstExisting(path.join(usageDir || '', 'graders', 'grader_results.json'));

  const report = agentSessionPath
    ? extractFinalReport(fs.readFileSync(agentSessionPath, 'utf8'))
    : '';
  const agentOutput = agentOutputPath ? readJson(agentOutputPath) : null;
  const safeOutputLines = safeOutputsPath ? fs.readFileSync(safeOutputsPath, 'utf8') : '';
  const noopMessage = extractNoopMessage(agentOutput, safeOutputLines);
  const usage = usagePath ? readJson(usagePath) : null;
  const graders = gradersPath ? readJson(gradersPath) : null;
  const counts = parseFindingCounts(report, noopMessage);
  const startedAt = run.run_started_at || run.created_at || new Date().toISOString();
  const date = startedAt.slice(0, 10);
  const runId = String(run.id);
  const attempt = Number(run.run_attempt || 1);
  const title = `AI Review Report — ${date} — Run #${runId}`;
  const reportComplete = Boolean(report);
  const executionSucceeded = run.conclusion === 'success' && reportComplete;
  const needsAttention = !executionSucceeded || !counts.parseReliable || counts.total > 0;
  const graderSummary = graders?.run
    ? `${graders.run.passed}/${graders.run.graderCount} passed; ${graders.run.failed} failed; ${graders.run.errors} errors`
    : 'not available';
  const inventorySummary = extractInventorySummary(report);
  const model = usage?.primary_model || 'not available';
  const aic = Number.isFinite(usage?.ai_credits) ? String(usage.ai_credits) : 'not available';
  const runUrl = run.html_url || '';
  const sha = run.head_sha || '';
  const branch = run.head_branch || 'unknown';
  const commitUrl = buildCommitUrl(run);
  const marker = `<!-- ai-review-run:${runId} -->`;
  const attemptMarker = `<!-- ai-review-attempt:${runId}:${attempt} -->`;
  const rerunMarker = `<!-- ai-review-rerun-summary:${runId} -->`;

  const summaryRows = [
    ['Date (UTC)', date],
    ['Actions Run', `[#${runId}](${runUrl})`],
    ['Attempt', String(attempt)],
    ['Branch', `\`${branch}\``],
    ['Commit', commitUrl ? '[`' + sha.slice(0, 12) + '`](' + commitUrl + ')' : (sha ? `\`${sha.slice(0, 12)}\` (link unavailable)` : 'not available')],
    ['Workflow conclusion', run.conclusion || 'unknown'],
    ['Model', `\`${model}\``],
    ['AI credits (AIC)', aic],
    ['File inventory', inventorySummary],
    ['Graders', graderSummary],
  ];

  const findingRows = [
    ['Critical', counts.critical],
    ['High', counts.high],
    ['Medium', counts.medium],
    ['Low', counts.low],
    ['Unclassified', counts.unclassified],
  ];

  const statusNote = !executionSucceeded
    ? `**Review execution needs attention.** Workflow conclusion: \`${run.conclusion || 'unknown'}\`; ${reportComplete ? 'a Markdown report was recovered from the run artifact.' : 'no complete Markdown review report was found in the run artifacts.'} This Issue remains open so the incomplete or failed review is visible.`
    : !counts.parseReliable
      ? '**Finding format could not be parsed safely.** This Issue remains open because zero findings cannot be confirmed; review the report manually.'
      : needsAttention
        ? '**Actionable findings detected.** This Issue remains open until the findings are handled and the Issue is closed manually.'
      : '**No actionable findings detected.** This report is retained as a closed Issue for history.';

  const body = [
    marker,
    attemptMarker,
    '## Execution summary',
    '',
    statusNote,
    '',
    '| Field | Value |',
    '|---|---|',
    ...summaryRows.map(([key, value]) => `| ${key} | ${value} |`),
    '',
    '## Finding counts',
    '',
    '| Severity | Count |',
    '|---|---:|',
    ...findingRows.map(([key, value]) => `| ${key} | ${value} |`),
    `| **Total actionable / unclassified** | **${counts.total}** |`,
    '',
    '## Full AI review report',
    '',
    report || '_The run did not produce a complete Markdown report. See the Actions run for available diagnostics._',
    '',
    '---',
    `_Generated by the AI Review Issue Reporter from Actions run ${runId}, attempt ${attempt}. The AI review agent itself remains read-only._`,
  ].join('\n');

  return {
    title,
    body,
    marker,
    attemptMarker,
    rerunMarker,
    counts,
    model,
    aic,
    reportComplete,
    findingCountsReliable: counts.parseReliable,
    executionSucceeded,
    needsAttention,
    runUrl,
    runId,
    attempt,
    date,
  };
}

module.exports = {
  buildCommitUrl,
  buildReviewData,
  extractFinalReport,
  extractInventorySummary,
  extractNoopMessage,
  getReportIssueState,
  parseFindingCounts,
  shouldDispatchAutoFix,
  upsertRerunSummary,
};
