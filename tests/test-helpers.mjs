import { state, setEmployeeSequence, setTeamSequence } from "../src/state.mjs";

export function makeEmployee(id, opts = {}) {
  return {
    id,
    name: opts.name ?? `Employee ${id}`,
    role: opts.role ?? "Engineer",
    timezone: opts.timezone ?? "GMT (UTC+0)",
    location: opts.location ?? "London",
    notes: "",
    requested: false,
    level: opts.level ?? null,
    currentManager: opts.currentManager ?? "",
  };
}

export function makeTeam(id, opts = {}) {
  return {
    id,
    name: opts.name ?? `Team ${id}`,
    ownLayout: opts.ownLayout ?? "expanded",
    manager: opts.manager ?? null,
    members: opts.members ?? [],
    subTeams: opts.subTeams ?? [],
    childLayout: opts.childLayout ?? "horizontal",
    color: opts.color ?? "#818cf8",
  };
}

export function resetState() {
  for (const k of Object.keys(state.employees)) delete state.employees[k];
  for (const k of Object.keys(state.teams)) delete state.teams[k];
  state.rootTeams.length = 0;
  state.unassignedEmployees = [];
  setEmployeeSequence(10);
  setTeamSequence(10);
}
