import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateAllChecks, describeCriterion, checkTypes } from "../src/checks.mjs";

// ─── Test helpers ───

function makeState(overrides = {}) {
  return {
    employees: {
      p1: { id: "p1", name: "Alice", role: "Engineer", location: "NYC", timezone: "EST (UTC−5)", level: 7, requested: false },
      p2: { id: "p2", name: "Bob", role: "Designer", location: "London", timezone: "GMT (UTC+0)", level: 5, requested: false },
      p3: { id: "p3", name: "Charlie", role: "Engineer", location: "NYC", timezone: "EST (UTC−5)", level: 6, requested: true },
      p4: { id: "p4", name: "Diana", role: "PM", location: "London", timezone: "GMT (UTC+0)", level: 8, requested: false },
      p5: { id: "p5", name: "Eve", role: "QA Engineer", location: "Tokyo", timezone: "JST (UTC+9)", level: 4, requested: false },
    },
    teams: {
      t1: { id: "t1", name: "Alpha", manager: "p1", members: [{ id: "p2" }, { id: "p3" }], color: "#aaa", subTeams: [] },
      t2: { id: "t2", name: "Beta", manager: "p4", members: [{ id: "p5" }], color: "#bbb", subTeams: [] },
    },
    rootTeams: ["t1", "t2"],
    unassignedEmployees: [],
    ...overrides,
  };
}

function runCheck(type, config, stateOverrides = {}) {
  const criterion = { id: "c1", name: "test", type, config, enabled: true, sort_order: 0 };
  const result = evaluateAllChecks(makeState(stateOverrides), [criterion]);
  return result.results[0];
}

// ─── employee-count ───

describe("employee-count", () => {
  it("passes when all teams meet the minimum count", () => {
    const r = runCheck("employee-count", { operator: ">=", value: 2 });
    // t1 has 3 people (manager + 2 members), t2 has 2 people (manager + 1 member)
    assert.ok(r.passed);
  });

  it("fails when a team is below the minimum", () => {
    const r = runCheck("employee-count", { operator: ">=", value: 4 });
    assert.ok(!r.passed);
  });

  it("supports filter on level", () => {
    const r = runCheck("employee-count", { operator: ">=", value: 1, filter: { field: "level", op: ">=", value: 7 } });
    // t1: p1 is level 7 → 1 match; t2: p4 is level 8 → 1 match
    assert.ok(r.passed);
  });

  it("fails filter when no match", () => {
    const r = runCheck("employee-count", { operator: ">=", value: 1, filter: { field: "level", op: ">=", value: 9 } });
    assert.ok(!r.passed);
  });

  it("supports contains filter on role", () => {
    const r = runCheck("employee-count", { operator: ">=", value: 1, filter: { field: "role", op: "contains", value: "Engineer" } });
    // t1: p1=Engineer, p3=Engineer; t2: p5=QA Engineer
    assert.ok(r.passed);
  });

  it("supports <= filter on level", () => {
    const r = runCheck("employee-count", { operator: ">=", value: 1, filter: { field: "level", op: "<=", value: 5 } });
    // t1: p2=5, p3=5; t2: p5=5
    assert.ok(r.passed);
  });

  it("supports != filter on role", () => {
    const r = runCheck("employee-count", { operator: ">=", value: 1, filter: { field: "role", op: "!=", value: "Engineer" } });
    // t1: p2 Designer ≠ Engineer; t2: p4 Manager ≠ Engineer
    assert.ok(r.passed);
  });

  it("supports == filter on role", () => {
    const r = runCheck("employee-count", { operator: "==", value: 0, filter: { field: "role", op: "==", value: "CEO" } });
    // No one has role CEO
    assert.ok(r.passed);
  });
});

// ─── distinct-values ───

describe("distinct-values", () => {
  it("passes when team has few distinct timezones", () => {
    const r = runCheck("distinct-values", { field: "timezone", operator: "<=", value: 2 });
    assert.ok(r.passed);
  });

  it("fails when too many distinct values", () => {
    const r = runCheck("distinct-values", { field: "timezone", operator: "<=", value: 1 });
    // t1 has EST and GMT
    assert.ok(!r.passed);
  });
});

// ─── timezone-gap ───

