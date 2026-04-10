// ─── Criteria evaluation engine ───
// Each check type is a pure function: (state, config) → { passed, details[] }

import { collectAllEmployeesInTeam, countTeamMemberships, computeManagerChanges } from "./team-logic.mjs";
import { parseUtcOffset, computeMaxTimezoneGap } from "./utils.mjs";

// ─── Helpers ───

function allTeamIds(state) {
  return Object.keys(state.teams);
}

function getTeamEmployees(state, teamId) {
  const team = state.teams[teamId];
  if (!team) return [];
  const ids = collectAllEmployeesInTeam(state.teams, teamId);
  const unique = [...new Set(ids)];
  return unique.map((id) => state.employees[id]).filter(Boolean);
}

function matchesFilter(employee, filter) {
  if (!filter) return true;
  const value = employee[filter.field];
  switch (filter.op) {
    case ">=": return typeof value === "number" && value >= Number(filter.value);
    case "<=": return typeof value === "number" && value <= Number(filter.value);
    case "==": return String(value) === String(filter.value);
    case "!=": return String(value) !== String(filter.value);
    case "contains": return String(value ?? "").toLowerCase().includes(String(filter.value).toLowerCase());
    default: return true;
  }
}

function compareOp(actual, op, expected) {
  switch (op) {
    case ">=": return actual >= expected;
    case "<=": return actual <= expected;
    case "==": return actual === expected;
    default: return false;
  }
}

// ─── Per-team check types ───

function checkEmployeeCount(state, config) {
  const details = [];
  for (const teamId of allTeamIds(state)) {
    const team = state.teams[teamId];
    const employees = getTeamEmployees(state, teamId);
    const matching = config.filter ? employees.filter((e) => matchesFilter(e, config.filter)) : employees;
    const passed = compareOp(matching.length, config.operator, config.value);
    details.push({
      teamId, teamName: team.name, passed,
      message: `${matching.length} ${config.filter ? "matching " : ""}employee${matching.length !== 1 ? "s" : ""} (need ${config.operator} ${config.value})`,
    });
  }
  return { passed: details.every((d) => d.passed), details };
}

function checkDistinctValues(state, config) {
  const details = [];
  for (const teamId of allTeamIds(state)) {
    const team = state.teams[teamId];
    const employees = getTeamEmployees(state, teamId);
    const values = new Set(employees.map((e) => e[config.field]).filter(Boolean));
    const passed = compareOp(values.size, config.operator, config.value);
    details.push({
      teamId, teamName: team.name, passed,
      message: `${values.size} distinct ${config.field}${values.size !== 1 ? "s" : ""} (need ${config.operator} ${config.value})`,
    });
  }
  return { passed: details.every((d) => d.passed), details };
}

function checkTimezoneGap(state, config) {
  const details = [];
  for (const teamId of allTeamIds(state)) {
    const team = state.teams[teamId];
    const employees = getTeamEmployees(state, teamId);
    const offsets = employees.map((e) => parseUtcOffset(e.timezone)).filter((o) => !Number.isNaN(o));
    const gap = computeMaxTimezoneGap(offsets);
    const passed = gap <= config.maxHours;
    details.push({
      teamId, teamName: team.name, passed,
      message: `${gap}h gap (max ${config.maxHours}h)`,
    });
  }
  return { passed: details.every((d) => d.passed), details };
}

function checkHasManager(state, _config) {
  const details = [];
  for (const teamId of allTeamIds(state)) {
    const team = state.teams[teamId];
    const passed = !!team.manager && !!state.employees[team.manager];
    details.push({
      teamId, teamName: team.name, passed,
      message: passed ? "Has manager" : "No manager assigned",
    });
  }
  return { passed: details.every((d) => d.passed), details };
}

function checkManagerMatch(state, config) {
  const details = [];
  for (const teamId of allTeamIds(state)) {
    const team = state.teams[teamId];
    if (!team.manager || !state.employees[team.manager]) {
      details.push({ teamId, teamName: team.name, passed: false, message: "No manager to compare" });
      continue;
    }
    const manager = state.employees[team.manager];
    const managerValue = manager[config.field];
    const employees = getTeamEmployees(state, teamId).filter((e) => e.id !== team.manager);
    if (employees.length === 0) {
      details.push({ teamId, teamName: team.name, passed: true, message: "No members to compare" });
      continue;
    }
    const matchCount = employees.filter((e) => e[config.field] === managerValue).length;
    let passed;
    switch (config.match) {
      case "all": passed = matchCount === employees.length; break;
      case "majority": passed = matchCount > employees.length / 2; break;
      case "any": default: passed = matchCount > 0; break;
    }
    details.push({
      teamId, teamName: team.name, passed,
      message: `Manager ${config.field} matches ${matchCount}/${employees.length} members (need ${config.match})`,
    });
  }
  return { passed: details.every((d) => d.passed), details };
}

