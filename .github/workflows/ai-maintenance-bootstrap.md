---
name: AI Maintenance Bootstrap

on:
  workflow_dispatch:

permissions:
  contents: read

engine:
  id: pi
  version: "1.3.0"
  model: openai/glm-5.3-flash
  model-provider: openai
  # LiteLLM routes this model group through an OpenAI-compatible
  # Chat Completions endpoint; the default OpenAI provider selects Responses.
  config: |
    {
      "model": {
        "api": "openai-completions"
      }
    }
  env:
    OPENAI_BASE_URL: "https://litellm.lrate.top/v1"
    OPENAI_API_KEY: ${{ secrets.LITELLM_API_KEY }}

network:
  allowed:
    - defaults
    - litellm.lrate.top

safe-outputs:
  create-issue: false
  noop:
    report-as-issue: false
  report-failure-as-issue: false
  report-missing-tool: false
  report-missing-data: false
  report-incomplete:
    create-issue: false
  threat-detection: false

tools:
  github:
    toolsets: [repos]
    allowed: [get_file_contents]
    allowed-repos: "${{ github.repository }}"
    min-integrity: approved
  bash: false
  cli-proxy: false
  edit: false

max-turns: 10
# This LiteLLM/NVIDIA NIM route reports no prompt-cache tokens; allow one miss per turn.
max-turn-cache-misses: 10
# The first successful protocol test used 26.265 AIC; keep a bounded ~3.8x ceiling.
max-ai-credits: 100
max-tool-calls: 40
timeout-minutes: 20
---

# AI Maintenance Bootstrap — Read-only Smoke Test

This workflow validates the Pi-to-LiteLLM connection and performs a bounded, read-only repository review. It must not modify files, create branches, commit, push, open pull requests, comment, label, or otherwise write to GitHub.

## Scope

Inspect the project's documented architecture, package/test contract, application entrypoints, representative core modules, representative tests, and all known CI workflow definitions listed below. This is a bounded bootstrap review, not an exhaustive line-by-line audit of every file.

Use only the explicit file paths below and paths referenced directly by those files. Do not attempt directory listings, call search tools, or probe guessed filenames. The GitHub content tool applies `min-integrity: approved`, which can filter directory listings; do not retry filtered listings or weaken that integrity policy. If an explicit file is unavailable, record that path as unavailable and continue with the remaining files. Never claim a complete repository-wide inventory.

## Required checks

1. Confirm the configured model/provider is available through the workflow's inference gateway. Do not reveal, print, or echo credentials or request headers.
2. Read `CLAUDE.md`, `README.md`, `package.json`, and `index.html`; summarize the architecture, development constraints, scripts, and supported Node.js versions.
3. Inspect these application files: `src/main.js`, `src/api.js`, `src/storage.js`, `src/ui.js`, `src/status.js`, and `service-worker.js`.
4. Inspect these representative tests: `tests/api.test.js`, `tests/storage.test.js`, `tests/status.test.js`, `tests/static.test.js`, and `tests/server.test.js`. Identify test coverage gaps without claiming these are all tests.
5. Assess CI and AI-maintenance orchestration from these explicit workflow files only: `.github/workflows/pr_agent.yml`, `.github/workflows/publish-package.yml`, `.github/workflows/release-smoke.yml`, `.github/workflows/status-tests.yml`, `.github/workflows/ai-maintenance-bootstrap.md`, `.github/workflows/ai-review-issue-reporter.yml`, and `.github/workflows/ai-review-auto-fix.md`. Do not query workflow runs, job logs, or other Actions API data.
6. Audit the AI-maintenance control plane itself by reading `.github/scripts/ai-review-issue-report.cjs`, `tests/ai-review-issue-report.test.js`, and `tests/ai-review-auto-fix.test.js`. Verify that Reporter trust checks, artifact-to-Issue publication, Run ID idempotency, manual-trigger assignee provenance, permission separation, Auto Fix integrity checks, run-scoped branches, file allowlists, signed Draft PR outputs, and the no-auto-close/no-merge policy remain aligned. Treat generated `.lock.yml` files as compiler outputs covered by the dedicated Lock Checks workflow; do not read or modify them here.
7. Report only high-confidence correctness, security, reliability, and maintenance concerns. Distinguish confirmed findings from hypotheses; cite exact file paths and line ranges.
8. Do not run shell commands. Do not edit or generate files. Do not use network access except the configured LiteLLM inference endpoint and GitHub tools already provided by the workflow. Batch independent file reads where possible to reduce model turns and repeated context.

## Output

Return a concise Markdown report in the workflow run summary containing:

- Provider/model connectivity result (success/failure only; never include secrets)
- Bounded file inventory and architecture, including any unavailable paths
- Representative tests and CI coverage
- Findings grouped by severity with evidence and confidence
- Recommended next steps for reporting and safe-fix stages; do not enable or assume a schedule unless explicitly requested

If the model cannot be reached or a required explicit file cannot be read, report the exact limitation and stop. Filtered directory listings are an expected limitation under the approved integrity policy; do not retry them or treat them as proof that individual files are unavailable. Do not claim exhaustive repository coverage.
