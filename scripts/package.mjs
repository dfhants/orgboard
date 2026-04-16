#!/usr/bin/env node
/**
 * Package OrgBoard for distribution.
 *
 * Creates `release/OrgBoard/` containing:
 *   - dist/          (Vite build output)
 *   - server.mjs     (static file server)
 *   - OrgBoard       (macOS/Linux launch script)
 *   - OrgBoard.bat   (Windows launch script)
 *   - README.txt     (user instructions)
 *
 * Users just need Node.js installed, then double-click the launch script.
 */

import { cpSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = join(ROOT, "release", "OrgBoard");

// Clean previous release
if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });

// Verify dist/ exists (vite build should have run via the `package` npm script)
const distDir = join(ROOT, "dist");
if (!existsSync(distDir)) {
  console.error("Error: dist/ not found. Run `npm run build` first.");
  process.exit(1);
}

// Copy dist/ and server.mjs
cpSync(distDir, join(OUT, "dist"), { recursive: true });
cpSync(join(ROOT, "server.mjs"), join(OUT, "server.mjs"));

// macOS / Linux launcher
writeFileSync(
  join(OUT, "OrgBoard"),
  `#!/bin/bash
cd "$(dirname "$0")"
node server.mjs
`,
  { mode: 0o755 }
);

// Windows launcher
writeFileSync(
  join(OUT, "OrgBoard.bat"),
  `@echo off\r\ncd /d "%~dp0"\r\nnode server.mjs\r\n`
);

// README
writeFileSync(
  join(OUT, "README.txt"),
  `OrgBoard
========

Requirements: Node.js 20+ (https://nodejs.org)

How to run:
  macOS/Linux:  Double-click "OrgBoard" (or run ./OrgBoard in Terminal)
  Windows:      Double-click "OrgBoard.bat"

Your default browser will open automatically.
Press Ctrl+C in the terminal window to stop the server.
`
);

console.log(`\nPackaged to: release/OrgBoard/`);
console.log("Contents:");
const files = execSync(`find "${OUT}" -type f -not -path '*/dist/assets/*'`).toString().trim();
for (const f of files.split("\n")) {
  console.log("  " + f.replace(OUT + "/", ""));
}
const assetCount = execSync(`find "${join(OUT, "dist", "assets")}" -type f | wc -l`).toString().trim();
console.log(`  dist/assets/ (${assetCount} files)`);
console.log(`\nTo distribute: zip the release/OrgBoard/ folder and share it.`);
