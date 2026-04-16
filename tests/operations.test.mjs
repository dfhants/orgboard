import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  sortAllTeams, sortKeys,
  addRandomRootTeam, addRandomTeamToTeam,
  removeEmployeeFromCurrentLocation, removeTeamFromCurrentLocation,
  insertMember, insertSubTeam,
  moveEmployeeToTeam, moveEmployeeToRoster, moveTeamToTarget,
  deepCopyEmployee, deepCopyTeam,
  copyEmployeeToTeam, copyEmployeeToRoster, copyTeamToTarget,
  deleteEmployee, deleteAllUnassigned, deleteTeam,
  toggleTeamLayout,
} from "../src/operations.mjs";
import {
  state, createInitialState, createBlankState,
  setEmployeeSequence, setTeamSequence,
  getAllManagers, findMemberEntry,
} from "../src/state.mjs";
import { makeEmployee, resetState } from "./test-helpers.mjs";

// ─── Fixture helpers ─────────────────────────────────────────────────

function setupState(employees, team) {
  resetState();

  // Populate
  for (const e of employees) state.employees[e.id] = e;
  state.teams[team.id] = team;
  state.rootTeams.push(team.id);
}

// ─── sortKeys ────────────────────────────────────────────────────────

describe("sortKeys", () => {
  it("exports expected keys", () => {
    assert.deepStrictEqual(
      Object.keys(sortKeys).sort(),
      ["level", "location", "name", "role", "timezone"]
    );
  });

  it("each key has a label and compare factory", () => {
    for (const [, entry] of Object.entries(sortKeys)) {
      assert.equal(typeof entry.label, "string");
      assert.equal(typeof entry.compare, "function");
      assert.equal(typeof entry.compare(1), "function");
    }
  });
});

// ─── sortAllTeams ────────────────────────────────────────────────────

