import {
  state, setState,
  setDragState, setIsCopyMode,
  employeeSequence, setEmployeeSequence,
  teamSequence, setTeamSequence,
  scenarios, setScenarios, activeScenarioId, setActiveScenarioId,
  scenarioSequence, setScenarioSequence, setShowLanding, setGlobalCriteria,
  createInitialState, createBlankState,
} from './state.mjs';
import { saveScenario, loadScenario, deleteScenario, getMeta, setMeta, exportDB, importDB, listScenarios, listCriteria } from './db.mjs';
import { initializeSequence } from './utils.mjs';

export function generateScenarioId() {
  return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function nextScenarioName() {
  setScenarioSequence(scenarioSequence + 1);
  return `Scenario ${scenarioSequence}`;
}

export function debouncedSave() {
  if (activeScenarioId) {
    const entry = scenarios.find((s) => s.id === activeScenarioId);
    if (entry) {
      saveScenario(activeScenarioId, entry.name, state);
      setMeta("activeScenarioId", activeScenarioId);
    }
  }
}

export function switchToScenario(id) {
  // Save current scenario before switching
  if (activeScenarioId) {
    const current = scenarios.find((s) => s.id === activeScenarioId);
    if (current) saveScenario(activeScenarioId, current.name, state);
  }

  const loaded = loadScenario(id);
  if (!loaded) return;

  setState(loaded);
  setActiveScenarioId(id);
  setShowLanding(!state.initialized);
  setDragState(null);
  setIsCopyMode(false);
  setEmployeeSequence(initializeSequence(state.employees, "p"));
  setTeamSequence(initializeSequence(state.teams, "t"));
  setMeta("activeScenarioId", id);
}

export function createNewScenario() {
  const id = generateScenarioId();
  const name = nextScenarioName();
  const newState = createBlankState();

  // Save current before switching
  if (activeScenarioId) {
    const current = scenarios.find((s) => s.id === activeScenarioId);
    if (current) saveScenario(activeScenarioId, current.name, state);
  }

  scenarios.push({ id, name });
  saveScenario(id, name, newState);

  setState(newState);
  setActiveScenarioId(id);
  setDragState(null);
  setIsCopyMode(false);
  setEmployeeSequence(initializeSequence(state.employees, "p"));
  setTeamSequence(initializeSequence(state.teams, "t"));
  setMeta("activeScenarioId", id);
  setShowLanding(true);
}

export function loadDemoData() {
  setState(createInitialState());
  state.initialized = true;
  setShowLanding(false);
  setEmployeeSequence(initializeSequence(state.employees, "p"));
  setTeamSequence(initializeSequence(state.teams, "t"));
}

export function loadBlankBoard() {
  state.initialized = true;
  setShowLanding(false);
}

export function closeScenario(id) {
  if (scenarios.length <= 1) return false;
  if (!confirm("Close this scenario? It will be permanently deleted.")) return false;

  deleteScenario(id);
  setScenarios(scenarios.filter((s) => s.id !== id));

  if (activeScenarioId === id) {
    const newActive = scenarios[scenarios.length - 1];
    switchToScenario(newActive.id);
  }
  return true;
}

export function renameScenario(id, newName) {
  const entry = scenarios.find((s) => s.id === id);
  if (!entry) return;
  entry.name = newName;
  if (id === activeScenarioId) {
    saveScenario(id, newName, state);
  } else {
    const loaded = loadScenario(id);
    if (loaded) saveScenario(id, newName, loaded);
  }
}

export function handleExportDB() {
  const data = exportDB();
  if (!data) return;
  const blob = new Blob([data], { type: "application/x-sqlite3" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "orgboard.db";
  a.click();
  URL.revokeObjectURL(url);
}

export async function handleImportDB(file) {
  if (!file) return false;

  const arrayBuffer = await file.arrayBuffer();
  await importDB(arrayBuffer);

  const existingScenarios = listScenarios();
  if (existingScenarios.length === 0) {
    throw new Error("Imported database has no scenarios.");
  }

  setScenarios(existingScenarios.map(({ id, name }) => ({ id, name })));
  setScenarioSequence(0);
  for (const scenario of scenarios) {
    const match = scenario.name.match(/^Scenario\s+(\d+)$/);
    if (match) setScenarioSequence(Math.max(scenarioSequence, Number(match[1])));
  }

  const lastActiveId = getMeta("activeScenarioId");
  const target = scenarios.find((s) => s.id === lastActiveId) ?? scenarios[scenarios.length - 1];
  setActiveScenarioId(target.id);

  const loaded = loadScenario(target.id);
  if (!loaded) {
    throw new Error("Imported database is missing its active scenario state.");
  }

  setState(loaded);
  setShowLanding(!loaded.initialized);
  setDragState(null);
  setIsCopyMode(false);
  setEmployeeSequence(initializeSequence(loaded.employees, "p"));
  setTeamSequence(initializeSequence(loaded.teams, "t"));
  setGlobalCriteria(listCriteria());
  setMeta("activeScenarioId", target.id);
  return true;
}
