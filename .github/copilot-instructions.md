# Copilot Instructions

## Project Overview

OrgBoard is a vanilla JS (no framework) drag-and-drop team organizer with SQLite-based persistence (sql.js WASM + IndexedDB). Built with Vite.

## Architecture

State is module-scoped in `src/state.mjs` (not on `window`). The app re-renders by replacing `innerHTML` and then calling `createIcons()` to hydrate Lucide icons. `src/app.js` is the orchestrator that wires together rendering, event delegation, and modals.

## Serving the App

```sh
npm run dev      # Vite dev server with HMR
npm run build    # Production build
npm run preview  # Preview production build
```

Or use the VS Code task **"Serve site"**.

## Testing

**Always use the VS Code `runTests` tool to run tests. Never use terminal commands like `npm test`, `npx playwright test`, `node --test`, etc.** Pass specific test file paths to avoid unnecessarily long test runs.

- Unit tests use Node.js built-in `node:test` and `node:assert/strict` — not Jest or Mocha.
- UI tests use Playwright. **Use the drag helpers** from `tests/ui/helpers.ts` (`dragAndDrop()`, `dragAndDropCopy()`, `dragHover()`, `dragCancel()`) for any drag-and-drop test — Playwright's native `dragTo` does not work with this app's custom drag handlers.
- Import `test` and `expect` from `tests/ui/fixtures.ts`, not from `@playwright/test` directly — the fixture handles IndexedDB reset and landing page dismissal.
- State is module-scoped, so verify behavior via DOM assertions, not by reading JS variables.

## Playwright Browser (MCP)

Always close the Playwright browser (`mcp_playwright_browser_close`) before navigating to a URL, unless the user explicitly says not to. This avoids stale browser context errors.

When diagnosing drag-and-drop behavior, use `page.evaluate()` to dispatch synthetic drag events since Playwright's `dragTo` doesn't work reliably with this app's custom drag handlers.

## Key Patterns

- **`resolveDropzone()`** redirects drags over any part of a team to its nearest valid drop slot. All drop logic flows through this.
- **Collapsed teams** render facepile dots instead of full cards. Drop previews for collapsed teams insert a `.drag-preview-dot` into the `.member-facepile` span.
- **Copy mode** — hold `C` key during drag to copy instead of move.
- **`escapeHtml()`** — all user-provided strings must be escaped via `escapeHtml()` before insertion into HTML template literals.

## Style Conventions

- Vanilla JS, ES modules, no TypeScript in `src/`
- Tests use TypeScript (Playwright) or `.mjs` (unit tests)
- HTML is built via template literals in `src/render.mjs`, not JSX or a template engine