describe("sortAllTeams", () => {
  const alice = makeEmployee("p1", { name: "Alice", role: "Designer", level: 5, timezone: "PST (UTC−8)", location: "San Francisco" });
  const bob = makeEmployee("p2", { name: "Bob", role: "Engineer", level: 7, timezone: "EST (UTC−5)", location: "New York" });
  const charlie = makeEmployee("p3", { name: "Charlie", role: "Analyst", level: 3, timezone: "CET (UTC+1)", location: "Berlin" });

  function makeTestTeam() {
    return {
      id: "t1",
      name: "Test",
      ownLayout: "expanded",
      manager: null,
      members: [{ id: "p2" }, { id: "p3" }, { id: "p1" }],
      subTeams: [],
      color: "#818cf8",
    };
  }

  function memberIds(teamId = "t1") {
    return state.teams[teamId].members.map((m) => m.id);
  }

  beforeEach(() => {
    setupState([alice, bob, charlie], makeTestTeam());
  });

  it("sorts by name ascending", () => {
    sortAllTeams([{ key: "name", direction: "asc" }]);
    assert.deepStrictEqual(memberIds(), ["p1", "p2", "p3"]); // Alice, Bob, Charlie
  });

  it("sorts by name descending", () => {
    sortAllTeams([{ key: "name", direction: "desc" }]);
    assert.deepStrictEqual(memberIds(), ["p3", "p2", "p1"]); // Charlie, Bob, Alice
  });

  it("sorts by role ascending", () => {
    sortAllTeams([{ key: "role", direction: "asc" }]);
    assert.deepStrictEqual(memberIds(), ["p3", "p1", "p2"]); // Analyst, Designer, Engineer
  });

  it("sorts by level ascending (low to high)", () => {
    sortAllTeams([{ key: "level", direction: "asc" }]);
    assert.deepStrictEqual(memberIds(), ["p3", "p1", "p2"]); // 3, 5, 7
  });

  it("sorts by level descending (high to low)", () => {
    sortAllTeams([{ key: "level", direction: "desc" }]);
    assert.deepStrictEqual(memberIds(), ["p2", "p1", "p3"]); // 7, 5, 3
  });

  it("sorts by timezone ascending (west to east)", () => {
    sortAllTeams([{ key: "timezone", direction: "asc" }]);
    assert.deepStrictEqual(memberIds(), ["p1", "p2", "p3"]); // UTC-8, UTC-5, UTC+1
  });

  it("sorts by timezone descending (east to west)", () => {
    sortAllTeams([{ key: "timezone", direction: "desc" }]);
    assert.deepStrictEqual(memberIds(), ["p3", "p2", "p1"]); // UTC+1, UTC-5, UTC-8
  });

  it("sorts by location ascending", () => {
    sortAllTeams([{ key: "location", direction: "asc" }]);
    assert.deepStrictEqual(memberIds(), ["p3", "p2", "p1"]); // Berlin, New York, San Francisco
  });

  it("does nothing for unknown key", () => {
    sortAllTeams([{ key: "bogus", direction: "asc" }]);
    assert.deepStrictEqual(memberIds(), ["p2", "p3", "p1"]); // unchanged
  });

  it("does nothing for team with <2 members", () => {
    state.teams.t1.members = [{ id: "p1" }];
    sortAllTeams([{ key: "name", direction: "asc" }]);
    assert.deepStrictEqual(memberIds(), ["p1"]);
  });

  it("does nothing for empty layers", () => {
    sortAllTeams([]);
    assert.deepStrictEqual(memberIds(), ["p2", "p3", "p1"]); // unchanged
  });

  it("does nothing for null layers", () => {
    sortAllTeams(null);
    assert.deepStrictEqual(memberIds(), ["p2", "p3", "p1"]); // unchanged
  });

  it("preserves managerOverride on member entries", () => {
    state.teams.t1.members = [
      { id: "p2", managerOverride: "p1" },
      { id: "p3" },
      { id: "p1" },
    ];
    sortAllTeams([{ key: "name", direction: "asc" }]);
    const members = state.teams.t1.members;
    assert.equal(members[0].id, "p1"); // Alice
    assert.equal(members[1].id, "p2"); // Bob — still has override
    assert.equal(members[1].managerOverride, "p1");
    assert.equal(members[2].id, "p3"); // Charlie
  });

  it("handles null level by treating as 0", () => {
    state.employees.p1.level = null;
    state.employees.p2.level = 5;
    state.employees.p3.level = null;
    sortAllTeams([{ key: "level", direction: "asc" }]);
    // p1(0) and p3(0) before p2(5)
    assert.equal(memberIds()[2], "p2");
  });

  it("sorts multiple teams at once", () => {
    // Add a second team with some of the same employees in different order
    const dave = makeEmployee("p4", { name: "Dave", role: "Manager", level: 9, timezone: "GMT (UTC+0)", location: "London" });
    state.employees.p4 = dave;
    state.teams.t2 = {
      id: "t2",
      name: "Team 2",
      ownLayout: "expanded",
      manager: null,
      members: [{ id: "p4" }, { id: "p1" }],
      subTeams: [],
      color: "#60a5fa",
    };
    state.rootTeams.push("t2");
    sortAllTeams([{ key: "name", direction: "asc" }]);
    assert.deepStrictEqual(memberIds("t1"), ["p1", "p2", "p3"]); // Alice, Bob, Charlie
    assert.deepStrictEqual(memberIds("t2"), ["p1", "p4"]); // Alice, Dave
  });

  it("multi-layer sort uses primary then secondary key", () => {
    // Give Alice and Charlie the same role so secondary key breaks tie
    state.employees.p1.role = "Engineer";
    state.employees.p3.role = "Engineer";
    // Sort by role asc, then name asc
    sortAllTeams([
      { key: "role", direction: "asc" },
      { key: "name", direction: "asc" },
    ]);
    // Analyst(Charlie) is gone — now p1=Engineer(Alice), p2=Engineer(Bob), p3=Engineer(Charlie)
    // All same role, so name breaks tie: Alice, Bob, Charlie
    assert.deepStrictEqual(memberIds(), ["p1", "p2", "p3"]);
  });

  it("multi-layer sort respects direction on each layer", () => {
    // Same role for all
    state.employees.p1.role = "Engineer";
    state.employees.p2.role = "Engineer";
    state.employees.p3.role = "Engineer";
    // Sort by role asc, then name desc
    sortAllTeams([
      { key: "role", direction: "asc" },
      { key: "name", direction: "desc" },
    ]);
    // All same role, name desc: Charlie, Bob, Alice
    assert.deepStrictEqual(memberIds(), ["p3", "p2", "p1"]);
  });

  it("multi-layer sort with different primary groups", () => {
    state.employees.p1.role = "Designer";
    state.employees.p2.role = "Engineer";
    state.employees.p3.role = "Analyst";
    // Sort by role asc, then level desc
    sortAllTeams([
      { key: "role", direction: "asc" },
      { key: "level", direction: "desc" },
    ]);
    // Analyst(p3), Designer(p1), Engineer(p2)
    assert.deepStrictEqual(memberIds(), ["p3", "p1", "p2"]);
  });
});