function checkMaxDirectReports(state, config) {
  const details = [];
  for (const teamId of allTeamIds(state)) {
    const team = state.teams[teamId];
    if (!team.manager) {
      details.push({ teamId, teamName: team.name, passed: true, message: "No manager" });
      continue;
    }
    const directCount = team.members.length;
    const passed = directCount <= config.maxReports;
    details.push({
      teamId, teamName: team.name, passed,
      message: `${directCount} direct report${directCount !== 1 ? "s" : ""} (max ${config.maxReports})`,
    });
  }
  return { passed: details.every((d) => d.passed), details };
}

function checkRequestedLimit(state, config) {
  const details = [];
  for (const teamId of allTeamIds(state)) {
    const team = state.teams[teamId];
    const employees = getTeamEmployees(state, teamId);
    const requested = employees.filter((e) => e.requested).length;
    const passed = compareOp(requested, config.operator, config.value);
    details.push({
      teamId, teamName: team.name, passed,
      message: `${requested} requested position${requested !== 1 ? "s" : ""} (need ${config.operator} ${config.value})`,
    });
  }
  return { passed: details.every((d) => d.passed), details };
}

function checkRoleCoverage(state, config) {
  const pattern = config.rolePattern.toLowerCase();
  const details = [];
  for (const teamId of allTeamIds(state)) {
    const team = state.teams[teamId];
    const employees = getTeamEmployees(state, teamId);
    const hasRole = employees.some((e) => e.role.toLowerCase().includes(pattern));
    details.push({
      teamId, teamName: team.name, passed: hasRole,
      message: hasRole ? `Has "${config.rolePattern}" role` : `Missing "${config.rolePattern}" role`,
    });
  }
  return { passed: details.every((d) => d.passed), details };
}

// ─── Scenario-level check types ───

function checkScenarioCount(state, config) {
  let actual;
  switch (config.subject) {
    case "teams": actual = Object.keys(state.teams).length; break;
    case "people": actual = Object.keys(state.employees).length; break;
    case "unassigned": actual = state.unassignedEmployees.length; break;
    case "managers": {
      const mgrs = new Set(Object.values(state.teams).map((t) => t.manager).filter(Boolean));
      actual = mgrs.size;
      break;
    }
    default: actual = 0;
  }
  const passed = compareOp(actual, config.operator, config.value);
  return {
    passed,
    details: [{
      passed,
      message: `${config.subject}: ${actual} (need ${config.operator} ${config.value})`,
    }],
  };
}

function checkMaxMemberships(state, config) {
  const violations = [];
  for (const emp of Object.values(state.employees)) {
    const count = countTeamMemberships(state.teams, emp.id);
    if (count > config.maxTeams) {
      violations.push(emp);
    }
  }
  const passed = violations.length === 0;
  return {
    passed,
    details: [{
      passed,
      message: passed
        ? `No one exceeds ${config.maxTeams} team${config.maxTeams !== 1 ? "s" : ""}`
        : `${violations.length} ${violations.length === 1 ? "person" : "people"} in >${config.maxTeams} teams: ${violations.map((v) => v.name).join(", ")}`,
    }],
  };
}

function checkAllAssigned(state, _config) {
  const count = state.unassignedEmployees.length;
  const passed = count === 0;
  return {
    passed,
    details: [{
      passed,
      message: passed ? "Everyone is assigned" : `${count} unassigned`,
    }],
  };
}

function checkManagerChanged(state, config) {
  const { changes, tracked } = computeManagerChanges(state);
  const count = changes.length;
  const passed = compareOp(count, config.operator, config.value);
  const names = changes.slice(0, 5).map((c) => {
    const to = c.to ?? "unassigned";
    return `${c.employee.name}: ${c.from} → ${to}`;
  });
  const suffix = count > 5 ? ` (+${count - 5} more)` : "";
  return {
    passed,
    details: [{
      passed,
      message: `${count} of ${tracked} people changed manager (need ${config.operator} ${config.value})${names.length > 0 ? ": " + names.join("; ") + suffix : ""}`,
    }],
  };
}

// ─── Registry ───

