export function isTeamInside(teams, draggedTeamId, targetTeamId) {
  const queue = [draggedTeamId];

  while (queue.length > 0) {
    const current = queue.shift();
    const currentTeam = teams[current];
    if (!currentTeam) continue;
    for (const sub of currentTeam.subTeams) {
      if (sub.id === targetTeamId) {
        return true;
      }
      queue.push(sub.id);
    }
  }

  return false;
}

export function findParentTeam(teams, teamId) {
  for (const t of Object.values(teams)) {
    if (t.subTeams.some((m) => m.id === teamId)) {
      return t;
    }
  }
  return null;
}

export function normalizeInsertIndex(members, insertIndex) {
  if (typeof insertIndex !== "number" || Number.isNaN(insertIndex)) {
    return members.length;
  }

  return Math.max(0, Math.min(insertIndex, members.length));
}

export function cleanupManagerOverrides(state) {
  const unassigned = new Set(state.unassignedEmployees ?? []);
  for (const team of Object.values(state.teams)) {
    // Clean up team manager's own override
    if (team.managerOverride) {
      if (team.managerOverride === team.manager || !state.employees[team.managerOverride] || unassigned.has(team.managerOverride)) {
        delete team.managerOverride;
      }
    }
    // Clean up member overrides
    for (const member of team.members) {
      if (!member.managerOverride) continue;
      // Remove if override matches team's actual manager
      if (member.managerOverride === team.manager) {
        delete member.managerOverride;
        continue;
      }
      // Remove if overridden manager no longer exists or is unassigned
      if (!state.employees[member.managerOverride] || unassigned.has(member.managerOverride)) {
        delete member.managerOverride;
        continue;
      }
      if (member.managerOverride === member.id) {
        delete member.managerOverride;
      }
    }
  }
}

export function countNestedTeams(team) {
  return (team.subTeams ?? []).length;
}

export function countDirectEmployees(team) {
  return (team.members ?? []).length;
}

export function countTeamMemberships(teams, employeeId) {
  let count = 0;
  for (const team of Object.values(teams)) {
    if (team.manager === employeeId) count++;
    if (team.members.some((m) => m.id === employeeId)) count++;
  }
  return count;
}

export function countCopies(employees, employeeId) {
  const employee = employees[employeeId];
  if (!employee) return 0;
  const originalId = employee.copyOf || employeeId;
  let count = 0;
  for (const e of Object.values(employees)) {
    if (e.id !== originalId && e.copyOf === originalId) count++;
  }
  return count;
}

export function collectAllEmployeesInTeam(teams, teamId) {
  const team = teams[teamId];
  if (!team) return [];
  const ids = [];
  if (team.manager) ids.push(team.manager);
  for (const m of team.members) {
    ids.push(m.id);
  }
  for (const sub of team.subTeams) {
    ids.push(...collectAllEmployeesInTeam(teams, sub.id));
  }
  return ids;
}

function buildManagerGraph(state) {
  const graph = new Map(); // employeeId -> Set(managerIds)

  function addEdge(reportId, managerId) {
    if (!reportId || !managerId || reportId === managerId) return;
    if (!graph.has(reportId)) graph.set(reportId, new Set());
    graph.get(reportId).add(managerId);
  }

  for (const team of Object.values(state.teams || {})) {
    if (team.manager && team.managerOverride) {
      addEdge(team.manager, team.managerOverride);
    }

    for (const member of team.members || []) {
      const effectiveManagerId = member.managerOverride ?? team.manager;
      addEdge(member.id, effectiveManagerId);
    }
  }

  return graph;
}

function canReachEmployee(graph, startId, targetId) {
  if (!startId || !targetId) return false;
  const queue = [startId];
  const seen = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === targetId) return true;
    if (seen.has(current)) continue;
    seen.add(current);

    const nextManagers = graph.get(current);
    if (!nextManagers) continue;
    for (const nextId of nextManagers) {
      if (!seen.has(nextId)) queue.push(nextId);
    }
  }

  return false;
}

export function getValidManagerOverrideCandidates(state, employeeId) {
  if (!state?.employees?.[employeeId]) return [];

  const graph = buildManagerGraph(state);
  const candidates = [];

  for (const emp of Object.values(state.employees)) {
    if (!emp?.id || emp.id === employeeId) continue;
    // employee -> candidate is valid iff candidate cannot already reach employee.
    if (!canReachEmployee(graph, emp.id, employeeId)) {
      candidates.push(emp);
    }
  }

  return candidates;
}