// ─── activeSortLayers in state factories ─────────────────────────────

describe("activeSortLayers state", () => {
  it("createInitialState includes activeSortLayers as empty array", () => {
    const s = createInitialState();
    assert.ok(Array.isArray(s.activeSortLayers));
    assert.equal(s.activeSortLayers.length, 0);
  });

  it("createBlankState includes activeSortLayers as empty array", () => {
    const s = createBlankState();
    assert.ok(Array.isArray(s.activeSortLayers));
    assert.equal(s.activeSortLayers.length, 0);
  });
});

// ─── addRandomRootTeam ───────────────────────────────────────────────

describe("addRandomRootTeam", () => {
  beforeEach(resetState);

  it("creates a new team and adds it to rootTeams", () => {
    const teamId = addRandomRootTeam();
    assert.ok(state.teams[teamId]);
    assert.ok(state.rootTeams.includes(teamId));
  });

  it("assigns expected default properties", () => {
    const teamId = addRandomRootTeam();
    const team = state.teams[teamId];
    assert.equal(team.ownLayout, "expanded");
    assert.equal(team.manager, null);
    assert.deepStrictEqual(team.members, []);
    assert.deepStrictEqual(team.subTeams, []);
    assert.ok(team.color);
  });

  it("increments team names to avoid duplicates", () => {
    const id1 = addRandomRootTeam();
    const id2 = addRandomRootTeam();
    assert.notEqual(state.teams[id1].name, state.teams[id2].name);
  });
});

// ─── addRandomTeamToTeam ─────────────────────────────────────────────

describe("addRandomTeamToTeam", () => {
  beforeEach(resetState);

  it("creates a sub-team inside a parent team", () => {
    const parentId = addRandomRootTeam();
    addRandomTeamToTeam(parentId);
    assert.equal(state.teams[parentId].subTeams.length, 1);
    assert.ok(!state.rootTeams.includes(state.teams[parentId].subTeams[0].id));
  });

  it("expands a collapsed parent team", () => {
    const parentId = addRandomRootTeam();
    state.teams[parentId].ownLayout = "collapsed";
    addRandomTeamToTeam(parentId);
    assert.equal(state.teams[parentId].ownLayout, "expanded");
  });
});

// ─── removeEmployeeFromCurrentLocation ───────────────────────────────