export const checkTypes = {
  "employee-count": { label: "Team size", description: "Each team has a certain number of people", scope: "team", evaluate: checkEmployeeCount },
  "distinct-values": { label: "Field variety", description: "Limit or require variety in a field like timezone, location, or role", scope: "team", evaluate: checkDistinctValues },
  "timezone-gap": { label: "Timezone spread", description: "Maximum hour difference between team members' timezones", scope: "team", evaluate: checkTimezoneGap },
  "has-manager": { label: "Manager assigned", description: "Every team must have a manager", scope: "team", evaluate: checkHasManager },
  "manager-match": { label: "Manager shares property", description: "Manager's location or timezone matches their team members", scope: "team", evaluate: checkManagerMatch },
  "max-direct-reports": { label: "Direct report limit", description: "Cap how many people report directly to one manager", scope: "team", evaluate: checkMaxDirectReports },
  "requested-limit": { label: "Open positions", description: "Limit how many requested/open positions each team can have", scope: "team", evaluate: checkRequestedLimit },
  "role-coverage": { label: "Required role", description: "Every team must include someone with a specific role", scope: "team", evaluate: checkRoleCoverage },
  "scenario-count": { label: "Total count", description: "Check the total number of teams, people, managers, or unassigned", scope: "scenario", evaluate: checkScenarioCount },
  "max-memberships": { label: "Multi-team limit", description: "Limit how many teams one person can belong to", scope: "scenario", evaluate: checkMaxMemberships },
  "all-assigned": { label: "Everyone assigned", description: "No one is left in the unassigned pool", scope: "scenario", evaluate: checkAllAssigned },
  "manager-changed": { label: "Manager changes", description: "Limit how many people get a different manager than their original", scope: "scenario", evaluate: checkManagerChanged },
};

// ─── Public API ───

export function evaluateAllChecks(state, criteria) {
  const results = [];
  let totalPassed = 0;
  let totalFailed = 0;

  for (const criterion of criteria) {
    if (!criterion.enabled) continue;
    const def = checkTypes[criterion.type];
    if (!def) continue;
    const result = def.evaluate(state, criterion.config);
    if (result.passed) totalPassed++;
    else totalFailed++;
    results.push({
      criterionId: criterion.id,
      criterionName: criterion.name,
      type: criterion.type,
      passed: result.passed,
      details: result.details,
    });
  }

  return { results, summary: { total: totalPassed + totalFailed, passed: totalPassed, failed: totalFailed } };
}

const opWords = { ">=": "at least", "<=": "at most", "==": "exactly" };
const matchWords = { any: "at least one member", majority: "most members", all: "all members" };

/** Generate a human-readable description of a criterion's config. */
export function describeCriterion(type, config) {
  const opWord = (op) => opWords[op] || op;
  switch (type) {
    case "employee-count": {
      const base = `Each team has ${opWord(config.operator)} ${config.value} ${config.value !== 1 ? "people" : "person"}`;
      if (config.filter) {
        const filterOp = config.filter.op === "contains" ? "contains" :
          config.filter.op === "!=" ? "is not" :
          config.filter.op === "==" ? "is" :
          config.filter.op;
        return `${base} whose ${config.filter.field} ${filterOp} "${config.filter.value}"`;
      }
      return base;
    }
    case "distinct-values":
      return `Each team has ${opWord(config.operator)} ${config.value} different ${config.field}${config.value !== 1 ? "s" : ""}`;
    case "timezone-gap":
      return `Timezone spread within each team is ${config.maxHours} hours or less`;
    case "has-manager":
      return "Every team has a manager assigned";
    case "manager-match":
      return `Manager's ${config.field} matches ${matchWords[config.match] || config.match}`;
    case "max-direct-reports":
      return `No manager has more than ${config.maxReports} direct ${config.maxReports !== 1 ? "reports" : "report"}`;
    case "requested-limit":
      return `Each team has ${opWord(config.operator)} ${config.value} open ${config.value !== 1 ? "positions" : "position"}`;
    case "role-coverage":
      return `Every team includes a "${config.rolePattern}"`;
    case "scenario-count": {
      const subjectLabels = { teams: "teams", people: "people", unassigned: "unassigned people", managers: "managers" };
      return `There are ${opWord(config.operator)} ${config.value} ${subjectLabels[config.subject] || config.subject}`;
    }
    case "max-memberships":
      return `No one belongs to more than ${config.maxTeams} ${config.maxTeams !== 1 ? "teams" : "team"}`;
    case "all-assigned":
      return "Everyone is assigned to a team";
    case "manager-changed":
      return `${opWord(config.operator)} ${config.value} ${config.value !== 1 ? "people" : "person"} changed manager`;
    default:
      return "Unknown check";
  }
}
