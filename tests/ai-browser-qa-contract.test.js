import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const parse = path => JSON.parse(read(path));

test("browser QA dependencies stay outside the published dashboard package", () => {
  const app = parse("package.json");
  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    assert.deepEqual(app[field] || {}, {}, `${field} must remain empty in the app package`);
  }
  const qa = parse(".github/qa/package.json");
  assert.equal(qa.private, true);
  assert.equal(qa.devDependencies["@playwright/test"], "1.65.1");
  const lock = parse(".github/qa/package-lock.json");
  assert.equal(lock.packages[""].devDependencies["@playwright/test"], "1.65.1");
  for (const name of ["@playwright/test", "playwright", "playwright-core"]) {
    assert.equal(lock.packages[`node_modules/${name}`].version, "1.65.1");
  }
  assert.ok(read(".github/qa/package-lock.json").includes('"lockfileVersion": 3'));
});

test("deterministic browser E2E uses read-only permissions and no model secrets", () => {
  const workflow = read(".github/workflows/browser-e2e.yml");
  assert.match(workflow, /permissions:\s+contents:\s+read/);
  assert.doesNotMatch(workflow, /secrets\./);
  assert.doesNotMatch(workflow, /pull_request_target/);
  assert.match(workflow, /npm ci --prefix \.github\/qa/);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.doesNotMatch(workflow, /cache:\s*npm/);
});

