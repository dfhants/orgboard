# Refactor Plan: Desktop App via Tauri v2

## Decision Summary

| Decision | Rationale |
|----------|-----------|
| **No Express middleware** | Tauri's Rust backend handles everything a Node.js server would |
| **Tauri v2 over Electron** | ~10MB vs ~150MB bundle; capability-based security; native SQLite |
| **Vite** | Required by Tauri; replaces python3 http.server and lightningcss CLI |
| **sql.js WASM → native SQLite** | Real file-based DB, better performance, no IndexedDB hack |
| **Preact + Signals (optional)** | Replaces innerHTML-rebuild pattern with reactive components |

## Scope

**Included:** Desktop packaging (macOS, Windows, Linux), native SQLite persistence, file dialogs for import/export, auto-updater capability.

**Excluded:** Multi-user/collaboration, cloud sync, mobile support, user authentication.

---

## Status

- [x] **Phase 1** — Add Vite (done)
- [x] **Phase 2** — Modularize app.js (done)
- [ ] **Phase 3** — Add Tauri v2 (desktop packaging)
- [ ] Phase 4 — UI Framework (optional)

### Previously Extracted Modules

| Module | LOC | Responsibility |
|--------|-----|----------------|
| `state.mjs` | ~200 | Centralized state: `state`, `dragState`, `scenarios`, sequence counters, getters/setters |
| `utils.mjs` | ~250 | Colors, timezone math, `escapeHtml()`, hashing, `initializeSequence()` |
| `team-logic.mjs` | ~200 | Hierarchy ops: `isTeamInside()`, `buildHierarchyTree()`, `computeTeamStats()`, `cleanupManagerOverrides()` |
| `checks.mjs` | ~200 | Validation engine: 11 check types, `evaluateAllChecks()`, `describeCriterion()` |
| `db.mjs` | ~300 | SQLite persistence via sql.js WASM + IndexedDB: scenarios, metadata, criteria |
| `packing.mjs` | ~50 | Pure function `computeColumns()` for horizontal column packing |

---

## Phase 1: Add Vite ✅

**Done.** Vite 8 with lightningcss integration. CDN scripts replaced with npm packages (lucide, sql.js). Dev server, build, and preview scripts configured. All tests passing.

---

## Phase 2: Modularize app.js

Break the ~3,000-line `app.js` monolith into focused ES modules. Pure refactor — no behavioral changes.

### Step 2: Extract `src/operations.mjs` (~220 LOC)

Move all move/copy/delete functions:
- `removeEmployeeFromCurrentLocation`, `removeTeamFromCurrentLocation`
- `insertMember`, `moveEmployeeToTeam`, `moveEmployeeToRoster`, `moveTeamToTarget`
- `deepCopyEmployee`, `deepCopyTeam`, `copyEmployeeToTeam`, `copyEmployeeToRoster`, `copyTeamToTarget`
- `deleteEmployee`, `deleteTeam`

**Imports:** `state.mjs`, `team-logic.mjs`

### Step 3: Extract `src/csv-import.mjs` (~210 LOC)

Move CSV parsing and import logic:
- `parseCSV`, `autoMapColumns`, `loadCsvData`
- `openCsvImportModal` — convert closure state to parameters

**Imports:** `state.mjs`, `utils.mjs`, `render.mjs` (for re-render after import)

### Step 4: Extract `src/scenarios.mjs` (~100 LOC)

Move scenario lifecycle:
- `generateScenarioId`, `nextScenarioName`
- `debouncedSave`, `switchToScenario`, `createNewScenario`
- `closeScenario`, `renameScenario`
- `handleExportDB`, `loadDemoData`, `loadBlankBoard`

**Imports:** `state.mjs`, `db.mjs`, `utils.mjs`

### Step 5: Extract `src/drag-drop.mjs` (~300 LOC)

Move all drag event handlers:
- `dragstart`, `dragover`, `dragleave`, `drop`, `dragend` handlers
- `resolveDropzone()`, `getMemberInsertionIndex()`
- Drag preview functions: `createDropPreview`, `updateDropPreview`, `removeDropPreview`
- `setCustomDragImage`, `removeDragImageProxy`
- Copy-mode key listeners (`C` key)

**Imports:** `state.mjs`, `operations.mjs`, `render.mjs`

### Step 6: Extract `src/render.mjs` (~800 LOC)

Move all template/rendering functions:
- `render()`, `renderTabs()`
- `renderTeam()`, `renderEmployeeCard()`, `renderFacepile()`, `renderCollapsedManager()`
- `renderChildLayoutButton()`, `renderRootLayoutButton()`
- `applyMemberSlotPacking()`
- `renderNotesPanel()`, `renderStatsPanel()`, `renderTeamStatsBlock()`
- `renderLandingPage()`
- Modal renderers: `renderAddPersonModal`, `renderEditPersonModal`, `renderManagerOverrideModal`, `renderHierarchyModal`

**Imports:** `state.mjs`, `scenarios.mjs`, `team-logic.mjs`, `utils.mjs`, `packing.mjs`

> Note: `render.mjs` imports `computeColumns` from `packing.mjs` for `applyHorizontalPacking()`.

