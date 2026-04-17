# OrgBoard

A drag-and-drop team organizer built with [Preact](https://preactjs.com/) + [Signals](https://preactjs.com/guide/v10/signals/), bundled by [Vite](https://vite.dev/) with [lightningcss](https://lightningcss.dev/) for CSS processing. Data is persisted locally in the browser via SQLite ([sql.js](https://sql.js.org/) WASM) stored in IndexedDB.

![Preact](https://img.shields.io/badge/UI-Preact-673ab8) ![Playwright](https://img.shields.io/badge/tests-Playwright-45ba63)

> **🔒 Your data stays on your device.** OrgBoard runs entirely in the browser — no server, no accounts, no data leaves your machine. Everything is stored locally in IndexedDB.

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

---

## Development

### Prerequisites

- Node.js 20+

### Install Dependencies

```sh
npm install
```

### Run the Dev Server

```sh
npm run dev
```

Opens [http://localhost:4173](http://localhost:4173) with Vite HMR.

### Build & Preview

```sh
npm run build     # Production build → dist/
npm run preview   # Serve the production build locally
```

### Run Tests

```sh
# Unit tests (Node.js built-in test runner)
npm test

# Unit tests with coverage
npm run test:cov

# UI tests (Playwright — headless)
npm run test:ui

# UI tests (visible browser)
npx playwright test --headed
```

Playwright auto-starts the Vite dev server if it isn't already running.

### Lint CSS

```sh
npm run lint:css       # Check
npm run lint:css:fix   # Auto-fix
```

---

## Project Structure

```
index.html                Entry point
vite.config.js            Vite config (Preact, PurgeCSS, lightningcss)

src/
  app.jsx                 Orchestrator — bootstraps app, wires modules together
  state.mjs               Centralized state with mutable exports and setters
  render.mjs              Legacy template rendering (teams, cards, modals)
  events.mjs              Event delegation and UI event handlers
  drag-drop.mjs           HTML5 drag event handlers, drop preview, copy-mode
  operations.mjs          Move/copy/delete operations on employees and teams
  scenarios.mjs           Scenario lifecycle (create, switch, rename, close, export)
  csv-import.mjs          CSV parsing and import logic
  checks.mjs              Pluggable validation engine (11 check types)
  db.mjs                  SQLite persistence via sql.js (WASM) + IndexedDB
  packing.mjs             Pure function for horizontal column packing
  team-logic.mjs          Team hierarchy operations, nesting, stats
  hierarchy.mjs           Org-chart tree builder
  layout.mjs              Layout mode toggling
  icons.mjs               Lucide icon hydration
  utils.mjs               Colors, timezone math, HTML escaping, hashing

  components/             Preact components (JSX)
    App.jsx               Root component
    Board.jsx             Main board layout
    TeamSection.jsx       Team container with drag zones
    PersonCard.jsx        Individual person card
    Facepile.jsx          Collapsed team dot view
    TabBar.jsx            Scenario tab bar
    ActionBar.jsx         Toolbar actions
    StatsPanel.jsx        Role & timezone distribution sidebar
    UnassignedBar.jsx     Collapsible unassigned employees drawer
    LandingPage.jsx       First-run experience
    useInlineEdit.js      Hook for inline text editing

  css/
    main.css              Entry point — @imports modular stylesheets
    tokens.css            Design tokens & resets
    layout.css            Grid, toolbar, tabs, action bar
    drag-drop.css         Drop zones & drag previews
    person-card.css       Person cards
    team-panel.css        Team containers, titlebar, slots
    modals.css            Overlays, panels, inputs
    ...                   + landing, csv-import, notes-panel, stats-panel, etc.

tests/
  *.test.mjs              Unit tests (node:test + node:assert/strict)
  test-helpers.mjs        Shared test utilities
  data/                   CSV fixtures
  ui/
    fixtures.ts           Playwright fixture (IndexedDB reset, landing dismiss)
    helpers.ts            Drag-and-drop test helpers
    *.spec.ts             UI tests (Playwright)
```

## Architecture

- **No framework** — vanilla JS with ES modules
- **Vite** — dev server with HMR, production bundling, CSS processing via lightningcss
- **Runtime dependencies** — Lucide icons and sql.js installed via npm; Google Fonts loaded from CDN
- **State** is a module-scoped object in `src/state.mjs`; the app re-renders by replacing `innerHTML` and calling `createIcons()`
- **HTML** is built with template literals; user input is escaped via `escapeHtml()`
- **Persistence** — sql.js (WASM) SQLite database stored in IndexedDB with debounced 300ms flush

## License

MIT
