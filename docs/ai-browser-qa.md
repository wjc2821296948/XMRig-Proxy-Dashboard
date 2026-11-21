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
| `LITELLM_API_BASE` | OpenAI-compatible LiteLLM base URL for the Fix Agent and key-smoke jobs; defaults to `https://litellm.lrate.top/v1` |
| `QA_EXPLORER_MODEL` | Model name configured in LiteLLM for browser exploration |
| `QA_FIXER_MODEL` | Model name configured in LiteLLM for patch generation |

The Browser Explorer uses a fixed relay to `https://litellm.lrate.top/v1/chat/completions`; it does not accept custom upstream hosts or redirects. The Fix Agent and key-smoke jobs continue to use the configured `LITELLM_API_BASE`. No `BROWSER_USE_API_KEY` or generic `OPENAI_API_KEY` is required. Browser Use is installed from its pinned open-source package; the Browser Use hosted browser service is not used.

## Safety boundaries

- The normal Playwright workflow has read-only repository permission and no model secrets.
- AI exploration checks out the trusted default branch, not arbitrary PR code. The dashboard is mounted read-only into its own fixture container; the mock Proxy API and dashboard expose no host-published ports. No real miner, Proxy token, or production endpoint is required.
- Browser Use runs model-generated Python in a **no-egress Docker sandbox** container, not in the GitHub runner's host process environment. The container is non-root, has a read-only root filesystem, no Linux capabilities, no Docker socket, no repository mount, bounded CPU/memory/processes, and only temporary writable `/tmp` and home directories. It joins an internal Docker network with no direct egress; external DNS is sent only to an internal NXDOMAIN sinkhole, and the approved service names are supplied through static host entries. The workflow verifies that direct-IP HTTPS and external DNS are blocked, and probes a temporary listener on the runner's bridge gateway to prove host access is blocked. A temporary host INPUT firewall rule drops all traffic arriving from the dedicated bridge; the rule and probe listener are removed during cleanup.
- The internal network contains only the dashboard fixture, mock Proxy API, Browser Use container, an internal DNS sinkhole, and a narrow fixed LiteLLM relay. The relay is the only container attached to an egress-capable network. It accepts only chat-completion POSTs, pins the upstream to `https://litellm.lrate.top/v1/chat/completions`, rejects redirects, pins the configured model, caps output tokens at 2,048, limits a run to 60 model requests, and does not log request bodies, headers, or credentials. The real `QA_EXPLORER_LITELLM_API_KEY` exists only in the relay container; Browser Use receives a non-secret placeholder. The relay's fixed implementation does not execute model-generated code.
- These are defense-in-depth container and network controls, not a claim of VM-grade isolation: containers share the runner's host kernel. The Browser Explorer still receives no GitHub write token. Issue title/body text is deliberately not forwarded to the code-executing agent; only the issue number is used as a target reference. Keep the dedicated key scoped to the configured exploration model with a small budget.
- The Fix Agent is a separate model-only script. It does not run model-generated code. Its patch is restricted to existing regular files under `src/`, `tests/`, `docs/`, and the two README files. New files, deletes, renames, symlinks, `index.html`, API/storage/static-asset/UI security files, `src/escape-html.js`, `src/background-upload-guard.js`, all three alert engine modules, `tests/alert-rules.test.js`, and the patch validator itself are protected; workflow files, package metadata, scripts, and secrets are not eligible.
- The fix workflow validates and executes the patch only in a read-only job with no secrets or write token. A separate write-enabled job reapplies the already-validated patch but does not execute the patched code; it dispatches existing CI workflows and matches their runs by the exact pushed commit SHA. It opens a PR only after all three workflows pass. It contains no merge command or merge step; human review and merge remain required.
- AI-generated commits use the `github-actions[bot]` identity and are not signed with a maintainer's personal GPG key.

## Local deterministic tests

```bash
npm ci --prefix .github/qa
npx --prefix .github/qa playwright install --with-deps chromium
npm --prefix .github/qa test
```
