import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeFitZoom, nextZoomLevel, scrollableEdges } from "../src/layout.mjs";

const fit = (boardWidth, boardHeight, extra = {}) =>
  computeFitZoom({ boardWidth, boardHeight, availableWidth: 1200, availableHeight: 600, ...extra });

describe("computeFitZoom", () => {
  it("is 100% when the board already fits", () => {
    assert.equal(fit(800, 300), 1);
  });

  it("is limited by height when the board is too tall", () => {
    assert.equal(fit(800, 1200), 0.5);
  });

  it("is limited by width when the board is too wide", () => {
    assert.equal(fit(3000, 300), 0.4);
  });

  it("uses the tighter of the two limits", () => {
    assert.equal(fit(2400, 2000), 0.3);
  });

  it("goes as low as a very large board needs", () => {
    assert.equal(fit(12000, 600), 0.1);
    assert.equal(fit(600, 10000), 0.06);
  });

  it("rounds down to a whole percent so the board never overflows", () => {
    assert.equal(fit(3600, 300), 0.33);
  });

  it("never drops below the absolute floor", () => {
    assert.equal(fit(1e7, 300), 0.05);
  });

  it("returns max for an empty board", () => {
    assert.equal(fit(0, 0), 1);
  });

  it("respects a custom max", () => {
    assert.equal(fit(100, 100, { max: 2 }), 2);
  });
});

describe("scrollableEdges", () => {
  const box = (over) => ({ scrollLeft: 0, scrollTop: 0, scrollWidth: 800, scrollHeight: 600, clientWidth: 800, clientHeight: 600, ...over });

  it("reports nothing when the content fits", () => {
    assert.deepEqual(scrollableEdges(box()), { left: false, right: false, up: false, down: false });
  });

  it("reports right and down at the start of larger content", () => {
    assert.deepEqual(scrollableEdges(box({ scrollWidth: 2000, scrollHeight: 1500 })), { left: false, right: true, up: false, down: true });
  });

  it("reports all four in the middle", () => {
    const e = scrollableEdges(box({ scrollWidth: 2000, scrollHeight: 1500, scrollLeft: 300, scrollTop: 200 }));
    assert.deepEqual(e, { left: true, right: true, up: true, down: true });
  });

  it("reports only left and up at the far corner", () => {
    const e = scrollableEdges(box({ scrollWidth: 2000, scrollHeight: 1500, scrollLeft: 1200, scrollTop: 900 }));
    assert.deepEqual(e, { left: true, right: false, up: true, down: false });
  });

  it("ignores a sub-pixel remainder", () => {
    assert.equal(scrollableEdges(box({ scrollWidth: 800.6 })).right, false);
  });
});

describe("nextZoomLevel", () => {
  const opts = { step: 0.1, min: 0.13 };

  it("steps in to the next multiple of the step from an in-between zoom", () => {
    assert.equal(nextZoomLevel(0.13, 1, opts), 0.2);
    assert.equal(nextZoomLevel(0.37, 1, opts), 0.4);
  });

  it("steps in by a full step from a round zoom", () => {
    assert.equal(nextZoomLevel(0.2, 1, opts), 0.3);
    assert.equal(nextZoomLevel(1, 1, opts), 1.1);
  });

  it("steps out to the previous multiple of the step", () => {
    assert.equal(nextZoomLevel(0.5, -1, opts), 0.4);
    assert.equal(nextZoomLevel(0.37, -1, opts), 0.3);
  });

  it("stops at the minimum when stepping out", () => {
    assert.equal(nextZoomLevel(0.2, -1, opts), 0.13);
    assert.equal(nextZoomLevel(0.13, -1, opts), 0.13);
  });

  it("does not jump up to the minimum if already below it", () => {
    assert.equal(nextZoomLevel(0.1, -1, { step: 0.1, min: 0.5 }), 0.1);
  });

  it("is free of floating-point drift across many steps", () => {
    let z = 0.13;
    const seen = [];
    for (let i = 0; i < 5; i++) { z = nextZoomLevel(z, 1, opts); seen.push(z); }
    assert.deepEqual(seen, [0.2, 0.3, 0.4, 0.5, 0.6]);
  });
});