describe("removeEmployeeFromCurrentLocation", () => {
  beforeEach(resetState);

  it("removes from unassigned pool", () => {
    const emp = makeEmployee("p1");
    state.employees.p1 = emp;
    state.unassignedEmployees.push("p1");
    removeEmployeeFromCurrentLocation("p1");
    assert.ok(!state.unassignedEmployees.includes("p1"));
  });

  it("removes from team members", () => {
    const emp = makeEmployee("p1");
    state.employees.p1 = emp;
    const teamId = addRandomRootTeam();
    state.teams[teamId].members.push({ id: "p1" });
    removeEmployeeFromCurrentLocation("p1");
    assert.equal(state.teams[teamId].members.length, 0);
  });

  it("clears manager slot when removing a manager", () => {
    const emp = makeEmployee("p1");
    state.employees.p1 = emp;
    const teamId = addRandomRootTeam();
    state.teams[teamId].manager = "p1";
    removeEmployeeFromCurrentLocation("p1");
    assert.equal(state.teams[teamId].manager, null);
  });

  it("preserves managerOverride from member entry", () => {
    const emp = makeEmployee("p1");
    state.employees.p1 = emp;
    const teamId = addRandomRootTeam();
    state.teams[teamId].members.push({ id: "p1", managerOverride: "someManager" });
    const preserved = removeEmployeeFromCurrentLocation("p1");
    assert.equal(preserved, "someManager");
  });

  it("preserves managerOverride from manager slot", () => {
    const emp = makeEmployee("p1");
    state.employees.p1 = emp;
    const teamId = addRandomRootTeam();
    state.teams[teamId].manager = "p1";
    state.teams[teamId].managerOverride = "prevManager";
    const preserved = removeEmployeeFromCurrentLocation("p1");
    assert.equal(preserved, "prevManager");
  });
});

// ─── removeTeamFromCurrentLocation ───────────────────────────────────

describe("removeTeamFromCurrentLocation", () => {
  beforeEach(resetState);

  it("removes from root teams", () => {
    const teamId = addRandomRootTeam();
    assert.ok(state.rootTeams.includes(teamId));
    removeTeamFromCurrentLocation(teamId);
    assert.ok(!state.rootTeams.includes(teamId));
  });

  it("removes from parent team subTeams", () => {
    const parentId = addRandomRootTeam();
    addRandomTeamToTeam(parentId);
    const childId = state.teams[parentId].subTeams[0].id;
    removeTeamFromCurrentLocation(childId);
    assert.equal(state.teams[parentId].subTeams.length, 0);
  });
});

// ─── insertMember / insertSubTeam ────────────────────────────────────

describe("insertMember", () => {
  beforeEach(resetState);

  it("inserts a member at the specified index", () => {
    const emp1 = makeEmployee("p1");
    const emp2 = makeEmployee("p2");
    state.employees.p1 = emp1;
    state.employees.p2 = emp2;
    const teamId = addRandomRootTeam();
    state.teams[teamId].members.push({ id: "p1" });
    insertMember(teamId, { id: "p2" }, 0);
    assert.equal(state.teams[teamId].members[0].id, "p2");
    assert.equal(state.teams[teamId].members[1].id, "p1");
  });
});

describe("insertSubTeam", () => {
  beforeEach(resetState);

  it("inserts a sub-team at the specified index", () => {
    const parentId = addRandomRootTeam();
    addRandomTeamToTeam(parentId);
    const existingChildId = state.teams[parentId].subTeams[0].id;
    const newTeamId = addRandomRootTeam();
    state.rootTeams = state.rootTeams.filter((id) => id !== newTeamId);
    insertSubTeam(parentId, { id: newTeamId }, 0);
    assert.equal(state.teams[parentId].subTeams[0].id, newTeamId);
    assert.equal(state.teams[parentId].subTeams[1].id, existingChildId);
  });
});

// ─── moveEmployeeToTeam ──────────────────────────────────────────────

