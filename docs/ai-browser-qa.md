# AI Browser QA

This repository has two separate browser QA layers:

- **Playwright E2E** is deterministic, runs on every relevant push/PR, uses a local mocked Proxy API, and requires no model key.
- **Browser Use exploration** is an optional, owner-triggered agent run. It explores the dashboard in a local Chromium browser and posts advisory findings to the target Issue/PR.

The dashboard's published npm package remains dependency-free. All Node QA dependencies live under `.github/qa/` and are excluded from the npm package by the existing package contract.

## Commands

Run slash commands as the repository owner in an Issue or PR comment. Manual AI workflow dispatches are also restricted to the repository owner:

| Command | Behavior |
|---|---|
| `/qa regression` | Run deterministic Chromium E2E against the trusted default branch; on a PR, report its automatic check status instead |
| `/qa explore` | Ask Browser Use to explore the local dashboard using a mock Proxy API |
| `/qa issue 140` | Explore the dashboard with Issue #140 as the QA target |
| `/qa pr 123` | Report the current checks for PR #123; its code is tested automatically by the `pull_request` workflows |
| `/qa report` | Link the latest AI exploration report on the current Issue |
| `/qa fix` | Ask the separate Fix Agent for a constrained patch based on the latest AI QA report, run tests and CI, then open a PR if all checks pass |

The **AI Browser QA** and **AI QA Fix PR** workflows also support manual `workflow_dispatch` runs. After this PR is merged, open Actions → AI Browser QA → Run workflow. Choose `test-explorer-key` and `test-fixer-key` in separate runs to verify each key. Each test job receives only its own agent's key; neither key is exposed in logs.

## GitHub Actions configuration

Add the following repository Actions secrets. Each agent must have its own key; do not reuse one key for both agents:

| Secret name | Agent | Purpose |
|---|---|---|
| `QA_EXPLORER_LITELLM_API_KEY` | Browser Explorer Agent | Browser Use model calls through LiteLLM |
| `QA_FIXER_LITELLM_API_KEY` | QA Fix Agent | Generate a constrained unified diff through LiteLLM |

Add these Actions variables (not secrets):

| Variable | Purpose |
|---|---|
| `LITELLM_API_BASE` | OpenAI-compatible LiteLLM base URL; defaults to `https://litellm.lrate.top/v1` |
| `QA_EXPLORER_MODEL` | Model name configured in LiteLLM for browser exploration |
| `QA_FIXER_MODEL` | Model name configured in LiteLLM for patch generation |

The LiteLLM endpoint is restricted to `https://litellm.lrate.top/v1`; redirects to arbitrary endpoints and custom hosts are not accepted. No `BROWSER_USE_API_KEY` or generic `OPENAI_API_KEY` is required. Browser Use is installed from its pinned open-source package and uses the dedicated LiteLLM key. The Browser Use hosted browser service is not used.

## Safety boundaries

- The normal Playwright workflow has read-only repository permission and no model secrets.
- AI exploration checks out the trusted default branch, not arbitrary PR code. It uses a local dashboard and a mock Proxy endpoint; no real miner, Proxy token, or production endpoint is required.
- The Browser Explorer job receives no GitHub write token. Its dedicated key is scoped to that agent only. Browser Use runs model-generated Python in its own REPL; it is **not a security sandbox**. Browser navigation is restricted to the exact local origins `http://127.0.0.1:18080` and `http://127.0.0.1:18081` (including ports), but domain restrictions are a guardrail, not a sandbox. Keep the key limited to the configured exploration model with a small budget. Issue title/body text is deliberately not forwarded to the code-executing browser agent; the issue number is used only as a target reference.
- The Fix Agent is a separate model-only script. It does not run model-generated code. Its patch is restricted to existing regular files under `src/`, `tests/`, `docs/`, and the two README files. New files, deletes, renames, symlinks, `index.html`, `src/api.js`, `src/storage.js`, `src/public-assets.js`, and `src/ui.js` are rejected; workflow files, package metadata, scripts, and secrets are not eligible.
- The fix workflow validates and executes the patch only in a read-only job with no secrets or write token. A separate write-enabled job reapplies the already-validated patch but does not execute the patched code; it dispatches existing CI workflows and matches their runs by the exact pushed commit SHA. It opens a PR only after all three workflows pass. It contains no merge command or merge step; human review and merge remain required.
- AI-generated commits use the `github-actions[bot]` identity and are not signed with a maintainer's personal GPG key.

## Local deterministic tests

```bash
npm ci --prefix .github/qa
npx --prefix .github/qa playwright install --with-deps chromium
npm --prefix .github/qa test
```
