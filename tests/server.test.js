import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer as createTcpServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function getUnusedPort() {
  const listener = createTcpServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  return port;
}

test("static server restricts public assets and serves a startup snapshot", { timeout: 15000 }, async t => {
  const workspace = await mkdtemp(join(tmpdir(), "xmrig-proxy-dashboard-test-"));
  const packageRoot = join(workspace, "package");
  const outsideFile = join(workspace, "outside-secret.js");
  await mkdir(join(packageRoot, "bin"), { recursive: true });
  await mkdir(join(packageRoot, "src"), { recursive: true });
  await copyFile(join(root, "bin/server.js"), join(packageRoot, "bin/server.js"));
  await copyFile(join(root, "src/public-assets.js"), join(packageRoot, "src/public-assets.js"));

  const fixtureFiles = {
    "index.html": "<!doctype html><title>XMRig Proxy Dashboard</title>",
    "styles.css": "body { color: black; }",
    "panel.png": "fake-png",
    "src/api.js": "export const api = true;",
    "src/main.js": "trusted-startup-module",
    "src/status.js": "export const status = true;",
    "src/storage.js": "export const storage = true;",
    "src/theme-color.js": "trusted-theme-color-module",
    "src/ui.js": "export const ui = true;",
    "package.json": "{ \"private\": true, \"type\": \"module\" }",
    "README.md": "private readme",
    ".git/config": "[remote \"origin\"]",
  };

  for (const [relativePath, content] of Object.entries(fixtureFiles)) {
    const target = join(packageRoot, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  await writeFile(outsideFile, "outside-secret-content");

  t.after(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  const port = await getUnusedPort();
  const child = spawn(process.execPath, [join(packageRoot, "bin/server.js")], {
    cwd: packageRoot,
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port) },
    stdio: "ignore",
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise(resolve => {
        child.once("exit", resolve);
        child.kill("SIGTERM");
      });
    }
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  let homepage;
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Static server exited early with code ${child.exitCode}`);
    try {
      homepage = await fetch(baseUrl);
      break;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  assert.ok(homepage, `Static server did not start: ${lastError}`);
  assert.equal(homepage.status, 200);
  assert.match(await homepage.text(), /XMRig Proxy Dashboard/);

  const moduleResponse = await fetch(`${baseUrl}/src/main.js`);
  assert.equal(moduleResponse.status, 200);
  assert.match(moduleResponse.headers.get("content-type"), /javascript/);
  assert.equal(await moduleResponse.text(), "trusted-startup-module");

  const themeColorResponse = await fetch(`${baseUrl}/src/theme-color.js`);
  assert.equal(themeColorResponse.status, 200);
  assert.match(themeColorResponse.headers.get("content-type"), /javascript/);
  assert.equal(await themeColorResponse.text(), "trusted-theme-color-module");

  // Replacing an allowed path with an external symlink after startup must not
  // change what the server serves: requests only read the validated memory map.
  const mainPath = join(packageRoot, "src/main.js");
  await rename(mainPath, `${mainPath}.original`);
  await symlink(outsideFile, mainPath);
  const cachedModule = await fetch(`${baseUrl}/src/main.js`);
  assert.equal(cachedModule.status, 200);
  assert.equal(await cachedModule.text(), "trusted-startup-module");

  for (const path of [
    "/package.json",
    "/README.md",
    "/.git/config",
    "/src/../package.json",
    "/%2e%2e%2fpackage.json",
  ]) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 404, `${path} must not be served`);
    await response.arrayBuffer();
  }

  const postResponse = await fetch(baseUrl, { method: "POST" });
  assert.equal(postResponse.status, 405);
  assert.equal(postResponse.headers.get("allow"), "GET, HEAD");
});