describe("moveEmployeeToTeam", () => {
  beforeEach(resetState);

  it("moves employee from unassigned to team as member", () => {
    const emp = makeEmployee("p1");
    state.employees.p1 = emp;
    state.unassignedEmployees.push("p1");
    const teamId = addRandomRootTeam();
    const result = moveEmployeeToTeam("p1", teamId, "member", 0);
    assert.equal(result, true);
    assert.ok(!state.unassignedEmployees.includes("p1"));
    assert.equal(state.teams[teamId].members[0].id, "p1");
  });

  it("moves employee to manager slot", () => {
    const emp = makeEmployee("p1");
    state.employees.p1 = emp;
    state.unassignedEmployees.push("p1");
    const teamId = addRandomRootTeam();
    const result = moveEmployeeToTeam("p1", teamId, "manager");
    assert.equal(result, true);
    assert.equal(state.teams[teamId].manager, "p1");
  });

  it("rejects if manager slot already taken by different person", () => {
    const emp1 = makeEmployee("p1");
    const emp2 = makeEmployee("p2");
    state.employees.p1 = emp1;
    state.employees.p2 = emp2;
    const teamId = addRandomRootTeam();
    state.teams[teamId].manager = "p1";
    state.unassignedEmployees.push("p2");
    const result = moveEmployeeToTeam("p2", teamId, "manager");
    assert.equal(result, false);
    assert.equal(state.teams[teamId].manager, "p1");
  });

  it("preserves managerOverride when moving between teams", () => {
    const emp = makeEmployee("p1");
    const mgr = makeEmployee("p2");
    state.employees.p1 = emp;
    state.employees.p2 = mgr;
    const teamA = addRandomRootTeam();
    const teamB = addRandomRootTeam();
    state.teams[teamA].manager = "p2"; // p2 is a manager
    state.teams[teamA].members.push({ id: "p1", managerOverride: "p2" });
    const result = moveEmployeeToTeam("p1", teamB, "member", 0);
    assert.equal(result, true);
    assert.equal(state.teams[teamB].members[0].managerOverride, "p2");
  });

  it("preserves managerOverride when moving manager to new manager slot", () => {
    const emp = makeEmployee("p1");
    const mgr = makeEmployee("p2");
    state.employees.p1 = emp;
    state.employees.p2 = mgr;
    const teamA = addRandomRootTeam();
    const teamB = addRandomRootTeam();
    state.teams[teamA].manager = "p1";
    state.teams[teamA].managerOverride = "p2";
    state.teams[teamB].manager = null;
    // p2 must be a manager somewhere for cleanup to keep the override
    state.teams[teamB].members.push({ id: "p2" });
    const anotherTeam = addRandomRootTeam();
    state.teams[anotherTeam].manager = "p2";
    const result = moveEmployeeToTeam("p1", teamB, "manager");
    assert.equal(result, true);
    assert.equal(state.teams[teamB].manager, "p1");
    assert.equal(state.teams[teamB].managerOverride, "p2");
  });
});

// ─── moveEmployeeToRoster ────────────────────────────────────────────

describe("moveEmployeeToRoster", () => {
  beforeEach(resetState);

  it("moves employee from team to unassigned", () => {
    const emp = makeEmployee("p1");
    state.employees.p1 = emp;
    const teamId = addRandomRootTeam();
    state.teams[teamId].members.push({ id: "p1" });
    moveEmployeeToRoster("p1");
    assert.ok(state.unassignedEmployees.includes("p1"));
    assert.equal(state.teams[teamId].members.length, 0);
  });

  it("does not duplicate if already unassigned", () => {
    const emp = makeEmployee("p1");
    state.employees.p1 = emp;
    state.unassignedEmployees.push("p1");
    moveEmployeeToRoster("p1");
    assert.equal(state.unassignedEmployees.filter((id) => id === "p1").length, 1);
  });
});

// ─── moveTeamToTarget ────────────────────────────────────────────────

