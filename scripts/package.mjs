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

A drag-and-drop team organizer that runs locally in your browser.
All data stays on your machine — nothing is sent to the internet.


REQUIREMENTS
------------
Node.js 20 or later — download free from https://nodejs.org
(Choose the LTS version. No other software is needed.)


HOW TO RUN
----------
1. Unzip this folder anywhere on your computer.

2. Launch OrgBoard:
     macOS / Linux:  Double-click "OrgBoard", or open a terminal and run:
                       ./OrgBoard
     Windows:        Double-click "OrgBoard.bat"

3. Your default browser will open automatically.
   If it doesn't, open http://localhost:<port> shown in the terminal.

4. To stop the server, close the terminal window or press Ctrl+C.


GETTING STARTED
---------------
On first launch you'll see the landing page with three options:
  - Load demo data  — pre-built example org chart to explore
  - Start blank     — empty board, add people and teams manually
  - Import CSV      — load employees from a spreadsheet export

You can create multiple scenarios (tabs) to compare different org structures.


DATA STORAGE
------------
Your data is saved automatically in the browser's local storage (IndexedDB).
It persists between sessions as long as you use the same browser.
Use File > Export to save a backup you can re-import later.


TROUBLESHOOTING
---------------
"node: command not found"
  → Node.js is not installed, or not on your PATH.
    Download it from https://nodejs.org and restart your terminal.

"Not found — did you run npm run build first?"
  → The dist/ folder is missing or corrupted. Re-download OrgBoard.

The browser didn't open automatically
  → Open your browser manually and go to the URL shown in the terminal.
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
