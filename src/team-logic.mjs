export function isTeamInside(teams, draggedTeamId, targetTeamId) {
  const queue = [draggedTeamId];

  while (queue.length > 0) {
    const current = queue.shift();
    const currentTeam = teams[current];
    if (!currentTeam) continue;
    for (const member of currentTeam.members) {
      if (member.type !== "team") {
        continue;
      }
      if (member.id === targetTeamId) {
        return true;
      }
      queue.push(member.id);
    }
  }

  return false;
}

export function normalizeInsertIndex(members, insertIndex) {
  if (typeof insertIndex !== "number" || Number.isNaN(insertIndex)) {
    return members.length;
  }

  return Math.max(0, Math.min(insertIndex, members.length));
}

export function cleanupManagerOverrides(state) {
  for (const team of Object.values(state.teams)) {
    // Clean up team manager's own override
    if (team.managerOverride) {
      if (!state.employees[team.managerOverride]) {
        delete team.managerOverride;
      } else {
        const stillManager = Object.values(state.teams).some((t) => t.manager === team.managerOverride);
        if (!stillManager) {
          delete team.managerOverride;
        }
      }
    }
    // Clean up member overrides
    for (const member of team.members) {
      if (member.type !== "employee" || !member.managerOverride) continue;
      // Remove if override matches team's actual manager
      if (member.managerOverride === team.manager) {
        delete member.managerOverride;
        continue;
      }
      // Remove if overridden manager no longer exists
      if (!state.employees[member.managerOverride]) {
        delete member.managerOverride;
        continue;
      }
      // Remove if overridden manager is no longer in any manager slot
      const stillManager = Object.values(state.teams).some((t) => t.manager === member.managerOverride);
      if (!stillManager) {
        delete member.managerOverride;
      }
    }
  }
}

export function countNestedTeams(team) {
  return team.members.filter((member) => member.type === "team").length;
}

export function countDirectEmployees(team) {
  return team.members.filter((member) => member.type === "employee").length;
}

export function countTeamMemberships(teams, employeeId) {
  let count = 0;
  for (const team of Object.values(teams)) {
    if (team.manager === employeeId) count++;
    if (team.members.some((m) => m.type === "employee" && m.id === employeeId)) count++;
  }
  return count;
}

export function collectAllEmployeesInTeam(teams, teamId) {
  const team = teams[teamId];
  if (!team) return [];
  const ids = [];
  if (team.manager) ids.push(team.manager);
  for (const m of team.members) {
    if (m.type === "employee") {
      ids.push(m.id);
    } else if (m.type === "team") {
      ids.push(...collectAllEmployeesInTeam(teams, m.id));
    }
  }
  return ids;
}

export function buildHierarchyTree(state, teamId) {
  const team = state.teams[teamId];
  if (!team) return null;

  const managerEmp = team.manager ? state.employees[team.manager] : null;

  // Collect direct employee members
  const employeeMembers = team.members.filter((m) => m.type === "employee");
  // Collect nested teams
  const nestedTeamMembers = team.members.filter((m) => m.type === "team");

  // Group employees by their effective manager
  const childrenByManager = new Map(); // managerId -> [ {employee, isOverride} ]

  for (const member of employeeMembers) {
    const emp = state.employees[member.id];
    if (!emp) continue;
    const effectiveManagerId = member.managerOverride ?? (team.manager || "__root__");
    const isOverride = !!member.managerOverride && member.managerOverride !== team.manager;
    if (!childrenByManager.has(effectiveManagerId)) childrenByManager.set(effectiveManagerId, []);
    childrenByManager.get(effectiveManagerId).push({ employee: emp, isOverride, teamId });
  }

  // Build nested team subtrees
  const nestedTrees = nestedTeamMembers.map((m) => {
    const nested = state.teams[m.id];
    if (!nested) return null;
    const subtree = buildHierarchyTree(state, m.id);
    return subtree;
  }).filter(Boolean);

  // Build tree nodes for a given manager's direct reports
  function buildChildNodes(managerId) {
    const directReports = childrenByManager.get(managerId) || [];
    return directReports.map(({ employee, isOverride, teamId: tid }) => {
      // This employee might also be a manager elsewhere — check if anyone reports to them
      const subordinates = buildChildNodes(employee.id);
      return { employee, children: subordinates, isOverride, teamId: tid, type: "employee" };
    });
  }

  const rootManagerId = team.manager || "__root__";
  const directChildren = buildChildNodes(rootManagerId);

  // Add nested team subtrees as children of the root
  const nestedTreeNodes = nestedTrees.map((subtree) => ({
    ...subtree,
    type: "team",
    isOverride: false,
  }));

  // Also attach any employees whose override points to a manager NOT in this tree (orphans go to root)
  const allAccountedFor = new Set();
  function collectIds(nodes) {
    for (const n of nodes) {
      if (n.employee) allAccountedFor.add(n.employee.id);
      if (n.children) collectIds(n.children);
    }
  }
  collectIds(directChildren);

  const orphans = [];
  for (const [managerId, reports] of childrenByManager) {
    for (const r of reports) {
      if (!allAccountedFor.has(r.employee.id)) {
        orphans.push({ employee: r.employee, children: [], isOverride: r.isOverride, teamId: r.teamId, type: "employee" });
      }
    }
  }

  return {
    employee: managerEmp,
    children: [...directChildren, ...nestedTreeNodes, ...orphans],
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
  for (const m of team.members) {
    if (m.type === "team") {
      nestedStats.push(computeTeamStats(state, m.id));
    }
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
      const memberEntry = team.members.find((m) => m.type === "employee" && m.id === emp.id);
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
