// ─── Layout constants ───
export const oppositeLayout = { horizontal: "vertical", vertical: "horizontal" };
export const layoutIcons = {
  horizontal: '<i data-lucide="square-arrow-right"></i>',
  vertical: '<i data-lucide="square-arrow-down"></i>',
};

// ─── Random team defaults ───
export const randomTeamColors = [
  "#a5b4fc",
  "#93c5fd",
  "#c4b5fd",
  "#7dd3fc",
  "#94a3b8",
  "#6ee7b7",
  "#fca5a5",
  "#bef264",
];
export const randomTeamNames = [
  "Studio",
  "Platform",
  "Growth",
  "Insights",
  "Delivery",
  "Quality",
  "Enablement",
  "Partnerships",
];

// ─── State factories ───
export const createInitialState = () => ({
  rootLayout: "horizontal",
  unassignedBarCollapsed: false,
  statsPanelOpen: false,
  checksPanelOpen: false,
  notesPanelOpen: false,
  notes: "",
  activeSortLayers: [],
  unassignedEmployees: ["p9", "p10"],
  employees: {
    p1: { id: "p1", name: "Ava Richardson", location: "San Francisco, CA", timezone: "PST (UTC−8)", role: "Product Director", notes: "", requested: false, level: 8, currentManager: "" },
    p2: { id: "p2", name: "Milo Hartwell", location: "London, UK", timezone: "GMT (UTC+0)", role: "Senior Engineer", notes: "", requested: false, level: 6, currentManager: "Ava Richardson" },
    p3: { id: "p3", name: "Zuri Okafor", location: "Nairobi, Kenya", timezone: "EAT (UTC+3)", role: "UX Designer", notes: "", requested: false, level: 5, currentManager: "Noah Tremblay" },
    p4: { id: "p4", name: "Noah Tremblay", location: "Toronto, Canada", timezone: "EST (UTC−5)", role: "Operations Manager", notes: "", requested: false, level: 7, currentManager: "" },
    p5: { id: "p5", name: "Lena Schreiber", location: "Berlin, Germany", timezone: "CET (UTC+1)", role: "Data Analyst", notes: "", requested: false, level: 5, currentManager: "Noah Tremblay" },
    p6: { id: "p6", name: "Iris Tanaka", location: "Tokyo, Japan", timezone: "JST (UTC+9)", role: "Research Lead", notes: "", requested: false, level: 7, currentManager: "Ava Richardson" },
    p7: { id: "p7", name: "Theo Carmichael", location: "Sydney, Australia", timezone: "AEST (UTC+10)", role: "QA Engineer", notes: "", requested: false, level: 4, currentManager: "Iris Tanaka" },
    p8: { id: "p8", name: "June Delacroix", location: "Chicago, IL", timezone: "CST (UTC−6)", role: "Field Operations", notes: "", requested: false, level: 5, currentManager: "Noah Tremblay" },
    p9: { id: "p9", name: "Eli Vasquez", location: "São Paulo, Brazil", timezone: "BRT (UTC−3)", role: "Support Specialist", notes: "", requested: false, level: 3, currentManager: "Ava Richardson" },
    p10: { id: "p10", name: "Nia Ramaswamy", location: "Mumbai, India", timezone: "IST (UTC+5:30)", role: "Program Intern", notes: "", requested: false, level: 2, currentManager: "" },
  },
  teams: {
    t1: {
      id: "t1",
      name: "Product",
      ownLayout: "expanded",
      manager: "p1",
      members: [
        { id: "p2" },
        { id: "p3" },
      ],
      subTeams: [
        { id: "t3" },
      ],
      color: "#818cf8",
    },
    t2: {
      id: "t2",
      name: "Operations",
      ownLayout: "expanded",
      manager: "p4",
      members: [
        { id: "p5" },
      ],
      subTeams: [
        { id: "t4" },
      ],
      color: "#60a5fa",
    },
    t3: {
      id: "t3",
      name: "Research",
      ownLayout: "collapsed",
      manager: "p6",
      members: [{ id: "p7" }],
      subTeams: [],
      color: "#a78bfa",
    },
    t4: {
      id: "t4",
      name: "Field",
      ownLayout: "expanded",
      manager: null,
      members: [{ id: "p8" }],
      subTeams: [],
      color: "#38bdf8",
    },
  },
  rootTeams: ["t1", "t2"],
});

export const createBlankState = () => ({
  rootLayout: "horizontal",
  unassignedBarCollapsed: false,
  statsPanelOpen: false,
  checksPanelOpen: false,
  notesPanelOpen: false,
  notes: "",
  activeSortLayers: [],
  unassignedEmployees: [],
  employees: {},
  teams: {},
  rootTeams: [],
  initialized: false,
});

// ─── Mutable application state ───
export let state = createInitialState();
export function setState(s) { state = s; }

export let dragState = null;
export function setDragState(ds) { dragState = ds; }

export let employeeSequence = 10;
export function setEmployeeSequence(v) { employeeSequence = v; }

export let teamSequence = 4;
export function setTeamSequence(v) { teamSequence = v; }

export let isCopyMode = false;
export function setIsCopyMode(v) { isCopyMode = v; }

// ─── Scenario / tab state ───
export let scenarios = [];
export function setScenarios(v) { scenarios = v; }

export let activeScenarioId = null;
export function setActiveScenarioId(v) { activeScenarioId = v; }

export let scenarioSequence = 0;
export function setScenarioSequence(v) { scenarioSequence = v; }

export let showLanding = false;
export function setShowLanding(v) { showLanding = v; }

// ─── Global criteria (validation checks loaded from DB) ───
export let globalCriteria = [];
export function setGlobalCriteria(v) { globalCriteria = v; }

// ─── State helpers ───
export function getTeam(teamId) {
  return state.teams[teamId];
}

export function getAllManagers() {
  const managers = [];
  for (const team of Object.values(state.teams)) {
    if (team.manager && state.employees[team.manager]) {
      if (!managers.some((m) => m.id === team.manager)) {
        managers.push(state.employees[team.manager]);
      }
    }
  }
  return managers;
}

export function findMemberEntry(employeeId, teamId) {
  const team = getTeam(teamId);
  if (!team) return null;
  return team.members.find((m) => m.id === employeeId) ?? null;
}
