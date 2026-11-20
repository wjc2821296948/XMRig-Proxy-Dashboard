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
  bash: false
  cli-proxy: false
  edit: false

max-turns: 10
max-tool-calls: 40
timeout-minutes: 20
---

# AI Maintenance Bootstrap — Read-only Smoke Test

This workflow validates the Pi-to-LiteLLM connection and performs a read-only repository inventory. It must not modify files, create branches, commit, push, open pull requests, comment, label, or otherwise write to GitHub.

## Scope

Inspect the entire checked-out repository, including source files, tests, documentation, package metadata, and existing GitHub Actions workflows. Exclude only generated/binary assets from textual inspection; identify excluded paths in the report.

## Required checks

1. Confirm the configured model/provider is available through the workflow's inference gateway. Do not reveal, print, or echo credentials or request headers.
2. Read the repository's project instructions and summarize its architecture and development constraints.
3. Inventory all source modules, test files, and CI workflows. Identify the existing test command and Node.js support range.
4. Review the repository for high-confidence correctness, security, reliability, and maintenance concerns. Distinguish confirmed findings from hypotheses; cite exact file paths and line ranges.
5. Do not run shell commands. Do not edit or generate files. Do not use network access except the configured LiteLLM inference endpoint and GitHub tools already provided by the workflow.

## Output

Return a concise Markdown report in the workflow run summary containing:

- Provider/model connectivity result (success/failure only; never include secrets)
- Repository inventory and architecture
- Existing tests and CI coverage
- Findings grouped by severity with evidence and confidence
- Recommended next steps for the daily reporting and safe-fix stages

If the model cannot be reached or repository access is incomplete, report the exact limitation and stop. Do not claim a successful scan without evidence.
