/**
 * Public static assets exposed by the package's built-in HTTP server.
 *
 * Keep this list explicit: adding a source file to the package must not make it
 * web-accessible by default. Tests import this manifest so the server and its
 * allowlist validation exercise the same data.
 */
export const PUBLIC_ASSET_PATHS = Object.freeze([
  "index.html",
  "styles.css",
  "panel.png",
  "src/api.js",
  "src/main.js",
  "src/status.js",
  "src/storage.js",
  "src/theme-color.js",
  "src/keyboard-shortcuts.js",
  "src/manual-refresh.js",
  "src/visibility-refresh.js",
  "src/visible-polling.js",
  "src/escape-html.js",
  "src/load-average.js",
  "src/background-upload-guard.js",
  "src/snapshot-export.js",
  "src/metrics-history.js",
  "src/ui.js",
]);

/**
 * Compare canonical filesystem paths to allowlist entries.
 *
 * On Windows, realpath() can preserve filesystem casing even when the path was
 * requested with a different case. Other platforms retain exact-case matching
 * so a different case-sensitive file cannot pass the allowlist check.
 */
export function matchesAllowlistedPath(canonicalRelativePath, assetPath, platform = process.platform) {
  if (platform === "win32") {
    return canonicalRelativePath.toLocaleLowerCase("en-US") ===
      assetPath.toLocaleLowerCase("en-US");
  }
  return canonicalRelativePath === assetPath;
}
