# OrgBoard

A drag-and-drop team organizer built with vanilla JavaScript — no frameworks. Bundled and served by [Vite](https://vite.dev/) with [lightningcss](https://lightningcss.dev/) for CSS processing.

![OrgBoard](https://img.shields.io/badge/vanilla-JS-f7df1e) ![Playwright](https://img.shields.io/badge/tests-Playwright-45ba63)

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

- Node.js 18+

### Install Dependencies

```sh
npm install
```

### Run the App

```sh
# Development (Vite dev server with HMR)
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

Then open [http://localhost:4173](http://localhost:4173).

### Run Tests

```sh
# Unit tests (Node.js built-in test runner)
npm test

# UI tests (Playwright — headless)
npm run test:ui

# UI tests (visible browser)
npx playwright test --headed
```

Playwright auto-starts the Vite dev server if it isn't already running.

## Project Structure

```
index.html              Entry point (loads src/app.js as ES module)
src/
  app.js                Orchestrator — bootstraps app, wires modules together
  state.mjs             Centralized state with mutable exports and setters
  render.mjs            Templates & rendering (teams, cards, modals, panels)
  events.mjs            Event delegation and UI event handlers
  drag-drop.mjs         HTML5 drag event handlers, drop preview, copy-mode
  operations.mjs        Move/copy/delete operations on employees and teams
  scenarios.mjs         Scenario lifecycle (create, switch, rename, close, export)
  csv-import.mjs        CSV parsing and import logic
  checks.mjs            Pluggable validation engine (11 check types)
  db.mjs                SQLite persistence via sql.js (WASM) + IndexedDB
  packing.mjs           Pure function for horizontal column packing
  team-logic.mjs        Team hierarchy operations, nesting, stats
  utils.mjs             Colors, timezone math, HTML escaping, hashing
  css/
    main.css            CSS entry point — @imports modular stylesheets
    tokens.css          Design tokens & resets
    layout.css          Grid, toolbar, tabs, action bar
    drag-drop.css       Drop zones & drag previews
    person-card.css     Person cards
    team-panel.css      Team containers, titlebar, slots
    modals.css          Overlays, panels, inputs
    ...                 + landing, csv-import, notes-panel, stats-panel, etc.
tests/
  packing.test.mjs      Unit tests for column packing
  checks.test.mjs       Unit tests for validation engine
  team-logic.test.mjs   Unit tests for hierarchy operations
  utils.test.mjs        Unit tests for utilities
  property.test.mjs     Property-based tests (fast-check)
  data/
    *.csv               CSV fixtures for import testing
  ui/
    fixtures.ts         Shared test fixture (DB reset, landing dismissal)
    helpers.ts          Drag-and-drop test helpers
    *.spec.ts           Playwright UI tests
playwright.config.ts    Playwright config — Chromium only, baseURL localhost:4173
vite.config.js          Vite config — dev server, lightningcss, esnext build target
```

## Architecture

- **No framework** — vanilla JS with ES modules
- **Vite** — dev server with HMR, production bundling, CSS processing via lightningcss
- **Runtime dependencies** — Lucide icons and sql.js installed via npm; Google Fonts loaded from CDN
- **State** is a module-scoped object in `src/state.mjs`; the app re-renders by replacing `innerHTML` and calling `createIcons()`
- **HTML** is built with template literals; user input is escaped via `escapeHtml()`
- **Persistence** — sql.js (WASM) SQLite database stored in IndexedDB with debounced 300ms flush

## License

ISC