describe("moveTeamToTarget", () => {
  beforeEach(resetState);

  it("moves team to root when targetTeamId is null", () => {
    const parentId = addRandomRootTeam();
    addRandomTeamToTeam(parentId);
    const childId = state.teams[parentId].subTeams[0].id;
    const result = moveTeamToTarget(childId, null);
    assert.equal(result, true);
    assert.ok(state.rootTeams.includes(childId));
  });

  it("moves team to another team as sub-team", () => {
    const teamA = addRandomRootTeam();
    const teamB = addRandomRootTeam();
    const result = moveTeamToTarget(teamA, teamB, 0);
    assert.equal(result, true);
    assert.ok(!state.rootTeams.includes(teamA));
    assert.equal(state.teams[teamB].subTeams[0].id, teamA);
  });

  it("rejects moving team into itself", () => {
    const teamId = addRandomRootTeam();
    const result = moveTeamToTarget(teamId, teamId);
    assert.equal(result, false);
  });

  it("rejects moving team into its own descendant (circular)", () => {
    const parentId = addRandomRootTeam();
    addRandomTeamToTeam(parentId);
    const childId = state.teams[parentId].subTeams[0].id;
    const result = moveTeamToTarget(parentId, childId);
    assert.equal(result, false);
  });
});

// ─── deepCopyEmployee ────────────────────────────────────────────────

describe("deepCopyEmployee", () => {
  beforeEach(resetState);

  it("creates a copy with a new id", () => {
    state.employees.p1 = makeEmployee("p1", { name: "Alice" });
    const newId = deepCopyEmployee("p1");
    assert.ok(newId);
    assert.notEqual(newId, "p1");
    assert.equal(state.employees[newId].name, "Alice");
  });

  it("returns null for non-existent employee", () => {
    const result = deepCopyEmployee("bogus");
    assert.equal(result, null);
  });
});

// ─── deepCopyTeam ────────────────────────────────────────────────────

describe("deepCopyTeam", () => {
  beforeEach(resetState);

  it("deep copies team with members and sub-teams", () => {
    state.employees.p1 = makeEmployee("p1");
    state.employees.p2 = makeEmployee("p2");
    const parentId = addRandomRootTeam();
    state.teams[parentId].manager = "p1";
    state.teams[parentId].members = [{ id: "p2" }];
    addRandomTeamToTeam(parentId);

    const copyId = deepCopyTeam(parentId);
    assert.ok(copyId);
    assert.notEqual(copyId, parentId);
    const copy = state.teams[copyId];
    assert.ok(copy.manager);
    assert.notEqual(copy.manager, "p1"); // new id
    assert.equal(copy.members.length, 1);
    assert.notEqual(copy.members[0].id, "p2"); // new id
    assert.equal(copy.subTeams.length, 1);
    assert.notEqual(copy.subTeams[0].id, state.teams[parentId].subTeams[0].id);
  });

  it("returns null for non-existent team", () => {
    const result = deepCopyTeam("bogus");
    assert.equal(result, null);
  });
});

// ─── copyEmployeeToTeam ──────────────────────────────────────────────

describe("copyEmployeeToTeam", () => {
  beforeEach(resetState);

  it("copies employee to a team as member", () => {
    state.employees.p1 = makeEmployee("p1", { name: "Alice" });
    const teamId = addRandomRootTeam();
    const result = copyEmployeeToTeam("p1", teamId, "member", 0);
    assert.equal(result, true);
    assert.equal(state.teams[teamId].members.length, 1);
    const copiedId = state.teams[teamId].members[0].id;
    assert.notEqual(copiedId, "p1");
    assert.equal(state.employees[copiedId].name, "Alice");
  });

  it("copies employee as manager", () => {
    state.employees.p1 = makeEmployee("p1");
    const teamId = addRandomRootTeam();
    const result = copyEmployeeToTeam("p1", teamId, "manager");
    assert.equal(result, true);
    assert.ok(state.teams[teamId].manager);
    assert.notEqual(state.teams[teamId].manager, "p1");
  });

  it("rejects copy to manager slot if already filled", () => {
    state.employees.p1 = makeEmployee("p1");
    state.employees.p2 = makeEmployee("p2");
    const teamId = addRandomRootTeam();
    state.teams[teamId].manager = "p2";
    const result = copyEmployeeToTeam("p1", teamId, "manager");
    assert.equal(result, false);
  });

  it("returns false for non-existent employee", () => {
    const teamId = addRandomRootTeam();
    const result = copyEmployeeToTeam("bogus", teamId, "member", 0);
    assert.equal(result, false);
  });
});