describe("timezone-gap", () => {
  it("passes when gap is within limit", () => {
    const r = runCheck("timezone-gap", { maxHours: 10 });
    // t1: EST(-5), GMT(0) = 5h gap; t2: GMT(0), JST(9) = 9h gap
    assert.ok(r.passed);
  });

  it("fails when gap exceeds limit", () => {
    const r = runCheck("timezone-gap", { maxHours: 4 });
    assert.ok(!r.passed);
  });
});

// ─── has-manager ───

describe("has-manager", () => {
  it("passes when all teams have managers", () => {
    const r = runCheck("has-manager", {});
    assert.ok(r.passed);
  });

  it("fails when a team has no manager", () => {
    const r = runCheck("has-manager", {}, {
      teams: {
        t1: { id: "t1", name: "Alpha", manager: null, members: [{ id: "p2" }], color: "#aaa", subTeams: [] },
      },
    });
    assert.ok(!r.passed);
  });
});

// ─── manager-match ───

describe("manager-match", () => {
  it("passes with 'any' when at least one member matches manager location", () => {
    // Override t2 so its member matches the manager's location
    const r = runCheck("manager-match", { field: "location", match: "any" }, {
      teams: {
        t1: { id: "t1", name: "Alpha", manager: "p1", members: [{ id: "p2" }, { id: "p3" }], color: "#aaa", subTeams: [] },
        t2: { id: "t2", name: "Beta", manager: "p4", members: [{ id: "p2" }], color: "#bbb", subTeams: [] },
      },
    });
    // t1: manager p1 NYC, p3 NYC → match; t2: manager p4 London, p2 London → match
    assert.ok(r.passed);
  });

  it("fails with 'all' when not all members match", () => {
    const r = runCheck("manager-match", { field: "location", match: "all" });
    // t1: manager p1 NYC, p2 London ≠ NYC
    assert.ok(!r.passed);
  });

  it("fails when team has no manager", () => {
    const r = runCheck("manager-match", { field: "location", match: "any" }, {
      teams: {
        t1: { id: "t1", name: "NoMgr", manager: null, members: [{ id: "p2" }], color: "#aaa", subTeams: [] },
      },
    });
    assert.ok(!r.passed);
    assert.ok(r.details[0].message.includes("No manager"));
  });

  it("passes when manager has no members to compare", () => {
    const r = runCheck("manager-match", { field: "location", match: "any" }, {
      teams: {
        t1: { id: "t1", name: "Solo", manager: "p1", members: [], color: "#aaa", subTeams: [] },
      },
    });
    assert.ok(r.passed);
    assert.ok(r.details[0].message.includes("No members"));
  });

  it("passes with 'majority' when more than half match", () => {
    const r = runCheck("manager-match", { field: "location", match: "majority" }, {
      teams: {
        t1: { id: "t1", name: "Team", manager: "p1", members: [{ id: "p2" }, { id: "p3" }], color: "#a", subTeams: [] },
      },
      employees: {
        p1: { id: "p1", name: "A", role: "R", location: "NYC", timezone: "", notes: "", requested: false, level: 5 },
        p2: { id: "p2", name: "B", role: "R", location: "NYC", timezone: "", notes: "", requested: false, level: 5 },
        p3: { id: "p3", name: "C", role: "R", location: "London", timezone: "", notes: "", requested: false, level: 5 },
      },
    });
    // 1 of 2 members match → 50%, not > 50% → fails
    assert.ok(!r.passed);
  });
});

// ─── max-direct-reports ───

describe("max-direct-reports", () => {
  it("passes when under the limit", () => {
    const r = runCheck("max-direct-reports", { maxReports: 5 });
    assert.ok(r.passed);
  });

  it("fails when over the limit", () => {
    const r = runCheck("max-direct-reports", { maxReports: 1 });
    // t1 has 2 direct member employees
    assert.ok(!r.passed);
  });

  it("passes when team has no manager", () => {
    const r = runCheck("max-direct-reports", { maxReports: 1 }, {
      teams: {
        t1: { id: "t1", name: "NoMgr", manager: null, members: [{ id: "p2" }, { id: "p3" }], color: "#a", subTeams: [] },
      },
    });
    assert.ok(r.passed);
  });
});

