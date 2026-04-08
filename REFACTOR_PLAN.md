# Refactor Plan: Decompose Monolith & Add Node.js Middleware

## Status

- [x] **Step 1** — Extract `src/state.mjs` (done)
- [x] **Step 1a** — Extract `src/utils.mjs` (done — not in original plan)
- [x] **Step 1b** — Extract `src/team-logic.mjs` (done — not in original plan)
- [x] **Step 1c** — Extract `src/checks.mjs` (done — not in original plan)
- [x] **Step 1d** — Extract `src/db.mjs` (done — not in original plan)
- [ ] Step 2 — Extract `src/operations.mjs`
- [ ] Step 3 — Extract `src/csv-import.mjs`
- [ ] Step 4 — Extract `src/scenarios.mjs`
- [ ] Step 5 — Extract `src/drag-drop.mjs`
- [ ] Step 6 — Extract `src/render.mjs`
- [ ] Step 7 — Extract `src/events.mjs`
- [ ] Step 8 — Slim `src/app.js` to orchestrator
- [ ] Step 9 — Scaffold `server/` (Express + better-sqlite3)
- [ ] Step 10 — API routes
- [ ] Step 11 — Shared pure modules (`shared/csv.mjs`)
- [ ] Step 12 — Update `package.json` & config
- [ ] Step 13 — Add `updatedAt` timestamps
- [ ] Step 14 — Create `src/sync.mjs`
- [ ] Step 15 — Update `src/scenarios.mjs` for sync
- [ ] Step 16 — Sync status UI

---

## Phase 1: Client-Side Modularization

Break `app.js` into focused ES modules. No server changes — pure refactor with existing tests as safety net.

### Already Extracted

The following modules have been extracted from `app.js` and are complete:

| Module | LOC | Responsibility |
|--------|-----|----------------|
| `state.mjs` | ~200 | Centralized state: `state`, `dragState`, `scenarios`, sequence counters, getters/setters |
| `utils.mjs` | ~250 | Colors, timezone math, `escapeHtml()`, hashing, `initializeSequence()` |
| `team-logic.mjs` | ~200 | Hierarchy ops: `isTeamInside()`, `buildHierarchyTree()`, `computeTeamStats()`, `cleanupManagerOverrides()` |
| `checks.mjs` | ~200 | Validation engine: 11 check types, `evaluateAllChecks()`, `describeCriterion()` |
| `db.mjs` | ~300 | SQLite persistence via sql.js WASM + IndexedDB: scenarios, metadata, criteria |
| `packing.mjs` | ~120 | Pure function `calculateSlotSize()` for layout packing |

### Remaining Extractions

### Step 2: Extract `src/operations.mjs` (~220 LOC)

Move all move/copy/delete functions:
- `removeEmployeeFromCurrentLocation`, `removeTeamFromCurrentLocation`
- `insertMember`, `moveEmployeeToTeam`, `moveEmployeeToRoster`, `moveTeamToTarget`
- `deepCopyEmployee`, `deepCopyTeam`, `copyEmployeeToTeam`, `copyEmployeeToRoster`, `copyTeamToTarget`
- `deleteEmployee`, `deleteTeam`

**Imports:** `state.mjs`, `team-logic.mjs`
**Exports:** all operation functions

### Step 3: Extract `src/csv-import.mjs` (~210 LOC)

Move CSV parsing and import logic:
- `parseCSV`, `autoMapColumns`, `loadCsvData`
- `openCsvImportModal` — convert closure state to parameters

**Imports:** `state.mjs`, `utils.mjs`, `render.mjs` (for re-render after import)
**Exports:** `openCsvImportModal`, `parseCSV`, `autoMapColumns`, `loadCsvData`

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

### Phase 1 Verification
- All existing Playwright UI tests pass (no behavioral change)
- All existing unit tests pass
- No new runtime dependencies
- Each new module has clear imports/exports (no circular deps)

---

