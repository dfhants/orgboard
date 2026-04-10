import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeColumns } from "../src/packing.mjs";

describe("computeColumns", () => {
  it("returns a single empty column for empty input", () => {
    const result = computeColumns({ heights: [], availableHeight: 200, gap: 10 });
    assert.deepStrictEqual(result, [[]]);
  });

  it("puts a single entry in one column", () => {
    const result = computeColumns({ heights: [50], availableHeight: 200, gap: 10 });
    assert.deepStrictEqual(result, [[0]]);
  });

  it("stacks entries that fit in one column", () => {
    // 50 + 10 + 50 = 110, fits within 200
    const result = computeColumns({ heights: [50, 50], availableHeight: 200, gap: 10 });
    assert.deepStrictEqual(result, [[0, 1]]);
  });

  it("splits into two columns when entries overflow", () => {
    // 100 + 10 + 100 = 210 > 200 → two columns
    const result = computeColumns({ heights: [100, 100], availableHeight: 200, gap: 10 });
    assert.deepStrictEqual(result, [[0], [1]]);
  });

  it("splits three entries into two columns", () => {
    // col 1: 80 + 10 + 80 = 170, fits in 200
    // col 2: 80 alone
    const result = computeColumns({ heights: [80, 80, 80], availableHeight: 200, gap: 10 });
    assert.deepStrictEqual(result, [[0, 1], [2]]);
  });

  it("handles variable heights", () => {
    // col 1: 120 alone (120 + 10 + 60 = 190 ≤ 200 → actually fits!)
    // Wait: 120 + 10 + 60 = 190, that fits.
    // col 1: 120, 60 → 190
    // col 2: 90 alone
    const result = computeColumns({ heights: [120, 60, 90], availableHeight: 200, gap: 10 });
    assert.deepStrictEqual(result, [[0, 1], [2]]);
  });

  it("respects gap between entries", () => {
    // gap=20: 100 + 20 + 100 = 220 > 200
    const result = computeColumns({ heights: [100, 100], availableHeight: 200, gap: 20 });
    assert.deepStrictEqual(result, [[0], [1]]);
  });

  it("exact fit keeps entries in same column", () => {
    // 95 + 10 + 95 = 200 exactly
    const result = computeColumns({ heights: [95, 95], availableHeight: 200, gap: 10 });
    assert.deepStrictEqual(result, [[0, 1]]);
  });

  it("one entry per column when availableHeight is zero", () => {
    const result = computeColumns({ heights: [50, 60, 70], availableHeight: 0, gap: 10 });
    assert.deepStrictEqual(result, [[0], [1], [2]]);
  });

  it("one entry per column when availableHeight is negative", () => {
    const result = computeColumns({ heights: [50, 60], availableHeight: -100, gap: 10 });
    assert.deepStrictEqual(result, [[0], [1]]);
  });

  it("zero gap allows tighter packing", () => {
    // Without gap: 100 + 100 = 200 ≤ 200
    const result = computeColumns({ heights: [100, 100], availableHeight: 200, gap: 0 });
    assert.deepStrictEqual(result, [[0, 1]]);
  });

  it("handles many entries across multiple columns", () => {
    // 5 entries of height 80, gap 10, available 200
    // col 1: 80 + 10 + 80 = 170 (80+10+80+10+80=260 > 200 → only 2 fit)
    // col 2: 80 + 10 + 80 = 170
    // col 3: 80
    const result = computeColumns({
      heights: [80, 80, 80, 80, 80],
      availableHeight: 200,
      gap: 10,
    });
    assert.deepStrictEqual(result, [[0, 1], [2, 3], [4]]);
  });

  it("entry taller than availableHeight gets its own column", () => {
    // First entry (250) is taller than available (200), but it still goes in alone
    // Second entry starts a new column
    const result = computeColumns({ heights: [250, 50], availableHeight: 200, gap: 10 });
    assert.deepStrictEqual(result, [[0], [1]]);
  });
});