### Step 7: Extract `src/events.mjs` (~300 LOC)

Move event delegation (do last — depends on all above):
- Main `click` event listener (action routing)
- `keydown`/`keyup` listeners
- Modal submit handlers
- Team name inline editing

**Imports:** `state.mjs`, `operations.mjs`, `csv-import.mjs`, `scenarios.mjs`, `drag-drop.mjs`, `render.mjs`

### Step 8: Slim `src/app.js` to ~50 LOC orchestrator

After all extractions, `app.js` becomes the entry point:
- Import all modules
- Run async init (DB load, scenario restore, first render)
- Wire up top-level event listeners

### Phase 2 Verification
- All existing Playwright UI tests pass (no behavioral change)
- All existing unit tests pass
- No new runtime dependencies
- `app.js` is <100 lines
- Each new module has clear imports/exports (no circular deps)

---

## Phase 3: Add Tauri v2 (Desktop Packaging)

Package as a native desktop app with real SQLite persistence.

### Why Tauri v2 Over Electron?

- **Bundle size**: ~5-15MB vs Electron's ~100-200MB (uses system WebView instead of bundling Chromium)
- **Security**: Capability-based permission system — perfect for sensitive HR data
- **Native SQLite**: via `tauri-plugin-sql` — replaces the WASM SQLite + IndexedDB hack
- **Auto-updater**: Built-in for distributing updates
- **Cross-platform**: macOS (.dmg), Windows (.msi/.exe), Linux (.deb/.AppImage)

### Steps

1. `npm install -D @tauri-apps/cli@latest` + `npx tauri init`
2. Configure `tauri.conf.json`: app name "OrgBoard", window title, icon, permissions
3. Add `tauri-plugin-sql` for native SQLite — replaces sql.js WASM + IndexedDB entirely
4. Rewrite `src/db.mjs` internals to use Tauri SQL plugin API (same exported interface):
   - `initDB()` → opens SQLite file at `$APPDATA/orgboard.db`
   - `saveScenario()` → native SQL INSERT/UPDATE
   - `exportDB()` → Tauri file dialog + fs write
   - Remove all IndexedDB code, remove sql.js dependency
5. Add `tauri-plugin-dialog` for native file picker (CSV import, DB export)
6. Add `tauri-plugin-fs` if needed for file operations
7. Configure app icons (already have `assets/icons/`)
8. Build and test: `npx tauri dev` (dev), `npx tauri build` (production .dmg/.msi)
9. Feature-detect Tauri (`window.__TAURI__`) to maintain web fallback for Playwright tests

**Files to create:**
- `src-tauri/` directory (Rust backend, config, icons)
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `src-tauri/src/main.rs` (minimal — just plugin registration)

**Files to modify:**
- `package.json` — add Tauri CLI and plugins
- `src/db.mjs` — rewrite internals for Tauri SQL plugin (same exported API)
- `src/app.js` — CSV import to use Tauri file dialog when available

### Phase 3 Verification
- `npx tauri dev` launches desktop window
- All CRUD operations work
- DB persists across app restarts (file at `$APPDATA/orgboard.db`)
- CSV import/export works via native file dialogs
- Playwright UI tests still pass in web mode (feature-detect fallback)

---

## Phase 4: UI Framework (Optional)

Replace the innerHTML-rebuild-everything pattern with reactive components. Not required for desktop packaging — this is a DX improvement.

### Recommendation: Preact + Signals

- 3KB bundle, React-compatible API
- JSX is a mechanical transformation from existing template literals
- Signals replace manual `render()` calls with automatic reactivity
- Can be adopted incrementally (one component at a time)

### Alternative: Svelte 5

If you prefer compiled reactivity and scoped CSS.

### Steps (if pursued)

1. Add `preact`, `@preact/signals`, `@preact/preset-vite` to Vite config
2. Convert rendering functions to Preact components bottom-up:
   - Start with leaf components: EmployeeCard, FacepileDot
   - Then containers: TeamPanel, StatsPanel, ChecksPanel
   - Then layout: App shell, modal system
3. Replace `state` + manual `render()` with Preact signals
4. Remove innerHTML rendering, event delegation (components handle own events)
5. Update tests to work with component-based rendering

### Note on Phase 2 overlap

If adopting Preact, you can skip extracting `render.mjs` and `events.mjs` (Phase 2 steps 6-7) since those will be replaced by components. The operations/CSV/scenarios/drag-drop extractions (steps 2-5) are still valuable regardless.

### Phase 4 Verification
- All Playwright UI tests pass against component-rendered UI
- No visual regressions
| **better-sqlite3** on server | Native perf, sync API, no WASM overhead |
| **Client keeps IndexedDB** | Server is sync target, not replacement |
| **No auth** | Single-user local server assumed; add later if deployed for teams |

## Notes

- **Phase 1 may be sufficient.** If the main pain is "app.js is too big", the 7-module split solves it without server infrastructure. Phases 2-3 add operational complexity (server process, sync bugs, deployment). Re-evaluate after Phase 1.
- **Database migration**: Phase 2 should include a one-time migration path — on first server connect, push all local IndexedDB scenarios to the server.