// ─── requested-limit ───

describe("requested-limit", () => {
  it("passes when at most N requested", () => {
    const r = runCheck("requested-limit", { operator: "<=", value: 1 });
    // t1 has p3 requested, t2 has none
    assert.ok(r.passed);
  });

  it("fails when too many requested", () => {
    const r = runCheck("requested-limit", { operator: "<=", value: 0 });
    // t1 has p3 as requested
    assert.ok(!r.passed);
  });
});

// ─── role-coverage ───

describe("role-coverage", () => {
  it("passes when every team has matching role", () => {
    // "Engineer" appears in both teams (p1/p3 in t1, p5 "QA Engineer" in t2)
    const r = runCheck("role-coverage", { rolePattern: "Engineer" });
    assert.ok(r.passed);
  });

  it("fails when a team is missing the role", () => {
    const r = runCheck("role-coverage", { rolePattern: "Designer" });
    // t2 has no designer
    assert.ok(!r.passed);
  });

  it("is case-insensitive", () => {
    const r = runCheck("role-coverage", { rolePattern: "engineer" });
    assert.ok(r.passed);
  });
});

// ─── scenario-count ───

describe("scenario-count", () => {
  it("passes team count check", () => {
    const r = runCheck("scenario-count", { subject: "teams", operator: ">=", value: 2 });
    assert.ok(r.passed);
  });

  it("fails when condition not met", () => {
    const r = runCheck("scenario-count", { subject: "teams", operator: ">=", value: 5 });
    assert.ok(!r.passed);
  });

  it("counts unassigned people", () => {
    const r = runCheck("scenario-count", { subject: "unassigned", operator: "==", value: 1 }, { unassignedEmployees: ["p99"] });
    assert.ok(r.passed);
  });

  it("counts managers", () => {
    const r = runCheck("scenario-count", { subject: "managers", operator: ">=", value: 2 });
    assert.ok(r.passed);
  });

  it("counts people", () => {
    const r = runCheck("scenario-count", { subject: "people", operator: ">=", value: 1 });
    assert.ok(r.passed);
  });

  it("defaults to 0 for unknown subject", () => {
    const r = runCheck("scenario-count", { subject: "bogus", operator: "==", value: 0 });
    assert.ok(r.passed);
  });
});

// ─── max-memberships ───

describe("max-memberships", () => {
  it("passes when no one exceeds the limit", () => {
    const r = runCheck("max-memberships", { maxTeams: 2 });
    assert.ok(r.passed);
  });

  it("fails when someone is in too many teams", () => {
    // Put p2 in both teams
    const r = runCheck("max-memberships", { maxTeams: 1 }, {
      teams: {
        t1: { id: "t1", name: "A", manager: "p1", members: [{ id: "p2" }], color: "#a", subTeams: [] },
        t2: { id: "t2", name: "B", manager: "p2", members: [{ id: "p3" }], color: "#b", subTeams: [] },
      },
    });
    // p2 is member of t1 and manager of t2 → 2 memberships > 1
    assert.ok(!r.passed);
  });
});

// ─── all-assigned ───

describe("all-assigned", () => {
  it("passes when no unassigned people", () => {
    const r = runCheck("all-assigned", {});
    assert.ok(r.passed);
  });

  it("fails when people are unassigned", () => {
    const r = runCheck("all-assigned", {}, { unassignedEmployees: ["p99"] });
    assert.ok(!r.passed);
  });
});

// ─── manager-changed ───