export function buildHierarchyTree(state, teamId) {
  const team = state.teams[teamId];
  if (!team) return null;

  const rootManagerId = team.manager || "__root__";

  // Group employees by their effective manager
  const childrenByManager = new Map(); // managerId -> [ {employee, isOverride} ]
  for (const member of team.members) {
    const emp = state.employees[member.id];
    if (!emp) continue;
    const effectiveManagerId = member.managerOverride ?? rootManagerId;
    const isOverride = !!member.managerOverride && member.managerOverride !== team.manager;
    if (!childrenByManager.has(effectiveManagerId)) childrenByManager.set(effectiveManagerId, []);
    childrenByManager.get(effectiveManagerId).push({ employee: emp, isOverride, teamId });
  }

  // Build nested subtrees grouped by their effective parent manager.
  // A nested team's managerOverride indicates which person in this tree that
  // team's manager reports to; if absent, it reports to the root manager.
  const nestedByManager = new Map(); // managerId -> [ {subtree, isOverride} ]
  for (const m of team.subTeams) {
    const nestedTeam = state.teams[m.id];
    if (!nestedTeam) continue;
    const subtree = buildHierarchyTree(state, m.id);
    if (!subtree) continue;
    const effectiveParent = nestedTeam.managerOverride ?? rootManagerId;
    if (!nestedByManager.has(effectiveParent)) nestedByManager.set(effectiveParent, []);
    nestedByManager.get(effectiveParent).push({ subtree, isOverride: !!nestedTeam.managerOverride });
  }

  const placedTeams = new Set();

  function buildChildNodes(managerId, path = new Set()) {
    const nextPath = new Set(path);
    nextPath.add(managerId);

    const empNodes = (childrenByManager.get(managerId) || []).map(({ employee, isOverride: io, teamId: tid }) => {
      // Circular override chains (A -> B -> A) should render safely, not recurse forever.
      const isCycle = nextPath.has(employee.id);
      return {
        employee,
        children: isCycle ? [] : buildChildNodes(employee.id, nextPath),
        isOverride: io,
        teamId: tid,
        type: "employee",
      };
    });
    const teamNodes = (nestedByManager.get(managerId) || []).map(({ subtree, isOverride: io }) => {
      placedTeams.add(subtree.teamId);
      return { ...subtree, type: "team", isOverride: io };
    });
    return [...empNodes, ...teamNodes];
  }

  const directChildren = buildChildNodes(rootManagerId);

  // Orphaned employees: their managerOverride points to someone not in this tree
  const allAccountedFor = new Set();
  function collectIds(nodes) {
    for (const n of nodes) {
      if (n.employee) allAccountedFor.add(n.employee.id);
      if (n.children) collectIds(n.children);
    }
  }
  collectIds(directChildren);

  const orphanEmps = [];
  for (const [, reports] of childrenByManager) {
    for (const r of reports) {
      if (!allAccountedFor.has(r.employee.id)) {
        orphanEmps.push({ employee: r.employee, children: [], isOverride: r.isOverride, teamId: r.teamId, type: "employee" });
      }
    }
  }

  // Orphaned nested teams: their managerOverride points to someone not in this tree
  const orphanTeams = [];
  for (const [, items] of nestedByManager) {
    for (const { subtree, isOverride: io } of items) {
      if (!placedTeams.has(subtree.teamId)) {
        orphanTeams.push({ ...subtree, type: "team", isOverride: io });
      }
    }
  }

  return {
    employee: team.manager ? state.employees[team.manager] : null,
    children: [...directChildren, ...orphanEmps, ...orphanTeams],
    isOverride: !!team.managerOverride,
    managerOverride: team.managerOverride || null,
    teamId,
    teamName: team.name,
    teamColor: team.color,
    type: "root",
  };
}

export function computeTeamStats(state, teamId) {
  const team = state.teams[teamId];
  if (!team) return null;
  const allIds = collectAllEmployeesInTeam(state.teams, teamId);
  const unique = [...new Set(allIds)];
  const roles = {};
  const timezones = {};
  for (const id of unique) {
    const emp = state.employees[id];
    if (!emp) continue;
    roles[emp.role] = (roles[emp.role] || 0) + 1;
    timezones[emp.timezone] = (timezones[emp.timezone] || 0) + 1;
  }
  const nestedStats = [];
  for (const sub of team.subTeams) {
    nestedStats.push(computeTeamStats(state, sub.id));
  }
  return {
    teamId: team.id,
    name: team.name,
    color: team.color,
    totalPeople: unique.length,
    roles,
    timezones,
    nestedStats,
  };
}

export function computeGlobalStats(state) {
  const allAssignedIds = new Set();
  for (const teamId of state.rootTeams) {
    for (const id of collectAllEmployeesInTeam(state.teams, teamId)) {
      allAssignedIds.add(id);
    }
  }
  const allIds = [...allAssignedIds, ...state.unassignedEmployees];
  const unique = [...new Set(allIds)];
  const roles = {};
  const timezones = {};
  for (const id of unique) {
    const emp = state.employees[id];
    if (!emp) continue;
    roles[emp.role] = (roles[emp.role] || 0) + 1;
    timezones[emp.timezone] = (timezones[emp.timezone] || 0) + 1;
  }
  return {
    totalPeople: unique.length,
    totalAssigned: allAssignedIds.size,
    totalUnassigned: state.unassignedEmployees.length,
    teamCount: Object.keys(state.teams).length,
    roles,
    timezones,
  };
}

export function computeManagerChanges(state) {
  const changes = [];
  const unchanged = [];
  const noOriginal = [];

  for (const emp of Object.values(state.employees)) {
    if (emp.requested) continue; // skip open positions

    if (!emp.currentManager) {
      noOriginal.push(emp);
      continue;
    }

    // Find new manager(s) for this employee
    const newManagerNames = new Set();
    for (const team of Object.values(state.teams)) {
      if (team.manager === emp.id) continue; // they are the manager here, not a report
      const memberEntry = team.members.find((m) => m.id === emp.id);
      if (memberEntry) {
        const effectiveManagerId = memberEntry.managerOverride ?? team.manager;
        if (effectiveManagerId && state.employees[effectiveManagerId]) {
          newManagerNames.add(state.employees[effectiveManagerId].name);
        }
      }
    }

    if (newManagerNames.size === 0) {
      // Unassigned or in team with no manager
      changes.push({ employee: emp, from: emp.currentManager, to: null });
    } else if (!newManagerNames.has(emp.currentManager)) {
      changes.push({ employee: emp, from: emp.currentManager, to: [...newManagerNames].join(", ") });
    } else {
      unchanged.push(emp);
    }
  }

  const tracked = changes.length + unchanged.length;
  return { changes, unchanged, noOriginal, tracked };
}
