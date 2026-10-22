#!/usr/bin/env node
import { constants as fsConstants } from "node:fs";
import { createServer } from "node:http";
import { open, realpath } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_ASSET_PATHS, matchesAllowlistedPath } from "../src/public-assets.js";

const root = await realpath(resolve(fileURLToPath(new URL("..", import.meta.url))));
const port = Number(process.env.PORT || 8000);
const host = process.env.HOST || "127.0.0.1";

// Only explicitly allowlisted files are public. Cache validated bytes at
// startup so requests never follow a path that can later be swapped for a symlink.
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

function isWithinRoot(candidate) {
  const pathFromRoot = relative(root, candidate);
  return Boolean(pathFromRoot) &&
    pathFromRoot !== ".." &&
    !pathFromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromRoot);
}

async function loadPublicAssets() {
  const assets = new Map();

  for (const assetPath of PUBLIC_ASSET_PATHS) {
    const filePath = resolve(root, assetPath);
    const realFilePath = await realpath(filePath);
    const canonicalRelativePath = relative(root, realFilePath).split(sep).join("/");

    // Reject symlinks and any canonical path that differs from the allowlist.
    if (!isWithinRoot(realFilePath) || !matchesAllowlistedPath(canonicalRelativePath, assetPath)) {
      throw new Error(`Refusing unsafe static asset path: ${assetPath}`);
    }

    // O_NOFOLLOW protects the final path component where supported. Serving
    // the resulting bytes from memory removes the request-time TOCTOU window.
    const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
    const file = await open(realFilePath, flags);
    try {
      const stat = await file.stat();
      if (!stat.isFile()) {
        throw new Error(`Static asset is not a regular file: ${assetPath}`);
      }
      assets.set(`/${assetPath}`, {
        data: await file.readFile(),
        contentType: mime[extname(assetPath).toLowerCase()] || "application/octet-stream",
      });
    } finally {
      await file.close();
    }
  }

  return assets;
}

const publicAssets = await loadPublicAssets();

function findPublicAsset(pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (decodedPath.includes("\\") || decodedPath.includes("\0")) return null;
  const publicPath = decodedPath === "/" ? "/index.html" : decodedPath;
  return publicAssets.get(publicPath) || null;
}

const server = createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, {
      "Allow": "GET, HEAD",
      "Content-Type": "text/plain; charset=utf-8"
    });
    res.end("Method Not Allowed");
    return;
  }

  const requestPath = new URL(req.url || "/", "http://localhost").pathname;
  const asset = findPublicAsset(requestPath);
  if (!asset) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
    return;
  }

  res.writeHead(200, {
    "Content-Type": asset.contentType,
    "Content-Length": String(asset.data.byteLength),
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": "frame-ancestors 'none'; default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src http: https:; base-uri 'self'; form-action 'self'"
  });
  res.end(req.method === "HEAD" ? undefined : asset.data);
});

server.listen(port, host, () => {
  console.log(`XMRig Proxy Dashboard: http://${host}:${port}`);
});
