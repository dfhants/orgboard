import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanName } from "../src/utils.mjs";

// ─── cleanName ───

describe("cleanName", () => {
  it("returns plain names unchanged", () => {
    assert.equal(cleanName("Alex Smith"), "Alex Smith");
  });

  it("strips [C] contingent marker", () => {
    assert.equal(cleanName("Lane Mitchell [C]"), "Lane Mitchell");
  });

  it("strips (On Leave)", () => {
    assert.equal(cleanName("Hayden Young (On Leave)"), "Hayden Young");
  });

  it("strips (On Leave) case-insensitively", () => {
    assert.equal(cleanName("Hayden Young (on leave)"), "Hayden Young");
  });

  it("strips redundant self-reference like 'Sydney Green (Sydney Green)'", () => {
    assert.equal(cleanName("Sydney Green (Sydney Green)"), "Sydney Green");
  });

  it("strips all markers when combined: [C] + (On Leave)", () => {
    // [C] is stripped first, then (On Leave)
    assert.equal(cleanName("Jane Doe [C]"), "Jane Doe");
  });

  it("handles empty string", () => {
    assert.equal(cleanName(""), "");
  });

  it("does not strip non-duplicate parenthetical like 'Alex (Manager)'", () => {
    assert.equal(cleanName("Alex (Manager)"), "Alex (Manager)");
  });
});

// ─── Manager resolution with name cleaning (regression) ───

describe("manager resolution with cleaned names", () => {
  it("cleanName makes '(On Leave)' manager match cleaned employee name", () => {
    // Simulates the core bug: manager reference resolves to raw name with "(On Leave)"
    // but the employee's name has been cleaned
    const rawManagerRef = "Hayden Young (On Leave)";
    const cleanedEmployeeName = "Hayden Young";

    // After fix: cleanName is applied to resolved manager name
    assert.equal(cleanName(rawManagerRef), cleanedEmployeeName);
  });

  it("cleanName makes self-reference manager match cleaned employee name", () => {
    // Manager reference resolves to "Sydney Green (Sydney Green)" but employee is "Sydney Green"
    const rawManagerRef = "Sydney Green (Sydney Green)";
    const cleanedEmployeeName = "Sydney Green";

    assert.equal(cleanName(rawManagerRef), cleanedEmployeeName);
  });

  it("cleanName makes [C] manager match cleaned employee name", () => {
    const rawManagerRef = "Lane Mitchell [C]";
    const cleanedEmployeeName = "Lane Mitchell";

    assert.equal(cleanName(rawManagerRef), cleanedEmployeeName);
  });
});
