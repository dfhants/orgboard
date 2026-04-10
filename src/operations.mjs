import {
  state, getTeam,
  employeeSequence, setEmployeeSequence,
  teamSequence, setTeamSequence,
  randomTeamColors,
} from './state.mjs';
import { isTeamInside, normalizeInsertIndex, cleanupManagerOverrides, collectAllEmployeesInTeam, findParentTeam } from './team-logic.mjs';
import { pickRandomItem } from './utils.mjs';

function nextTeamName() {
  const existingNames = new Set(Object.values(state.teams).map((t) => t.name));
  let n = 1;
  while (existingNames.has(`New team ${n}`)) n++;
  return `New team ${n}`;
}

export function addRandomRootTeam() {
  setTeamSequence(teamSequence + 1);
  const teamId = `t${teamSequence}`;
  state.teams[teamId] = {
    id: teamId,
    name: nextTeamName(),
    ownLayout: "expanded",
    manager: null,
    members: [],
    subTeams: [],
    color: pickRandomItem(randomTeamColors),
  };

  state.rootTeams.push(teamId);
  return teamId;
}

export function addRandomTeamToTeam(parentTeamId) {
  const parentTeam = getTeam(parentTeamId);
  const teamId = addRandomRootTeam();

  state.rootTeams = state.rootTeams.filter((id) => id !== teamId);
  insertSubTeam(parentTeamId, { id: teamId });

  if (parentTeam.ownLayout === "collapsed") {
    parentTeam.ownLayout = "expanded";
  }
}

export function removeEmployeeFromCurrentLocation(employeeId) {
  state.unassignedEmployees = state.unassignedEmployees.filter((id) => id !== employeeId);

  // Preserve managerOverride when moving between teams
  let preservedOverride = null;
  for (const team of Object.values(state.teams)) {
    if (team.manager === employeeId && team.managerOverride) {
      preservedOverride = team.managerOverride;
    }
    const member = team.members.find((m) => m.id === employeeId);
    if (member?.managerOverride) {
      preservedOverride = member.managerOverride;
    }
  }

  for (const team of Object.values(state.teams)) {
    if (team.manager === employeeId) {
      team.manager = null;
      delete team.managerOverride;
    }
    team.members = team.members.filter(
      (member) => member.id !== employeeId,
    );
  }

  return preservedOverride;
}

export function removeTeamFromCurrentLocation(teamId) {
  state.rootTeams = state.rootTeams.filter((id) => id !== teamId);

  for (const team of Object.values(state.teams)) {
    team.subTeams = team.subTeams.filter(
      (sub) => sub.id !== teamId,
    );
  }
}

export function insertMember(teamId, member, insertIndex) {
  const members = getTeam(teamId).members;
  members.splice(normalizeInsertIndex(members, insertIndex), 0, member);
}

export function insertSubTeam(teamId, entry, insertIndex) {
  const subTeams = getTeam(teamId).subTeams;
  subTeams.splice(normalizeInsertIndex(subTeams, insertIndex), 0, entry);
}

export function moveEmployeeToTeam(employeeId, teamId, slot, insertIndex) {
  const team = getTeam(teamId);
  if (slot === "manager" && team.manager && team.manager !== employeeId) {
    return false;
  }

  const preservedOverride = removeEmployeeFromCurrentLocation(employeeId);

  if (slot === "manager") {
    team.manager = employeeId;
    if (preservedOverride) {
      team.managerOverride = preservedOverride;
    }
    cleanupManagerOverrides(state);
    return true;
  }

  const entry = { id: employeeId };
  if (preservedOverride) {
    entry.managerOverride = preservedOverride;
  }
  insertMember(teamId, entry, insertIndex);
  cleanupManagerOverrides(state);
  return true;
}

export function moveEmployeeToRoster(employeeId) {
  removeEmployeeFromCurrentLocation(employeeId);
  if (!state.unassignedEmployees.includes(employeeId)) {
    state.unassignedEmployees.push(employeeId);
  }
}

export function moveTeamToTarget(teamId, targetTeamId, insertIndex) {
  if (targetTeamId && (teamId === targetTeamId || isTeamInside(state.teams, teamId, targetTeamId))) {
    return false;
  }

  removeTeamFromCurrentLocation(teamId);

  if (!targetTeamId) {
    state.rootTeams.push(teamId);
    return true;
  }

  insertSubTeam(targetTeamId, { id: teamId }, insertIndex);
  return true;
}

export function deepCopyEmployee(employeeId) {
  const original = state.employees[employeeId];
  if (!original) return null;
  setEmployeeSequence(employeeSequence + 1);
  const newId = `p${employeeSequence}`;
  state.employees[newId] = { ...original, id: newId };
  return newId;
}

export function deepCopyTeam(teamId) {
  const original = getTeam(teamId);
  if (!original) return null;
  setTeamSequence(teamSequence + 1);
  const newTeamId = `t${teamSequence}`;
  const newManager = original.manager ? deepCopyEmployee(original.manager) : null;
  const newMembers = original.members.map((member) => {
    return { id: deepCopyEmployee(member.id) };
  });
  const newSubTeams = original.subTeams.map((sub) => {
    return { id: deepCopyTeam(sub.id) };
  });
  state.teams[newTeamId] = {
    ...original,
    id: newTeamId,
    manager: newManager,
    members: newMembers,
    subTeams: newSubTeams,
  };
  return newTeamId;
}

export function copyEmployeeToTeam(employeeId, teamId, slot, insertIndex) {
  const newId = deepCopyEmployee(employeeId);
  if (!newId) return false;
  const team = getTeam(teamId);
  if (slot === "manager") {
    if (team.manager) return false;
    team.manager = newId;
    return true;
  }
  insertMember(teamId, { id: newId }, insertIndex);
  return true;
}

export function copyEmployeeToRoster(employeeId) {
  const newId = deepCopyEmployee(employeeId);
  if (!newId) return false;
  state.unassignedEmployees.push(newId);
  return true;
}

export function copyTeamToTarget(teamId, targetTeamId, insertIndex) {
  const newId = deepCopyTeam(teamId);
  if (!newId) return false;
  if (!targetTeamId) {
    state.rootTeams.push(newId);
    return true;
  }
  insertSubTeam(targetTeamId, { id: newId }, insertIndex);
  return true;
}

export function deleteEmployee(employeeId) {
  removeEmployeeFromCurrentLocation(employeeId);
  delete state.employees[employeeId];
  cleanupManagerOverrides(state);
}

export function deleteAllUnassigned() {
  for (const id of [...state.unassignedEmployees]) {
    delete state.employees[id];
  }
  state.unassignedEmployees.length = 0;
  cleanupManagerOverrides(state);
}

export function deleteTeam(teamId) {
  const team = getTeam(teamId);
  if (!team) {
    return;
  }

  for (const sub of [...team.subTeams]) {
    deleteTeam(sub.id);
  }

  removeTeamFromCurrentLocation(teamId);
  delete state.teams[teamId];
}

export function toggleTeamLayout(teamId) {
  const team = getTeam(teamId);
  team.ownLayout = team.ownLayout === "collapsed" ? "expanded" : "collapsed";
}