test("Browser Explorer runs in a no-egress Docker sandbox and keeps LiteLLM credentials in the relay", () => {
  const workflow = read(".github/workflows/ai-browser-qa.yml");
  const browserWorkflow = read(".github/workflows/browser-e2e.yml");
  const runner = read(".github/qa/agent/run_explorer.py");
  const sandbox = read(".github/qa/agent/run-sandbox.sh");
  const browserDockerfile = read(".github/qa/agent/Dockerfile.browser");
  const relayDockerfile = read(".github/qa/agent/Dockerfile.relay");
  const dnsDockerfile = read(".github/qa/agent/Dockerfile.dns");
  const relay = read(".github/qa/agent/litellm_relay.py");
  const dnsSinkhole = read(".github/qa/agent/dns_sinkhole.py");
  const exploreJob = workflow.slice(workflow.indexOf("  explore:"), workflow.indexOf("  pr-report:"));
  const smokeJob = browserWorkflow.slice(browserWorkflow.indexOf("  sandbox-security-smoke:"));
  const browserStart = sandbox.indexOf('docker run -d --name "$agent_name"');
  const browserContainer = sandbox.slice(browserStart, sandbox.indexOf("\nready=false", browserStart));
  assert.match(exploreJob, /contents:\s+read/);
  assert.doesNotMatch(workflow, /needs\.route\.outputs\.checkout_ref/);
  assert.match(workflow, /checks\.listForRef/);
  assert.match(workflow, /pr-report:/);
  assert.doesNotMatch(exploreJob, /issues:\s+write|pull-requests:\s+write|GH_TOKEN|github\.token/);
  assert.match(exploreJob, /Run Browser Use in an isolated no-egress container/);
  assert.match(exploreJob, /QA_EXPLORER_LITELLM_API_KEY/);
  assert.match(workflow, /context\.actor !== context\.repo\.owner/);
  assert.match(sandbox, /docker network create --internal/);
  assert.match(sandbox, /--dns \"\$dns_ip\"/);
  assert.match(sandbox, /qa-dns-sinkhole/);
  assert.match(sandbox, /--cap-drop ALL/);
  assert.match(sandbox, /--read-only/);
  assert.match(sandbox, /--env HOST=0\.0\.0\.0 --env PORT=18080/);
  assert.match(sandbox, /unexpectedly has direct egress/);
  assert.match(sandbox, /NoNewPrivs/);
  assert.match(sandbox, /DNS sinkhole did not return NXDOMAIN/);
  assert.match(sandbox, /unexpectedly has external DNS/);
  assert.match(sandbox, /sudo iptables -I INPUT 1 -i/);
  assert.match(sandbox, /sudo iptables -D INPUT -i/);
  assert.match(sandbox, /host-gateway isolation probe/);
  assert.match(sandbox, /trap 'exit 143' TERM/);
  assert.match(sandbox, /trap 'exit 130' INT/);
  assert.match(sandbox, /time\.sleep\(300\)/);
  assert.match(sandbox, /time\.sleep\(1800\)/);
  assert.match(sandbox, /unexpectedly reached the runner host/);
  assert.match(sandbox, /QA_SANDBOX_SMOKE_ONLY/);
  assert.match(sandbox, /Browser\("chromium"/);
  assert.match(sandbox, /Browser Use agent imports passed/);
  assert.match(sandbox, /no model call was made/);
  assert.match(smokeJob, /contains\(github\.event\.pull_request\.labels\.\*\.name, 'browser-qa-sandbox'\)/);
  assert.match(smokeJob, /QA_EXPLORER_LITELLM_API_KEY: sandbox-smoke-placeholder/);
  assert.match(smokeJob, /QA_SANDBOX_SMOKE_ONLY: "true"/);
  assert.match(sandbox, /--pids-limit 256 --memory 2g --cpus 2/);
  assert.match(sandbox, /--env QA_EXPLORER_LITELLM_API_KEY --env QA_EXPLORER_MODEL/);
  assert.doesNotMatch(browserContainer, /QA_EXPLORER_LITELLM_API_KEY|LITELLM_API_KEY/);
  assert.match(browserContainer, /--read-only/);
  assert.match(browserContainer, /--cap-drop ALL/);
  assert.match(browserContainer, /--pids-limit 256 --memory 2g --cpus 2/);
  assert.match(browserContainer, /dst=\/app\/qa-context\.json,readonly/);
  assert.match(browserContainer, /dst=\/report/);
  assert.match(browserContainer, /PLAYWRIGHT_BROWSERS_PATH=\/opt\/ms-playwright/);
  assert.doesNotMatch(browserContainer, /GITHUB_WORKSPACE|docker\.sock|--network host|--mount[^\n]*workspace/);
  assert.doesNotMatch(sandbox, /docker cp/);
  assert.match(browserDockerfile, /USER 10001:10001/);
  assert.match(browserDockerfile, /touch \/app\/qa-context\.json/);
  assert.match(browserDockerfile, /mkdir -p \/app \/opt\/ms-playwright \/report/);
  assert.match(browserDockerfile, /apt-get install -y --no-install-recommends libatomic1/);
  assert.match(browserDockerfile, /browser-use install/);
  assert.match(browserDockerfile, /PLAYWRIGHT_BROWSERS_PATH=\/opt\/ms-playwright/);
  assert.match(relayDockerfile, /USER 10002:10002/);
  assert.match(dnsDockerfile, /USER 10003:10003/);
  assert.match(sandbox, /--cap-add NET_BIND_SERVICE/);
  assert.match(dnsSinkhole, /NXDOMAIN/);
  assert.match(dnsSinkhole, /QuietUDPServer/);
  assert.match(relay, /https:\/\/litellm\.lrate\.top\/v1\/chat\/completions/);
  assert.match(relay, /MAX_REQUESTS_PER_RUN = 60/);
  assert.match(relay, /request_count_lock = Lock\(\)/);
  assert.match(relay, /def claim_request_slot/);
  assert.match(relay, /MAX_OUTPUT_TOKENS = 2048/);
  assert.match(relay, /NoRedirectHandler/);
  assert.ok(runner.includes('"http://dashboard:18080"'));
  assert.ok(runner.includes('"http://mock-proxy:18081"'));
  assert.match(runner, /max_steps=12/);
  assert.match(runner, /http:\/\/litellm-relay:8080\/v1/);
  assert.match(runner, /relay-managed-no-secret/);
  assert.match(runner, /must never receive the LiteLLM secret/);
  assert.doesNotMatch(runner, /api_key=os\.environ|QA_EXPLORER_LITELLM_API_KEY\s*=/);
  assert.doesNotMatch(runner, /127\.0\.0\.1:18080|127\.0\.0\.1:18081/);
  assert.doesNotMatch(runner, /context\.get\(['\"]issue_body|context\.get\(['\"]issue_title/);
  assert.doesNotMatch(runner, /GH_TOKEN|GITHUB_TOKEN/);
});

test("Fix Agent and PR creator use separate jobs and distinct API key names", () => {
  const workflow = read(".github/workflows/ai-fix-pr.yml");
  const generator = workflow.slice(workflow.indexOf("  generate:"), workflow.indexOf("  validate:"));
  const validator = workflow.slice(workflow.indexOf("  validate:"), workflow.indexOf("  publish-pr:"));
  const publisher = workflow.slice(workflow.indexOf("  publish-pr:"));
  const fixer = read(".github/scripts/qa-fix-agent.py");
  const patchValidator = read(".github/scripts/validate-qa-fix-patch.py");
  const fixAgent = read(".github/scripts/qa-fix-agent.py");
  const alertTests = read("tests/alert-rules.test.js");
  assert.match(generator, /QA_FIXER_LITELLM_API_KEY/);
  assert.match(workflow, /context\.actor !== context\.repo\.owner/);
  assert.doesNotMatch(generator, /contents:\s+write|pull-requests:\s+write|GH_TOKEN/);
  assert.doesNotMatch(validator, /contents:\s+write|pull-requests:\s+write|GH_TOKEN|QA_FIXER_LITELLM_API_KEY/);
  assert.match(validator, /npm test/);
  assert.match(validator, /npm --prefix \.github\/qa test/);
  assert.doesNotMatch(publisher, /npm test|playwright install|QA_FIXER_LITELLM_API_KEY/);
  assert.match(publisher, /git rev-parse HEAD/);
  assert.match(publisher, /\.headSha == \$sha/);
  assert.match(publisher, /gh pr create/);
  assert.doesNotMatch(publisher, /gh pr merge|merge-pull-request/);
  assert.match(fixer, /LITELLM_API_BASE must be https:\/\/litellm\.lrate\.top\/v1/);
  assert.match(patchValidator, /tracked_regular_files/);
  assert.match(patchValidator, /PROTECTED_FILES/);
  assert.match(fixAgent, /urllib\.error\.HTTPError/);
  assert.match(fixAgent, /NoRedirectHandler/);
  assert.match(fixAgent, /def load_context/);
  assert.match(fixAgent, /def extract_patch/);
  assert.match(fixAgent, /def validate_patch_text/);
  assert.match(fixAgent, /def tracked_regular_files/);
  assert.match(fixAgent, /def is_existing_regular_file/);
  assert.match(fixAgent, /missing or non-regular working-tree file/);
  assert.match(fixAgent, /new or untracked file/);
  assert.match(read("tests/qa_fix_agent_test.py"), /test_reports_http_status_without_echoing_response_body/);
  assert.match(read("tests/qa_fix_agent_test.py"), /test_rejects_nonexistent_tracked_files/);
  assert.match(read("tests/qa_fix_agent_test.py"), /test_rejects_tracked_but_missing_working_tree_file/);
  assert.match(read("tests/qa_fix_agent_test.py"), /test_requires_existing_regular_working_tree_file/);
  assert.match(fixAgent, /def redirect_request/);
  assert.match(fixAgent, /HTTPError as exc/);
  assert.ok(patchValidator.includes('"src/ui.js"'));
  assert.match(patchValidator, /untracked or new file/);
  for (const file of [
    "index.html", "src/api.js", "src/storage.js", "src/public-assets.js", "src/ui.js",
    "src/escape-html.js", "src/background-upload-guard.js", "src/alert-rules.js",
    "src/alert-preferences.js", "src/alert-notifications.js", "tests/alert-rules.test.js",
    ".github/scripts/validate-qa-fix-patch.py", ".github/scripts/qa-fix-agent.py",
    ".github/qa/agent/run_explorer.py", ".github/qa/agent/litellm_relay.py",
    ".github/qa/agent/dns_sinkhole.py", ".github/qa/agent/mock_proxy.py",
    ".github/qa/agent/run-sandbox.sh", ".github/workflows/ai-browser-qa.yml",
    ".github/workflows/ai-fix-pr.yml", "tests/ai-browser-qa-contract.test.js",
    "tests/qa_dns_sinkhole_test.py", "tests/qa_fix_agent_test.py",
    "tests/qa_fix_patch_validator_test.py", "tests/qa_litellm_relay_test.py",
  ]) {
    assert.ok(patchValidator.includes(JSON.stringify(file)), `${file} must remain protected`);
  }
  assert.match(alertTests, /threshold comparisons use explicit strict boundaries/);
  assert.match(alertTests, /missing, negative, and non-finite metrics/);
  assert.match(alertTests, /notifications are transition-only/);
  assert.match(alertTests, /cooldown suppresses a quick re-trigger/);
});

test("dedicated API-key smoke jobs never share an agent secret", () => {
  const workflow = read(".github/workflows/ai-browser-qa.yml");
  const explorer = workflow.slice(workflow.indexOf("  test-explorer-key:"), workflow.indexOf("  test-fixer-key:"));
  const fixer = workflow.slice(workflow.indexOf("  test-fixer-key:"), workflow.indexOf("  regression:"));
  assert.match(explorer, /QA_EXPLORER_LITELLM_API_KEY/);
  assert.doesNotMatch(explorer, /QA_FIXER_LITELLM_API_KEY/);
  assert.match(fixer, /QA_FIXER_LITELLM_API_KEY/);
  assert.doesNotMatch(fixer, /QA_EXPLORER_LITELLM_API_KEY/);
});

test("AI QA documentation lists independent agent keys and slash commands", () => {
  const docs = read("docs/ai-browser-qa.md");
  assert.match(docs, /QA_EXPLORER_LITELLM_API_KEY/);
  assert.match(docs, /QA_FIXER_LITELLM_API_KEY/);
  assert.match(docs, /`\/qa issue 140`/);
  assert.match(docs, /`\/qa fix`/);
  assert.match(docs, /test-explorer-key/);
  assert.match(docs, /test-fixer-key/);
  assert.match(docs, /no-egress Docker sandbox/);
  assert.match(docs, /fixed LiteLLM relay/);
  assert.match(docs, /exact URL patterns/);
  assert.match(docs, /Both generation-time validation and the independent PR-job validator/);
});


test("every browser entrypoint module and its local imports are in the static server allowlist", () => {
  const html = read("index.html");
  const allowlistSource = read("src/public-assets.js");
  const allowed = new Set([...allowlistSource.matchAll(/"((?:src|vendor)\/[^"]+\.js)"/g)].map(match => match[1]));
  const pending = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map(match => match[1]);
  const visited = new Set();

  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    assert.ok(allowed.has(file), `${file} must be included in PUBLIC_ASSET_PATHS`);
    const source = read(file);
    for (const match of source.matchAll(/\b(?:from|import)\s*(?:\(\s*)?["'](\.\/[^"']+\.js)["']/g)) {
      pending.push(path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1].slice(2))));
    }
  }
});