describe("manager-changed", () => {
  function makeManagerChangeState(overrides = {}) {
    return {
      employees: {
        p1: { id: "p1", name: "Alice", role: "Engineer", location: "NYC", timezone: "EST (UTC−5)", level: 7, requested: false, currentManager: "" },
        p2: { id: "p2", name: "Bob", role: "Designer", location: "London", timezone: "GMT (UTC+0)", level: 5, requested: false, currentManager: "Alice" },
        p3: { id: "p3", name: "Charlie", role: "Engineer", location: "NYC", timezone: "EST (UTC−5)", level: 6, requested: false, currentManager: "Diana" },
        p4: { id: "p4", name: "Diana", role: "PM", location: "London", timezone: "GMT (UTC+0)", level: 8, requested: false, currentManager: "" },
      },
      teams: {
        t1: { id: "t1", name: "Alpha", manager: "p1", members: [{ id: "p2" }, { id: "p3" }], color: "#aaa", subTeams: [] },
      },
      rootTeams: ["t1"],
      unassignedEmployees: ["p4"],
      ...overrides,
    };
  }

  it("passes when changes are within the limit", () => {
    // Bob: currentManager Alice, new manager Alice → no change
    // Charlie: currentManager Diana, new manager Alice → changed
    const r = runCheck("manager-changed", { operator: "<=", value: 1 }, makeManagerChangeState());
    assert.ok(r.passed);
  });

  it("fails when changes exceed the limit", () => {
    const r = runCheck("manager-changed", { operator: "<=", value: 0 }, makeManagerChangeState());
    assert.ok(!r.passed);
  });

  it("counts unassigned employees with currentManager as changed", () => {
    const state = makeManagerChangeState({
      employees: {
        p1: { id: "p1", name: "Alice", role: "Engineer", location: "NYC", timezone: "EST (UTC−5)", level: 7, requested: false, currentManager: "" },
        p2: { id: "p2", name: "Bob", role: "Designer", location: "London", timezone: "GMT (UTC+0)", level: 5, requested: false, currentManager: "Alice" },
      },
      teams: {},
      rootTeams: [],
      unassignedEmployees: ["p1", "p2"],
    });
    // Bob has currentManager "Alice" but is unassigned → changed
    const r = runCheck("manager-changed", { operator: "<=", value: 0 }, state);
    assert.ok(!r.passed);
    assert.ok(r.details[0].message.includes("1"));
  });

  it("includes change details in message", () => {
    const r = runCheck("manager-changed", { operator: "<=", value: 5 }, makeManagerChangeState());
    assert.ok(r.details[0].message.includes("Charlie"));
    assert.ok(r.details[0].message.includes("Diana"));
    assert.ok(r.details[0].message.includes("Alice"));
  });
});

// ─── evaluateAllChecks ───

describe("evaluateAllChecks", () => {
  it("skips disabled criteria", () => {
    const criteria = [
      { id: "c1", name: "disabled", type: "has-manager", config: {}, enabled: false, sort_order: 0 },
    ];
    const result = evaluateAllChecks(makeState(), criteria);
    assert.equal(result.results.length, 0);
    assert.equal(result.summary.total, 0);
  });

  it("returns correct summary counts", () => {
    const criteria = [
      { id: "c1", name: "pass", type: "has-manager", config: {}, enabled: true, sort_order: 0 },
      { id: "c2", name: "fail", type: "employee-count", config: { operator: ">=", value: 100 }, enabled: true, sort_order: 1 },
    ];
    const result = evaluateAllChecks(makeState(), criteria);
    assert.equal(result.summary.total, 2);
    assert.equal(result.summary.passed, 1);
    assert.equal(result.summary.failed, 1);
  });
});

// ─── describeCriterion ───

