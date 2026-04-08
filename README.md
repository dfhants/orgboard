# TeamBoard

A drag-and-drop team organizer built with vanilla JavaScript — no frameworks, no JS build step. CSS is authored as modular files and bundled by [lightningcss](https://lightningcss.dev/).

![TeamBoard](https://img.shields.io/badge/vanilla-JS-f7df1e) ![Playwright](https://img.shields.io/badge/tests-Playwright-45ba63)

## Features

- **Drag-and-drop** people and teams between slots using native HTML5 drag events
- **Nested teams** — teams can contain other teams, with circular nesting prevention
- **Collapse/expand** teams into compact facepile views
- **Manager slots** — assign a team manager by dropping a person into the manager slot
- **Manager overrides** — set per-person alternative managers with colored pills
- **Copy mode** — hold `C` while dragging to duplicate instead of move
- **Inline rename** — click a team name to edit it
- **Unassigned bar** — collapsible drawer for unassigned employees
- **Layout modes** — toggle between horizontal and vertical arrangements per team or globally
- **Smart drop targeting** — drags anywhere over a team resolve to the nearest valid slot
- **Scenarios/tabs** — multiple independent org charts stored as scenarios with a tab bar UI
- **Persistence** — SQLite (sql.js WASM) stored in IndexedDB with debounced auto-save
- **Validation checks** — pluggable criteria system with 11 check types (team size, timezone gaps, manager rules, etc.)
- **Hierarchy view** — org chart tree modal with manager override accounting
- **Stats panel** — sidebar showing role & timezone distribution stats
- **Notes panel** — per-scenario notes, editable in a sidebar panel
- **CSV import** — import employees from CSV with auto-mapped columns
- **Landing page** — first-run experience with demo data, blank board, or CSV import

## Getting Started

### Prerequisites

- Python 3 (for the static file server)
- Node.js 18+ (for running tests and CSS build)

### Install Dependencies

```sh
npm install
```

### Run the App

```sh
# Development (CSS watcher + HTTP server)
npm run dev

# Or manually:
npm run watch:css          # terminal 1 — rebuild CSS on change
python3 -m http.server 4173  # terminal 2 — serve static files
```

Then open [http://localhost:4173](http://localhost:4173).

To do a one-off CSS build: `npm run build:css`.

### Run Tests

```sh
# Unit tests (Node.js built-in test runner)
npm test

# UI tests (Playwright — headless)
npx playwright test

# UI tests (visible browser)
npx playwright test --headed
```

Playwright auto-starts the server if it isn't already running.

## Project Structure

```
index.html              Entry point (loads src/app.js as ES module)
src/
  app.js                Orchestrator — rendering, events, drag-drop, modals, CSV import
  state.mjs             Centralized state management with mutable exports and setters
  checks.mjs            Pluggable validation engine (11 check types)
  db.mjs                SQLite persistence via sql.js (WASM) + IndexedDB
  packing.mjs           Pure function for computing member-slot dimensions
  team-logic.mjs        Team hierarchy operations, nesting, stats
  utils.mjs             Colors, timezone math, HTML escaping, hashing
  styles.css            Compiled CSS output (do not edit directly)
  css/
    main.css            CSS entry point — @imports 15 modular stylesheets
    tokens.css          Design tokens & resets
    layout.css          Grid, toolbar, tabs, action bar
    drag-drop.css       Drop zones & drag previews
    person-card.css     Person cards
    team-panel.css      Team containers, titlebar, slots
    modals.css          Overlays, panels, inputs
    ...                 + landing, csv-import, notes-panel, stats-panel, etc.
tests/
  packing.test.mjs      Unit tests for packing logic
  checks.test.mjs       Unit tests for validation engine
  team-logic.test.mjs   Unit tests for hierarchy operations
  utils.test.mjs        Unit tests for utilities
  property.test.mjs     Property-based tests (fast-check)
  data/
    *.csv               7 CSV fixtures for import testing
  ui/
    fixtures.ts         Shared test fixture (DB reset, landing dismissal)
    helpers.ts          Drag-and-drop test helpers
    *.spec.ts           Playwright UI tests (21 spec files)
playwright.config.ts    Playwright config — Chromium only, baseURL localhost:4173
```

## Architecture

- **No framework** — vanilla JS with ES modules
- **No JS build step** — served as static files
- **CSS build** — modular CSS in `src/css/` bundled by [lightningcss](https://lightningcss.dev/) into `src/styles.css`
- **No external runtime dependencies** — only Lucide icons, Google Fonts, and sql.js loaded from CDN
- **State** is a module-scoped object in `src/state.mjs`; the app re-renders by replacing `innerHTML` and calling `lucide.createIcons()`
- **HTML** is built with template literals; user input is escaped via `escapeHtml()`
- **Persistence** — sql.js (WASM) SQLite database stored in IndexedDB with debounced 300ms flush

## License

ISC