## Phase 2: Node.js Middleware (Express)

Add a thin API server that owns the canonical SQLite database.

### Step 9: Scaffold `server/`

```
server/
  index.mjs      — Express app, serves static files + API routes
  db.mjs         — Server-side SQLite via better-sqlite3 (native, not WASM)
  routes/
    scenarios.mjs — CRUD routes for scenarios
```

Dependencies: `express`, `better-sqlite3`, `cors`

### Step 10: API Routes

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/scenarios` | List all scenarios (id, name, updatedAt) |
| `GET` | `/api/scenarios/:id` | Get scenario state JSON |
| `PUT` | `/api/scenarios/:id` | Upsert scenario (name + state) |
| `DELETE` | `/api/scenarios/:id` | Delete scenario |
| `GET` | `/api/meta/:key` | Get metadata value |
| `PUT` | `/api/meta/:key` | Set metadata value |
| `POST` | `/api/export` | Download full DB binary |
| `POST` | `/api/import-csv` | Server-side CSV parsing |

Input validation on all routes. Sanitize scenario names, validate JSON state shape.

### Step 11: Shared pure modules

Move `parseCSV`, `autoMapColumns` from `src/csv-import.mjs` to `shared/csv.mjs`. These are pure functions — work in both Node.js and browser. Both client and server import from `shared/`.

### Step 12: Update config

- `package.json`: add `scripts.start` → `node server/index.mjs`, add `express` + `better-sqlite3` deps
- `playwright.config.ts`: update `webServer.command` from `python3` to `node server/index.mjs`
- Server also serves static files (replaces `python3 -m http.server`)

### Phase 2 Verification
- API endpoints return correct responses (test via Playwright or curl)
- Server starts, serves static files, API returns data
- Existing client still works with IndexedDB (server is additive, not replacing)

---

## Phase 3: Offline-First Sync

Bridge client IndexedDB and server SQLite with conflict-free sync.

### Step 13: Add `updatedAt` timestamps

Each scenario gets an `updatedAt` (ISO timestamp) set on every save, on both client and server.

### Step 14: Create `src/sync.mjs` (~150 LOC)

- `syncToServer()` — push local changes to server
- `syncFromServer()` — pull remote changes
- `fullSync()` — bidirectional: push then pull
- Compare local vs server `updatedAt` per scenario
- **Last-write-wins** merge strategy
- Retry logic with exponential backoff
- Triggers: app start, after each save (debounced), `navigator.onLine` event, periodic (every 60s)

### Step 15: Update `src/scenarios.mjs` for sync

- After `debouncedSave()` writes to IndexedDB, queue a sync
- On scenario load, check if server has newer version
- Show sync status indicator in UI

### Step 16: Sync status UI

Small indicator near tabs:
- Green dot = synced
- Spinning = syncing
- Gray = offline
- Toast on conflict with option to pick local or server version

### Phase 3 Verification
- Two browser tabs: change in tab A → appears in tab B after sync
- Kill server → make changes → restart → changes sync up
- Simultaneous edits → last-write-wins resolves without data loss
- `navigator.onLine` toggling triggers sync correctly

---

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| **Phase 1 first** | Modularize client before adding server complexity |
| **Last-write-wins** sync | Appropriate for single-user multi-device; revisit for multi-user |
| **Express** over Fastify | Simpler setup, sufficient for this scale |
| **better-sqlite3** on server | Native perf, sync API, no WASM overhead |
| **Client keeps IndexedDB** | Server is sync target, not replacement |
| **No auth** | Single-user local server assumed; add later if deployed for teams |

## Notes

- **Phase 1 may be sufficient.** If the main pain is "app.js is too big", the 7-module split solves it without server infrastructure. Phases 2-3 add operational complexity (server process, sync bugs, deployment). Re-evaluate after Phase 1.
- **Database migration**: Phase 2 should include a one-time migration path — on first server connect, push all local IndexedDB scenarios to the server.
