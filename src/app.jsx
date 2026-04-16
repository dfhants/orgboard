import { render } from 'preact';
import { initDB, listCriteria, saveScenario, setMeta } from "./db.mjs";
import {
  state,
  setState, setScenarios, setActiveScenarioId,
  setShowLanding, setEmployeeSequence, setTeamSequence, setGlobalCriteria,
  createBlankState, employeeSequence,
  notifyStateChange,
} from "./state.mjs";
import { initializeSequence } from "./utils.mjs";
import { generateScenarioId, nextScenarioName, restoreScenariosFromDB } from "./scenarios.mjs";
import { observeShellResize } from "./layout.mjs";
import { setupDragDropListeners } from "./drag-drop.mjs";
import { setupEventListeners } from "./events.mjs";
import { App } from "./components/App.jsx";

/* ── Test hook (exposes state + notifyStateChange for fast test setup) ── */
if (import.meta.env.DEV) {
  window.__test = {
    getState: () => state,
    render: () => notifyStateChange(),
    getEmployeeSequence: () => employeeSequence,
    setEmployeeSequence: (v) => setEmployeeSequence(v),
  };
}

/* ── Wire up event listeners ──────────────────────────── */
setupDragDropListeners();
setupEventListeners();

/* ── Mount Preact ────────────────────────────────────── */
const root = document.getElementById("app");
function renderApp() {
  render(<App />, root);
}

// Initial render (landing page until bootstrap completes)
renderApp();

/* ── Bootstrap ────────────────────────────────────────── */
(async () => {
  await initDB();

  const loaded = restoreScenariosFromDB();
  if (loaded) {
    setState(loaded);
    setShowLanding(!state.initialized);
  } else {
    const id = generateScenarioId();
    const name = nextScenarioName();
    setState(createBlankState());
    setScenarios([{ id, name }]);
    setActiveScenarioId(id);
    saveScenario(id, name, state);
    setMeta("activeScenarioId", id);
    setShowLanding(true);
  }

  setEmployeeSequence(initializeSequence(state.employees, "p"));
  setTeamSequence(initializeSequence(state.teams, "t"));
  setGlobalCriteria(listCriteria());

  notifyStateChange();
  observeShellResize();
})();
