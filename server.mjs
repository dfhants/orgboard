#!/usr/bin/env node
/**
 * Minimal static file server for OrgBoard.
 * Serves the Vite build output (dist/) on a random available port
 * and opens the user's default browser.
 *
 * Usage:  node server.mjs
 * Or:     npm start        (after `npm run build`)
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, resolve } from "node:path";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DIST = resolve(__dirname, "dist");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".map": "application/json",
};

/** Resolve a URL path to a safe file path inside dist/. */
function safePath(urlPath) {
  // Decode and strip query/hash
  const decoded = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  // Resolve and ensure it stays inside DIST (prevent directory traversal)
  const full = resolve(DIST, "." + decoded);
  if (!full.startsWith(DIST)) return null;
  return full;
}

async function serve(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end();
    return;
  }

  let filePath = safePath(req.url || "/");
  if (!filePath) {
    res.writeHead(400);
    res.end();
    return;
  }

  // If path is a directory, try index.html
  try {
    const s = await stat(filePath);
    if (s.isDirectory()) filePath = join(filePath, "index.html");
  } catch {
    // file doesn't exist — fall through to SPA fallback below
  }

  try {
    const data = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(data);
  } catch {
    // SPA fallback: serve index.html for any unmatched route
    try {
      const index = await readFile(join(DIST, "index.html"));
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(index);
    } catch {
      res.writeHead(404);
      res.end("Not found — did you run `npm run build` first?");
    }
  }
}

/** Open a URL in the user's default browser (cross-platform). */
function openBrowser(url) {
  const cmd =
    process.platform === "darwin" ? `open "${url}"` :
    process.platform === "win32" ? `start "" "${url}"` :
    `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) console.error("Could not open browser:", err.message);
  });
}

// Start on port 0 → OS assigns a random available port
const server = createServer(serve);
server.listen(0, "127.0.0.1", () => {
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}`;
  console.log(`OrgBoard running at ${url}`);
  console.log("Press Ctrl+C to stop.\n");
  openBrowser(url);
});
