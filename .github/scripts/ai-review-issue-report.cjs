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
  const counts = { critical: 0, high: 0, medium: 0, low: 0, unclassified: 0 };
  const idSets = { C: new Set(), H: new Set(), M: new Set(), L: new Set() };
  const source = String(report || '');
  const headingMatch = /^##\s+(?:\d+\.\s*)?Findings\b[^\r\n]*$/im.exec(source);
  let section = '';
  if (headingMatch) {
    const sectionStart = headingMatch.index + headingMatch[0].length;
    const remainder = source.slice(sectionStart);
    const nextHeading = /^##\s+/m.exec(remainder);
    section = nextHeading ? remainder.slice(0, nextHeading.index) : remainder;
  }

  // Accept the stable severity/number identifier even if Markdown emphasis or
  // the separator between the identifier and title changes.
  for (const match of section.matchAll(/^\s*[-*]\s+(?:(?:\*{1,2}|`))?([CHML])-(\d+)\b/gim)) {
    idSets[match[1].toUpperCase()].add(match[2]);
  }

  counts.critical = idSets.C.size;
  counts.high = idSets.H.size;
  counts.medium = idSets.M.size;
  counts.low = idSets.L.size;

  const identified = counts.critical + counts.high + counts.medium + counts.low;
  if (identified === 0 && noopMessage) {
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
  }

  const afterFallback = counts.critical + counts.high + counts.medium + counts.low;
  if (afterFallback === 0 && section) {
    let severity = null;
    for (const line of section.split(/\r?\n/)) {
      const heading = line.match(/^###\s+(Critical|High|Medium|Low|Informational)\b/i);
      if (heading) {
        severity = heading[1].toLowerCase();
        continue;
      }
      if (severity && severity !== 'informational' && /^\s*[-*]\s+\S/.test(line)
        && !/^\s*[-*]\s+No\s+(?:actionable\s+)?findings\b/i.test(line)) {
        counts.unclassified += 1;
      }
    }
  }

  counts.total = counts.critical + counts.high + counts.medium + counts.low + counts.unclassified;
  return counts;
}

function firstExisting(...paths) {
  return paths.find((candidate) => candidate && fs.existsSync(candidate));
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
  const needsAttention = !executionSucceeded || counts.total > 0;
  const graderSummary = graders?.run
    ? `${graders.run.passed}/${graders.run.graderCount} passed; ${graders.run.failed} failed; ${graders.run.errors} errors`
    : 'not available';
  const inventoryMatch = report.match(/(\d+)\s+explicit paths read successfully[;,]\s*(\d+)\s+unavailable/i);
  const inventorySummary = inventoryMatch
    ? `${inventoryMatch[1]} read; ${inventoryMatch[2]} unavailable`
    : 'not available';
  const model = usage?.primary_model || 'not available';
  const aic = Number.isFinite(usage?.ai_credits) ? String(usage.ai_credits) : 'not available';
  const runUrl = run.html_url || '';
  const sha = run.head_sha || '';
  const branch = run.head_branch || 'unknown';
  let commitUrl = '';
  if (sha && runUrl) {
    try {
      const parsedRunUrl = new URL(runUrl);
      parsedRunUrl.pathname = parsedRunUrl.pathname.replace(/\/actions\/runs\/\d+\/?$/, `/commit/${sha}`);
      parsedRunUrl.search = '';
      parsedRunUrl.hash = '';
      if (parsedRunUrl.pathname.endsWith(`/commit/${sha}`)) commitUrl = parsedRunUrl.toString();
    } catch {
      // An invalid or unfamiliar Actions URL should not produce a broken link.
    }
  }
  const marker = `<!-- ai-review-run:${runId} -->`;
  const attemptMarker = `<!-- ai-review-attempt:${runId}:${attempt} -->`;

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
    counts,
    model,
    aic,
    reportComplete,
    executionSucceeded,
    needsAttention,
    runUrl,
    runId,
    attempt,
    date,
  };
}

module.exports = {
  buildReviewData,
  extractFinalReport,
  extractNoopMessage,
  parseFindingCounts,
};
