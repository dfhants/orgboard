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
  findParentTeam,
  buildHierarchyTree,
  getValidManagerOverrideCandidates,
  computeTeamStats,
  computeGlobalStats,
  computeManagerChanges,
} from "../src/team-logic.mjs";
import { makeEmployee, makeTeam } from "./test-helpers.mjs";

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

  it("preserves override pointing to an existing employee even if they are not a team manager", () => {
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
    assert.equal(state.teams.t1.members[0].managerOverride, "p3");
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

  it("preserves team.managerOverride pointing to an existing employee", () => {
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
    assert.equal(state.teams.t1.managerOverride, "p2");
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

  it("removes self-referential member overrides", () => {
    const state = {
      employees: {
        p1: makeEmployee("p1"),
        p2: makeEmployee("p2"),
      },
      teams: {
        t1: makeTeam("t1", {
          manager: "p1",
          members: [{ id: "p2", managerOverride: "p2" }],
        }),
      },
    };
    cleanupManagerOverrides(state);
    assert.equal(state.teams.t1.members[0].managerOverride, undefined);
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

  it("moves an overridden manager together with their directs", () => {
    const state = {
      employees: {
        p1: makeEmployee("p1", { name: "Root" }),
        p2: makeEmployee("p2", { name: "Manager A" }),
        p3: makeEmployee("p3", { name: "Report" }),
        p4: makeEmployee("p4", { name: "Manager B" }),
      },
      teams: {
        t1: makeTeam("t1", {
          manager: "p1",
          members: [
            { id: "p2", managerOverride: "p4" },
            { id: "p3", managerOverride: "p2" },
            { id: "p4" },
          ],
        }),
      },
    };

    const tree = buildHierarchyTree(state, "t1");
    const p4Node = tree.children.find((c) => c.employee?.id === "p4");
    assert.ok(p4Node, "manager B should remain a direct child of root");

    const p2Node = p4Node.children.find((c) => c.employee?.id === "p2");
    assert.ok(p2Node, "manager A should move under manager B");
    assert.equal(p2Node.isOverride, true);

    const p3Node = p2Node.children.find((c) => c.employee?.id === "p3");
    assert.ok(p3Node, "report should stay under manager A after the move");
    assert.equal(p3Node.isOverride, true);
  });

  it("handles circular override chains without dropping people", () => {
    const state = {
      employees: {
        p1: makeEmployee("p1", { name: "Root" }),
        p2: makeEmployee("p2", { name: "A" }),
        p3: makeEmployee("p3", { name: "B" }),
      },
      teams: {
        t1: makeTeam("t1", {
          manager: "p1",
          members: [
            { id: "p2", managerOverride: "p3" },
            { id: "p3", managerOverride: "p2" },
          ],
        }),
      },
    };

    const tree = buildHierarchyTree(state, "t1");
    const seen = new Set();
    (function walk(node) {
      if (!node) return;
      if (node.employee?.id) seen.add(node.employee.id);
      for (const child of node.children || []) walk(child);
    })(tree);

    assert.equal(seen.has("p2"), true, "p2 should still be present in hierarchy output");
    assert.equal(seen.has("p3"), true, "p3 should still be present in hierarchy output");
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

  it("nested team with managerOverride appears under that manager, not at root", () => {
    const t2 = makeTeam("t2", { name: "Sub", manager: "p3", members: [] });
    t2.managerOverride = "p2"; // t2's manager reports to p2, not p1
    const state = {
      employees: {
        p1: makeEmployee("p1", { name: "Root Manager" }),
        p2: makeEmployee("p2", { name: "Middle Manager" }),
        p3: makeEmployee("p3", { name: "Sub Manager" }),
      },
      teams: {
        t1: makeTeam("t1", {
          manager: "p1",
          members: [{ id: "p2" }],
          subTeams: [{ id: "t2" }],
        }),
        t2,
      },
    };
    const tree = buildHierarchyTree(state, "t1");
    // p2 should be a direct child of root (p1)
    const p2Node = tree.children.find((c) => c.employee?.id === "p2");
    assert.ok(p2Node, "p2 should be a direct child of root");
    // t2 should be a child of p2, not a direct child of root
    const t2AtRoot = tree.children.find((c) => c.type === "team" && c.teamId === "t2");
    assert.equal(t2AtRoot, undefined, "t2 should not be at root when it has managerOverride");
    const t2UnderP2 = p2Node.children.find((c) => c.type === "team" && c.teamId === "t2");
    assert.ok(t2UnderP2, "t2 should appear under p2");
    assert.equal(t2UnderP2.isOverride, true, "t2 node should be marked as override");
  });

  it("nested team without managerOverride remains at root", () => {
    const state = {
      employees: {
        p1: makeEmployee("p1"),
        p2: makeEmployee("p2"),
      },
      teams: {
        t1: makeTeam("t1", {
          manager: "p1",
          members: [{ id: "p2" }],
          subTeams: [{ id: "t2" }],
        }),
        t2: makeTeam("t2", {
          name: "Sub",
          manager: null,
          members: [],
        }),
      },
    };
    const tree = buildHierarchyTree(state, "t1");
    const t2AtRoot = tree.children.find((c) => c.type === "team" && c.teamId === "t2");
    assert.ok(t2AtRoot, "t2 without managerOverride should remain under root manager");
    assert.equal(t2AtRoot.isOverride, false);
  });

  it("nested team with unreachable managerOverride falls back to root as orphan", () => {
    const t2orphan = makeTeam("t2", { name: "Sub", manager: "p3", members: [] });
    t2orphan.managerOverride = "p99"; // p99 does not exist in this tree
    const state = {
      employees: {
        p1: makeEmployee("p1"),
        p3: makeEmployee("p3"),
      },
      teams: {
        t1: makeTeam("t1", {
          manager: "p1",
          members: [],
          subTeams: [{ id: "t2" }],
        }),
        t2: t2orphan,
      },
    };
    // p99 doesn't exist in this tree, so t2 should still appear at top level as orphan
    const tree = buildHierarchyTree(state, "t1");
    const t2Node = tree.children.find((c) => c.type === "team" && c.teamId === "t2");
    assert.ok(t2Node, "orphaned t2 should still appear in the tree");
  });
});

// ─── getValidManagerOverrideCandidates ───────────────────────────────

describe("getValidManagerOverrideCandidates", () => {
  it("allows anyone except self when there is no cycle", () => {
    const state = {
      employees: {
        p1: makeEmployee("p1"),
        p2: makeEmployee("p2"),
        p3: makeEmployee("p3"),
      },
      teams: {
        t1: makeTeam("t1", {
          manager: "p1",
          members: [{ id: "p2" }, { id: "p3" }],
        }),
      },
    };

    const ids = getValidManagerOverrideCandidates(state, "p2").map((e) => e.id).sort();
    assert.deepEqual(ids, ["p1", "p3"]);
  });

  it("rejects direct cycle candidate", () => {
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
            { id: "p2", managerOverride: "p3" },
            { id: "p3" },
          ],
        }),
      },
    };

    const ids = getValidManagerOverrideCandidates(state, "p3").map((e) => e.id).sort();
    assert.equal(ids.includes("p2"), false, "p2 would create p3 -> p2 -> p3 cycle");
  });

  it("rejects indirect cycle candidates", () => {
    const state = {
      employees: {
        p1: makeEmployee("p1"),
        p2: makeEmployee("p2"),
        p3: makeEmployee("p3"),
        p4: makeEmployee("p4"),
      },
      teams: {
        t1: makeTeam("t1", {
          manager: "p1",
          members: [
            { id: "p2", managerOverride: "p3" }, // p2 -> p3
            { id: "p3", managerOverride: "p4" }, // p3 -> p4
            { id: "p4" },
          ],
        }),
      },
    };

    const ids = getValidManagerOverrideCandidates(state, "p4").map((e) => e.id).sort();
    assert.equal(ids.includes("p2"), false, "p4 -> p2 would create p2 -> p3 -> p4 -> p2 cycle");
  });

  it("returns empty for unknown employee", () => {
    const state = {
      employees: { p1: makeEmployee("p1") },
      teams: { t1: makeTeam("t1", { manager: "p1" }) },
    };
    assert.deepEqual(getValidManagerOverrideCandidates(state, "missing"), []);
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

// ─── findParentTeam ─────────────────────────────────────────────────

describe("findParentTeam", () => {
  it("returns parent team when child is a sub-team", () => {
    const teams = {
      t1: { id: "t1", name: "Parent", subTeams: [{ id: "t2" }], members: [] },
      t2: { id: "t2", name: "Child", subTeams: [], members: [] },
    };
    const parent = findParentTeam(teams, "t2");
    assert.equal(parent.id, "t1");
  });

  it("returns null for a root team with no parent", () => {
    const teams = {
      t1: { id: "t1", name: "Root", subTeams: [], members: [] },
    };
    assert.equal(findParentTeam(teams, "t1"), null);
  });

  it("returns null for non-existent team id", () => {
    const teams = {
      t1: { id: "t1", name: "Only", subTeams: [], members: [] },
    };
    assert.equal(findParentTeam(teams, "t99"), null);
  });

  it("finds parent in deeply nested structure", () => {
    const teams = {
      t1: { id: "t1", name: "Top", subTeams: [{ id: "t2" }], members: [] },
      t2: { id: "t2", name: "Mid", subTeams: [{ id: "t3" }], members: [] },
      t3: { id: "t3", name: "Bottom", subTeams: [], members: [] },
    };
    assert.equal(findParentTeam(teams, "t3").id, "t2");
    assert.equal(findParentTeam(teams, "t2").id, "t1");
  });
});