// ─── copyEmployeeToRoster ────────────────────────────────────────────

describe("copyEmployeeToRoster", () => {
  beforeEach(resetState);

  it("copies employee to unassigned pool", () => {
    state.employees.p1 = makeEmployee("p1", { name: "Alice" });
    const result = copyEmployeeToRoster("p1");
    assert.equal(result, true);
    assert.equal(state.unassignedEmployees.length, 1);
    assert.notEqual(state.unassignedEmployees[0], "p1");
    assert.equal(state.employees[state.unassignedEmployees[0]].name, "Alice");
  });

  it("returns false for non-existent employee", () => {
    const result = copyEmployeeToRoster("bogus");
    assert.equal(result, false);
  });
});

// ─── copyTeamToTarget ────────────────────────────────────────────────

describe("copyTeamToTarget", () => {
  beforeEach(resetState);

  it("copies team to root", () => {
    state.employees.p1 = makeEmployee("p1");
    const teamId = addRandomRootTeam();
    state.teams[teamId].manager = "p1";
    const result = copyTeamToTarget(teamId, null);
    assert.equal(result, true);
    assert.equal(state.rootTeams.length, 2);
    const copyId = state.rootTeams.find((id) => id !== teamId);
    assert.ok(state.teams[copyId]);
  });

  it("copies team into another team", () => {
    state.employees.p1 = makeEmployee("p1");
    const teamA = addRandomRootTeam();
    const teamB = addRandomRootTeam();
    state.teams[teamA].manager = "p1";
    const result = copyTeamToTarget(teamA, teamB, 0);
    assert.equal(result, true);
    assert.equal(state.teams[teamB].subTeams.length, 1);
  });

  it("returns false for non-existent team", () => {
    const result = copyTeamToTarget("bogus", null);
    assert.equal(result, false);
  });
});

// ─── deleteEmployee ──────────────────────────────────────────────────

describe("deleteEmployee", () => {
  beforeEach(resetState);

  it("moves team member to unassigned (does not delete)", () => {
    state.employees.p1 = makeEmployee("p1");
    const teamId = addRandomRootTeam();
    state.teams[teamId].members.push({ id: "p1" });
    deleteEmployee("p1");
    assert.ok(state.unassignedEmployees.includes("p1"));
    assert.ok(state.employees.p1); // still exists
  });

  it("fully deletes an already-unassigned employee", () => {
    state.employees.p1 = makeEmployee("p1");
    state.unassignedEmployees.push("p1");
    deleteEmployee("p1");
    assert.ok(!state.employees.p1);
    assert.ok(!state.unassignedEmployees.includes("p1"));
  });
});

// ─── deleteAllUnassigned ─────────────────────────────────────────────

describe("deleteAllUnassigned", () => {
  beforeEach(resetState);

  it("removes all unassigned employees", () => {
    state.employees.p1 = makeEmployee("p1");
    state.employees.p2 = makeEmployee("p2");
    state.unassignedEmployees.push("p1", "p2");
    deleteAllUnassigned();
    assert.equal(state.unassignedEmployees.length, 0);
    assert.ok(!state.employees.p1);
    assert.ok(!state.employees.p2);
  });

  it("does not affect team members", () => {
    state.employees.p1 = makeEmployee("p1");
    state.employees.p2 = makeEmployee("p2");
    state.unassignedEmployees.push("p1");
    const teamId = addRandomRootTeam();
    state.teams[teamId].members.push({ id: "p2" });
    deleteAllUnassigned();
    assert.ok(!state.employees.p1);
    assert.ok(state.employees.p2);
  });
});

// ─── deleteTeam ──────────────────────────────────────────────────────