describe("describeCriterion", () => {
  it("describes employee-count without filter", () => {
    const d = describeCriterion("employee-count", { operator: ">=", value: 3 });
    assert.ok(d.includes("3"));
    assert.ok(d.includes("at least"));
  });

  it("describes employee-count with filter", () => {
    const d = describeCriterion("employee-count", { operator: ">=", value: 1, filter: { field: "level", op: ">=", value: 6 } });
    assert.ok(d.includes("level"));
  });

  it("describes all-assigned", () => {
    const d = describeCriterion("all-assigned", {});
    assert.ok(d.toLowerCase().includes("assigned"));
  });

  it("describes manager-changed", () => {
    const d = describeCriterion("manager-changed", { operator: "<=", value: 3 });
    assert.ok(d.includes("3"));
    assert.ok(d.toLowerCase().includes("changed manager"));
  });

  it("describes timezone-gap", () => {
    const d = describeCriterion("timezone-gap", { maxHours: 5 });
    assert.ok(d.includes("5"));
    assert.ok(d.toLowerCase().includes("hour"));
  });

  it("describes max-memberships", () => {
    const d = describeCriterion("max-memberships", { maxTeams: 2 });
    assert.ok(d.includes("2"));
    assert.ok(d.toLowerCase().includes("team"));
  });

  it("describes scenario-count", () => {
    const d = describeCriterion("scenario-count", { subject: "teams", operator: ">=", value: 3 });
    assert.ok(d.includes("at least"));
    assert.ok(d.includes("3"));
    assert.ok(d.includes("teams"));
  });

  it("describes role-coverage", () => {
    const d = describeCriterion("role-coverage", { rolePattern: "Designer" });
    assert.ok(d.includes("Designer"));
  });

  it("describes distinct-values", () => {
    const d = describeCriterion("distinct-values", { operator: ">=", value: 2, field: "timezone" });
    assert.ok(d.includes("2"));
    assert.ok(d.includes("timezone"));
  });

  it("describes has-manager", () => {
    const d = describeCriterion("has-manager", {});
    assert.ok(d.toLowerCase().includes("manager"));
  });

  it("describes manager-match", () => {
    const d = describeCriterion("manager-match", { field: "location", match: "all" });
    assert.ok(d.includes("location"));
    assert.ok(d.includes("all members"));
  });

  it("describes max-direct-reports", () => {
    const d = describeCriterion("max-direct-reports", { maxReports: 5 });
    assert.ok(d.includes("5"));
    assert.ok(d.toLowerCase().includes("direct"));
  });

  it("describes requested-limit", () => {
    const d = describeCriterion("requested-limit", { operator: "<=", value: 2 });
    assert.ok(d.includes("2"));
    assert.ok(d.toLowerCase().includes("position"));
  });

  it("describes employee-count with != filter op", () => {
    const d = describeCriterion("employee-count", {
      operator: ">=", value: 1,
      filter: { field: "role", op: "!=", value: "Intern" },
    });
    assert.ok(d.includes("is not"));
  });

  it("describes employee-count with == filter op", () => {
    const d = describeCriterion("employee-count", {
      operator: ">=", value: 1,
      filter: { field: "role", op: "==", value: "Engineer" },
    });
    assert.ok(d.includes(" is "));
  });

  it("describes employee-count with contains filter op", () => {
    const d = describeCriterion("employee-count", {
      operator: ">=", value: 1,
      filter: { field: "role", op: "contains", value: "Eng" },
    });
    assert.ok(d.includes("contains"));
  });

  it("returns Unknown check for bogus type", () => {
    const d = describeCriterion("bogus-type", {});
    assert.equal(d, "Unknown check");
  });

  it("describes manager-changed with singular person", () => {
    const d = describeCriterion("manager-changed", { operator: "<=", value: 1 });
    assert.ok(d.includes("person"));
    assert.ok(!d.includes("people"));
  });

  it("describes max-direct-reports singular", () => {
    const d = describeCriterion("max-direct-reports", { maxReports: 1 });
    assert.ok(d.includes("report"));
    assert.ok(!d.includes("reports"));
  });

  it("describes max-memberships singular", () => {
    const d = describeCriterion("max-memberships", { maxTeams: 1 });
    assert.ok(d.includes("team"));
    assert.ok(!d.includes("teams"));
  });

  it("describes scenario-count with managers subject", () => {
    const d = describeCriterion("scenario-count", { subject: "managers", operator: ">=", value: 2 });
    assert.ok(d.includes("managers"));
  });

  it("describes scenario-count with unassigned subject", () => {
    const d = describeCriterion("scenario-count", { subject: "unassigned", operator: "==", value: 0 });
    assert.ok(d.includes("unassigned"));
  });
});

// ─── checkTypes registry ───

describe("checkTypes registry", () => {
  it("contains all 12 check types", () => {
    assert.equal(Object.keys(checkTypes).length, 12);
  });

  it("each type has label, description, scope, and evaluate", () => {
    for (const [key, def] of Object.entries(checkTypes)) {
      assert.ok(typeof def.label === "string", `${key} missing label`);
      assert.ok(typeof def.description === "string" && def.description.length > 0, `${key} missing description`);
      assert.ok(["team", "scenario"].includes(def.scope), `${key} invalid scope`);
      assert.ok(typeof def.evaluate === "function", `${key} missing evaluate`);
    }
  });
});
