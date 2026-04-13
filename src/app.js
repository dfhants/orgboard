import { initDB, listScenarios, loadScenario, saveScenario, getMeta, setMeta, listCriteria } from "./db.mjs";
import {
  state, scenarios, scenarioSequence, activeScenarioId,
  setState, setScenarios, setActiveScenarioId, setScenarioSequence,
  setShowLanding, setEmployeeSequence, setTeamSequence, setGlobalCriteria,
  createBlankState, employeeSequence,
} from "./state.mjs";
import { initializeSequence } from "./utils.mjs";
import { generateScenarioId, nextScenarioName } from "./scenarios.mjs";
import { render, observeShellResize } from "./render.mjs";
import { setupDragDropListeners } from "./drag-drop.mjs";
import { setupEventListeners } from "./events.mjs";

/* ── Test hook (exposes state + render for fast test setup) ── */
window.__test = {
  getState: () => state,
  render,
  getEmployeeSequence: () => employeeSequence,
  setEmployeeSequence: (v) => setEmployeeSequence(v),
};

/* ── Wire up event listeners ──────────────────────────── */
setupDragDropListeners();
setupEventListeners();

/* ── Bootstrap ────────────────────────────────────────── */
(async () => {
  await initDB();

  const existingScenarios = listScenarios();
  if (existingScenarios.length > 0) {
    setScenarios(existingScenarios.map(({ id, name }) => ({ id, name })));
    // Derive scenarioSequence from existing names like "Scenario 3"
    for (const s of scenarios) {
      const m = s.name.match(/^Scenario\s+(\d+)$/);
      if (m) setScenarioSequence(Math.max(scenarioSequence, Number(m[1])));
    }

    const lastActiveId = getMeta("activeScenarioId");
    const target = scenarios.find((s) => s.id === lastActiveId) ?? scenarios[scenarios.length - 1];
    setActiveScenarioId(target.id);

    const loaded = loadScenario(activeScenarioId);
    if (loaded) {
      setState(loaded);
      setShowLanding(!state.initialized);
    }
  } else {
    // First run — show landing page
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

  // Load global criteria from DB
  setGlobalCriteria(listCriteria());

  render();
  observeShellResize();
})();