describe("deleteTeam", () => {
  beforeEach(resetState);

  it("deletes a root team", () => {
    const teamId = addRandomRootTeam();
    deleteTeam(teamId);
    assert.ok(!state.teams[teamId]);
    assert.ok(!state.rootTeams.includes(teamId));
  });

  it("recursively deletes sub-teams", () => {
    const parentId = addRandomRootTeam();
    addRandomTeamToTeam(parentId);
    const childId = state.teams[parentId].subTeams[0].id;
    deleteTeam(parentId);
    assert.ok(!state.teams[parentId]);
    assert.ok(!state.teams[childId]);
  });

  it("does nothing for non-existent team", () => {
    deleteTeam("bogus");
    // no error thrown
  });
});

// ─── toggleTeamLayout ────────────────────────────────────────────────

describe("toggleTeamLayout", () => {
  beforeEach(resetState);

  it("toggles from expanded to collapsed", () => {
    const teamId = addRandomRootTeam();
    assert.equal(state.teams[teamId].ownLayout, "expanded");
    toggleTeamLayout(teamId);
    assert.equal(state.teams[teamId].ownLayout, "collapsed");
  });

  it("toggles from collapsed to expanded", () => {
    const teamId = addRandomRootTeam();
    state.teams[teamId].ownLayout = "collapsed";
    toggleTeamLayout(teamId);
    assert.equal(state.teams[teamId].ownLayout, "expanded");
  });
});

// ─── getAllManagers ──────────────────────────────────────────────────

describe("getAllManagers", () => {
  beforeEach(resetState);

  it("returns empty array when no teams", () => {
    assert.deepStrictEqual(getAllManagers(), []);
  });

  it("returns managers from all teams", () => {
    state.employees.p1 = makeEmployee("p1", { name: "Alice" });
    state.employees.p2 = makeEmployee("p2", { name: "Bob" });
    const t1 = addRandomRootTeam();
    const t2 = addRandomRootTeam();
    state.teams[t1].manager = "p1";
    state.teams[t2].manager = "p2";
    const managers = getAllManagers();
    assert.equal(managers.length, 2);
    const names = managers.map((m) => m.name).sort();
    assert.deepStrictEqual(names, ["Alice", "Bob"]);
  });

  it("deduplicates when same person manages multiple teams", () => {
    state.employees.p1 = makeEmployee("p1", { name: "Alice" });
    const t1 = addRandomRootTeam();
    const t2 = addRandomRootTeam();
    state.teams[t1].manager = "p1";
    state.teams[t2].manager = "p1";
    const managers = getAllManagers();
    assert.equal(managers.length, 1);
  });

  it("skips teams with no manager", () => {
    state.employees.p1 = makeEmployee("p1");
    const t1 = addRandomRootTeam();
    const t2 = addRandomRootTeam();
    state.teams[t1].manager = "p1";
    // t2 has no manager
    const managers = getAllManagers();
    assert.equal(managers.length, 1);
  });

  it("skips managers whose employee record is missing", () => {
    const t1 = addRandomRootTeam();
    state.teams[t1].manager = "p999"; // no employee record
    const managers = getAllManagers();
    assert.equal(managers.length, 0);
  });
});

// ─── findMemberEntry ─────────────────────────────────────────────────

describe("findMemberEntry", () => {
  beforeEach(resetState);

  it("returns the member entry when found", () => {
    state.employees.p1 = makeEmployee("p1");
    const teamId = addRandomRootTeam();
    state.teams[teamId].members.push({ id: "p1", managerOverride: "mgr1" });
    const entry = findMemberEntry("p1", teamId);
    assert.deepStrictEqual(entry, { id: "p1", managerOverride: "mgr1" });
  });

  it("returns null when employee not in team", () => {
    state.employees.p1 = makeEmployee("p1");
    const teamId = addRandomRootTeam();
    const entry = findMemberEntry("p1", teamId);
    assert.equal(entry, null);
  });

  it("returns null for non-existent team", () => {
    const entry = findMemberEntry("p1", "bogus");
    assert.equal(entry, null);
  });
});
