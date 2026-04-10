import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isTeamInside,
  normalizeInsertIndex,
  cleanupManagerOverrides,
  countDirectEmployees,
  countNestedTeams,
  countTeamMemberships,
  collectAllEmployeesInTeam,
  buildHierarchyTree,
  computeTeamStats,
  computeGlobalStats,
  computeManagerChanges,
} from "../src/team-logic.mjs";

// ─── Fixture helpers ─────────────────────────────────────────────────
//
// Minimal state objects modeled on createInitialState() in app.js.
// Each test builds only the parts it needs.

function makeEmployee(id, opts = {}) {
  return {
    id,
    name: opts.name ?? `Employee ${id}`,
    role: opts.role ?? "Engineer",
    timezone: opts.timezone ?? "GMT (UTC+0)",
    location: opts.location ?? "London",
    notes: "",
    requested: false,
  };
}

function makeTeam(id, opts = {}) {
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

// ─── isTeamInside ────────────────────────────────────────────────────
//
//  t1 → members: [t2]
//  t2 → members: [t3]
//  t3 → members: []
//  t4 → members: [] (unrelated)

describe("isTeamInside", () => {
  const teams = {
    t1: makeTeam("t1", { subTeams: [{ id: "t2" }] }),
    t2: makeTeam("t2", { subTeams: [{ id: "t3" }] }),
    t3: makeTeam("t3"),
    t4: makeTeam("t4"),
  };

  it("returns true for direct nesting", () => {
    assert.equal(isTeamInside(teams, "t1", "t2"), true);
  });

  it("returns true for transitive nesting (t3 inside t1 via t2)", () => {
    assert.equal(isTeamInside(teams, "t1", "t3"), true);
  });

  it("returns false for unrelated teams", () => {
    assert.equal(isTeamInside(teams, "t1", "t4"), false);
  });

  it("returns false for same team (not inside itself)", () => {
    assert.equal(isTeamInside(teams, "t1", "t1"), false);
  });

  it("returns false when checking parent from child", () => {
    assert.equal(isTeamInside(teams, "t3", "t1"), false);
  });

  it("handles empty members gracefully", () => {
    assert.equal(isTeamInside(teams, "t4", "t1"), false);
  });
});

// ─── normalizeInsertIndex ────────────────────────────────────────────

describe("normalizeInsertIndex", () => {
  const members = [{ id: "a" }, { id: "b" }, { id: "c" }]; // length 3

  it("returns index in valid range", () => {
    assert.equal(normalizeInsertIndex(members, 1), 1);
  });

  it("clamps to 0 for negative index", () => {
    assert.equal(normalizeInsertIndex(members, -5), 0);
  });

  it("clamps to length for oversized index", () => {
    assert.equal(normalizeInsertIndex(members, 100), 3);
  });

  it("returns length for NaN", () => {
    assert.equal(normalizeInsertIndex(members, NaN), 3);
  });

  it("returns length for undefined", () => {
    assert.equal(normalizeInsertIndex(members, undefined), 3);
  });

  it("returns length for non-number type", () => {
    assert.equal(normalizeInsertIndex(members, "2"), 3);
  });

  it("returns 0 for empty array with index 0", () => {
    assert.equal(normalizeInsertIndex([], 0), 0);
  });

  it("returns 0 for empty array with any index", () => {
    assert.equal(normalizeInsertIndex([], 5), 0);
  });
});

// ─── cleanupManagerOverrides ─────────────────────────────────────────

describe("cleanupManagerOverrides", () => {
  it("removes override matching team's actual manager", () => {
    const state = {
      employees: { p1: makeEmployee("p1"), p2: makeEmployee("p2") },
      teams: {
        t1: makeTeam("t1", {
          manager: "p1",
          members: [{ id: "p2", managerOverride: "p1" }],
        }),
      },
    };
    cleanupManagerOverrides(state);
    assert.equal(state.teams.t1.members[0].managerOverride, undefined);
  });

  it("removes override pointing to deleted manager", () => {
    const state = {
      employees: { p2: makeEmployee("p2") }, // p1 deleted
      teams: {
        t1: makeTeam("t1", {
          manager: null,
          members: [{ id: "p2", managerOverride: "p1" }],
        }),
      },
    };
    cleanupManagerOverrides(state);
    assert.equal(state.teams.t1.members[0].managerOverride, undefined);
  });

  it("removes override pointing to employee who is not a manager anywhere", () => {
    const state = {
      employees: {
        p1: makeEmployee("p1"),
        p2: makeEmployee("p2"),
        p3: makeEmployee("p3"),
      },
      teams: {
        t1: makeTeam("t1", {
          manager: "p1",
          members: [{ id: "p2", managerOverride: "p3" }],
        }),
      },
    };
    cleanupManagerOverrides(state);
    assert.equal(state.teams.t1.members[0].managerOverride, undefined);
  });

  it("preserves valid overrides", () => {
    const state = {
      employees: {
        p1: makeEmployee("p1"),
        p2: makeEmployee("p2"),
        p3: makeEmployee("p3"),
      },
      teams: {
        t1: makeTeam("t1", {
          manager: "p1",
          members: [{ id: "p2", managerOverride: "p3" }],
        }),
        t2: makeTeam("t2", { manager: "p3", members: [] }),
      },
    };
    cleanupManagerOverrides(state);
    assert.equal(state.teams.t1.members[0].managerOverride, "p3");
  });

  it("skips non-employee members", () => {
    const state = {
      employees: { p1: makeEmployee("p1") },
      teams: {
        t1: makeTeam("t1", {
          manager: "p1",
          members: [],
          subTeams: [{ id: "t2" }],
        }),
        t2: makeTeam("t2"),
      },
    };
    // Should not throw
    cleanupManagerOverrides(state);
  });

  it("removes team.managerOverride pointing to deleted employee", () => {
    const state = {
      employees: { p1: makeEmployee("p1") },
      teams: {
        t1: makeTeam("t1", { manager: "p1" }),
      },
    };
    state.teams.t1.managerOverride = "p99"; // p99 doesn't exist
    cleanupManagerOverrides(state);
    assert.equal(state.teams.t1.managerOverride, undefined);
  });

  it("removes team.managerOverride pointing to non-manager", () => {
    const state = {
      employees: {
        p1: makeEmployee("p1"),
        p2: makeEmployee("p2"),
      },
      teams: {
        t1: makeTeam("t1", { manager: "p1" }),
      },
    };
    state.teams.t1.managerOverride = "p2"; // p2 is not a manager of any team
    cleanupManagerOverrides(state);
    assert.equal(state.teams.t1.managerOverride, undefined);
  });

  it("preserves valid team.managerOverride", () => {
    const state = {
      employees: {
        p1: makeEmployee("p1"),
        p3: makeEmployee("p3"),
      },
      teams: {
        t1: makeTeam("t1", { manager: "p1" }),
        t2: makeTeam("t2", { manager: "p3", members: [] }),
      },
    };
    state.teams.t1.managerOverride = "p3";
    cleanupManagerOverrides(state);
    assert.equal(state.teams.t1.managerOverride, "p3");
  });
});

// ─── countDirectEmployees ────────────────────────────────────────────

describe("countDirectEmployees", () => {
  it("counts only employee members", () => {
    const team = makeTeam("t1", {
      members: [
        { id: "p1" },
        { id: "p2" },
      ],
      subTeams: [{ id: "t2" }],
    });
    assert.equal(countDirectEmployees(team), 2);
  });

  it("returns 0 for empty members", () => {
    assert.equal(countDirectEmployees(makeTeam("t1")), 0);
  });
});

// ─── countNestedTeams ────────────────────────────────────────────────

describe("countNestedTeams", () => {
  it("counts only team members", () => {
    const team = makeTeam("t1", {
      members: [
        { id: "p1" },
      ],
      subTeams: [{ id: "t2" }, { id: "t3" }],
    });
    assert.equal(countNestedTeams(team), 2);
  });

  it("returns 0 for empty members", () => {
    assert.equal(countNestedTeams(makeTeam("t1")), 0);
  });
});

// ─── countTeamMemberships ────────────────────────────────────────────

describe("countTeamMemberships", () => {
  it("counts both manager slot and member-list slot", () => {
    const teams = {
      t1: makeTeam("t1", {
        manager: "p1",
        members: [{ id: "p1" }],
      }),
    };
    assert.equal(countTeamMemberships(teams, "p1"), 2);
  });

  it("counts across multiple teams", () => {
    const teams = {
      t1: makeTeam("t1", { manager: "p1" }),
      t2: makeTeam("t2", { members: [{ id: "p1" }] }),
    };
    assert.equal(countTeamMemberships(teams, "p1"), 2);
  });

  it("returns 0 for unassigned employee", () => {
    const teams = {
      t1: makeTeam("t1", { manager: "p2", members: [] }),
    };
    assert.equal(countTeamMemberships(teams, "p99"), 0);
  });
});

// ─── collectAllEmployeesInTeam ───────────────────────────────────────
//
//  t1 → manager: p1, members: [p2, t2]
//  t2 → manager: p3, members: [p4]

describe("collectAllEmployeesInTeam", () => {
  const teams = {
    t1: makeTeam("t1", {
      manager: "p1",
      members: [
        { id: "p2" },
      ],
      subTeams: [{ id: "t2" }],
    }),
    t2: makeTeam("t2", {
      manager: "p3",
      members: [{ id: "p4" }],
    }),
  };

  it("collects recursively through nested teams", () => {
    const ids = collectAllEmployeesInTeam(teams, "t1");
    assert.deepEqual(ids.sort(), ["p1", "p2", "p3", "p4"]);
  });

  it("includes managers", () => {
    const ids = collectAllEmployeesInTeam(teams, "t2");
    assert.deepEqual(ids.sort(), ["p3", "p4"]);
  });

  it("returns empty for non-existent team", () => {
    assert.deepEqual(collectAllEmployeesInTeam(teams, "t99"), []);
  });

  it("returns empty for team with no manager and no members", () => {
    const t = { t1: makeTeam("t1") };
    assert.deepEqual(collectAllEmployeesInTeam(t, "t1"), []);
  });
});

// ─── buildHierarchyTree ─────────────────────────────────────────────

describe("buildHierarchyTree", () => {
  it("returns correct tree with manager as root", () => {
    const state = {
      employees: {
        p1: makeEmployee("p1", { name: "Manager" }),
        p2: makeEmployee("p2", { name: "Report" }),
      },
      teams: {
        t1: makeTeam("t1", {
          name: "Alpha",
          manager: "p1",
          members: [{ id: "p2" }],
          color: "#abc",
        }),
      },
    };
    const tree = buildHierarchyTree(state, "t1");
    assert.equal(tree.type, "root");
    assert.equal(tree.employee.id, "p1");
    assert.equal(tree.teamName, "Alpha");
    assert.equal(tree.teamColor, "#abc");
    assert.equal(tree.children.length, 1);
    assert.equal(tree.children[0].employee.id, "p2");
    assert.equal(tree.children[0].type, "employee");
  });

  it("groups employees by effective manager (handles overrides)", () => {
    const state = {
      employees: {
        p1: makeEmployee("p1"),
        p2: makeEmployee("p2"),
        p3: makeEmployee("p3"),
      },
      teams: {
        t1: makeTeam("t1", {
          manager: "p1",
          members: [
            { id: "p2" },
            { id: "p3", managerOverride: "p2" },
          ],
        }),
      },
    };
    const tree = buildHierarchyTree(state, "t1");
    // p2 reports to p1 (root), p3 reports to p2 (override)
    assert.equal(tree.children.length, 1); // only p2 as direct child
    const p2Node = tree.children[0];
    assert.equal(p2Node.employee.id, "p2");
    assert.equal(p2Node.children.length, 1);
    assert.equal(p2Node.children[0].employee.id, "p3");
    assert.equal(p2Node.children[0].isOverride, true);
  });

  it("includes nested team subtrees", () => {
    const state = {
      employees: {
        p1: makeEmployee("p1"),
        p2: makeEmployee("p2"),
      },
      teams: {
        t1: makeTeam("t1", {
          manager: "p1",
          members: [],
          subTeams: [{ id: "t2" }],
        }),
        t2: makeTeam("t2", {
          name: "Sub",
          manager: "p2",
          members: [],
          color: "#def",
        }),
      },
    };
    const tree = buildHierarchyTree(state, "t1");
    const nestedNode = tree.children.find((c) => c.type === "team");
    assert.ok(nestedNode);
    assert.equal(nestedNode.teamName, "Sub");
  });

  it("handles missing manager (null)", () => {
    const state = {
      employees: { p1: makeEmployee("p1") },
      teams: {
        t1: makeTeam("t1", {
          manager: null,
          members: [{ id: "p1" }],
        }),
      },
    };
    const tree = buildHierarchyTree(state, "t1");
    assert.equal(tree.employee, null);
    assert.equal(tree.children.length, 1);
    assert.equal(tree.children[0].employee.id, "p1");
  });

  it("returns null for non-existent team", () => {
    const state = { employees: {}, teams: {} };
    assert.equal(buildHierarchyTree(state, "t99"), null);
  });
});

// ─── computeTeamStats ────────────────────────────────────────────────

describe("computeTeamStats", () => {
  const state = {
    employees: {
      p1: makeEmployee("p1", { role: "Engineer", timezone: "GMT (UTC+0)" }),
      p2: makeEmployee("p2", { role: "Designer", timezone: "PST (UTC−8)" }),
      p3: makeEmployee("p3", { role: "Engineer", timezone: "GMT (UTC+0)" }),
    },
    teams: {
      t1: makeTeam("t1", {
        name: "Alpha",
        manager: "p1",
        members: [
          { id: "p2" },
        ],
        subTeams: [{ id: "t2" }],
        color: "#abc",
      }),
      t2: makeTeam("t2", {
        name: "Beta",
        manager: "p3",
        members: [],
        color: "#def",
      }),
    },
  };

  it("aggregates roles correctly", () => {
    const stats = computeTeamStats(state, "t1");
    assert.equal(stats.roles["Engineer"], 2);
    assert.equal(stats.roles["Designer"], 1);
  });

  it("aggregates timezones correctly", () => {
    const stats = computeTeamStats(state, "t1");
    assert.equal(stats.timezones["GMT (UTC+0)"], 2);
    assert.equal(stats.timezones["PST (UTC−8)"], 1);
  });

  it("counts total unique people", () => {
    const stats = computeTeamStats(state, "t1");
    assert.equal(stats.totalPeople, 3);
  });

  it("includes nested team stats", () => {
    const stats = computeTeamStats(state, "t1");
    assert.equal(stats.nestedStats.length, 1);
    assert.equal(stats.nestedStats[0].name, "Beta");
    assert.equal(stats.nestedStats[0].totalPeople, 1);
  });

  it("returns null for non-existent team", () => {
    assert.equal(computeTeamStats(state, "t99"), null);
  });
});

// ─── computeGlobalStats ─────────────────────────────────────────────

describe("computeGlobalStats", () => {
  it("includes both assigned and unassigned employees", () => {
    const state = {
      employees: {
        p1: makeEmployee("p1", { role: "Engineer", timezone: "GMT (UTC+0)" }),
        p2: makeEmployee("p2", { role: "Designer", timezone: "PST (UTC−8)" }),
        p3: makeEmployee("p3", { role: "Intern", timezone: "JST (UTC+9)" }),
      },
      teams: {
        t1: makeTeam("t1", {
          manager: "p1",
          members: [{ id: "p2" }],
        }),
      },
      rootTeams: ["t1"],
      unassignedEmployees: ["p3"],
    };
    const stats = computeGlobalStats(state);
    assert.equal(stats.totalPeople, 3);
    assert.equal(stats.totalAssigned, 2);
    assert.equal(stats.totalUnassigned, 1);
    assert.equal(stats.teamCount, 1);
  });

  it("aggregates roles and timezones across all employees", () => {
    const state = {
      employees: {
        p1: makeEmployee("p1", { role: "Engineer", timezone: "GMT (UTC+0)" }),
        p2: makeEmployee("p2", { role: "Engineer", timezone: "PST (UTC−8)" }),
      },
      teams: {
        t1: makeTeam("t1", { manager: "p1", members: [] }),
      },
      rootTeams: ["t1"],
      unassignedEmployees: ["p2"],
    };
    const stats = computeGlobalStats(state);
    assert.equal(stats.roles["Engineer"], 2);
    assert.equal(stats.timezones["GMT (UTC+0)"], 1);
    assert.equal(stats.timezones["PST (UTC−8)"], 1);
  });

  it("handles empty state", () => {
    const state = {
      employees: {},
      teams: {},
      rootTeams: [],
      unassignedEmployees: [],
    };
    const stats = computeGlobalStats(state);
    assert.equal(stats.totalPeople, 0);
    assert.equal(stats.totalAssigned, 0);
    assert.equal(stats.totalUnassigned, 0);
    assert.equal(stats.teamCount, 0);
  });
});

// ─── computeManagerChanges ───

describe("computeManagerChanges", () => {
  it("detects when an employee's manager changed", () => {
    const state = {
      employees: {
        p1: makeEmployee("p1", { name: "Alice" }),
        p2: { ...makeEmployee("p2", { name: "Bob" }), currentManager: "Charlie" },
      },
      teams: {
        t1: makeTeam("t1", { manager: "p1", members: [{ id: "p2" }] }),
      },
      rootTeams: ["t1"],
      unassignedEmployees: [],
    };
    const { changes, unchanged } = computeManagerChanges(state);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].employee.id, "p2");
    assert.equal(changes[0].from, "Charlie");
    assert.equal(changes[0].to, "Alice");
    assert.equal(unchanged.length, 0);
  });

  it("reports no change when manager is the same", () => {
    const state = {
      employees: {
        p1: makeEmployee("p1", { name: "Alice" }),
        p2: { ...makeEmployee("p2", { name: "Bob" }), currentManager: "Alice" },
      },
      teams: {
        t1: makeTeam("t1", { manager: "p1", members: [{ id: "p2" }] }),
      },
      rootTeams: ["t1"],
      unassignedEmployees: [],
    };
    const { changes, unchanged } = computeManagerChanges(state);
    assert.equal(changes.length, 0);
    assert.equal(unchanged.length, 1);
  });

  it("reports unassigned employees as changed", () => {
    const state = {
      employees: {
        p1: { ...makeEmployee("p1", { name: "Alice" }), currentManager: "Charlie" },
      },
      teams: {},
      rootTeams: [],
      unassignedEmployees: ["p1"],
    };
    const { changes } = computeManagerChanges(state);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].to, null);
  });

  it("skips employees with no currentManager", () => {
    const state = {
      employees: {
        p1: makeEmployee("p1", { name: "Alice" }),
        p2: { ...makeEmployee("p2", { name: "Bob" }), currentManager: "" },
      },
      teams: {
        t1: makeTeam("t1", { manager: "p1", members: [{ id: "p2" }] }),
      },
      rootTeams: ["t1"],
      unassignedEmployees: [],
    };
    const { changes, noOriginal } = computeManagerChanges(state);
    assert.equal(changes.length, 0);
    assert.equal(noOriginal.length, 2);
  });

  it("skips requested positions", () => {
    const state = {
      employees: {
        p1: makeEmployee("p1", { name: "Alice" }),
        p2: { ...makeEmployee("p2", { name: "Bob" }), currentManager: "Charlie", requested: true },
      },
      teams: {
        t1: makeTeam("t1", { manager: "p1", members: [{ id: "p2" }] }),
      },
      rootTeams: ["t1"],
      unassignedEmployees: [],
    };
    const { changes } = computeManagerChanges(state);
    assert.equal(changes.length, 0);
  });

  it("considers managerOverride when computing new manager", () => {
    const state = {
      employees: {
        p1: makeEmployee("p1", { name: "Alice" }),
        p2: makeEmployee("p2", { name: "Carol" }),
        p3: { ...makeEmployee("p3", { name: "Dave" }), currentManager: "Carol" },
      },
      teams: {
        t1: makeTeam("t1", { manager: "p1", members: [{ id: "p3", managerOverride: "p2" }] }),
      },
      rootTeams: ["t1"],
      unassignedEmployees: [],
    };
    const { changes, unchanged } = computeManagerChanges(state);
    assert.equal(changes.length, 0);
    assert.equal(unchanged.length, 1);
  });

  it("handles multi-team membership (unchanged if any team matches)", () => {
    const state = {
      employees: {
        p1: makeEmployee("p1", { name: "Alice" }),
        p2: makeEmployee("p2", { name: "Carol" }),
        p3: { ...makeEmployee("p3", { name: "Dave" }), currentManager: "Alice" },
      },
      teams: {
        t1: makeTeam("t1", { manager: "p1", members: [{ id: "p3" }] }),
        t2: makeTeam("t2", { manager: "p2", members: [{ id: "p3" }] }),
      },
      rootTeams: ["t1", "t2"],
      unassignedEmployees: [],
    };
    const { changes, unchanged } = computeManagerChanges(state);
    assert.equal(changes.length, 0);
    assert.equal(unchanged.length, 1);
  });

  it("returns correct tracked count", () => {
    const state = {
      employees: {
        p1: makeEmployee("p1", { name: "Alice" }),
        p2: { ...makeEmployee("p2", { name: "Bob" }), currentManager: "Alice" },
        p3: { ...makeEmployee("p3", { name: "Charlie" }), currentManager: "Diana" },
        p4: { ...makeEmployee("p4", { name: "Diana" }), currentManager: "" },
      },
      teams: {
        t1: makeTeam("t1", { manager: "p1", members: [{ id: "p2" }, { id: "p3" }] }),
      },
      rootTeams: ["t1"],
      unassignedEmployees: ["p4"],
    };
    const { changes, unchanged, noOriginal, tracked } = computeManagerChanges(state);
    assert.equal(tracked, 2);
    assert.equal(unchanged.length, 1);
    assert.equal(changes.length, 1);
    assert.equal(noOriginal.length, 2);
  });

  it("handles empty state", () => {
    const state = { employees: {}, teams: {}, rootTeams: [], unassignedEmployees: [] };
    const { changes, unchanged, noOriginal, tracked } = computeManagerChanges(state);
    assert.equal(tracked, 0);
    assert.equal(changes.length, 0);
    assert.equal(unchanged.length, 0);
    assert.equal(noOriginal.length, 0);
  });
});
