import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { placeTooltip } from "../src/tooltip.mjs";

const viewport = { width: 1000, height: 600 };
const size = { width: 100, height: 24 };
const rect = (left, top, width = 24, height = 24) => ({ left, top, width, height, bottom: top + height });

describe("placeTooltip", () => {
  it("sits above the target, centred", () => {
    const p = placeTooltip(rect(500, 300), size, viewport);
    assert.equal(p.placement, "top");
    assert.equal(p.top, 300 - 6 - 24);
    assert.equal(p.left, 500 + 12 - 50);
  });

  it("flips below when there is no room above", () => {
    const p = placeTooltip(rect(500, 10), size, viewport);
    assert.equal(p.placement, "bottom");
    assert.equal(p.top, 10 + 24 + 6);
  });

  it("stays inside the left edge", () => {
    assert.equal(placeTooltip(rect(0, 300), size, viewport).left, 6);
  });

  it("stays inside the right edge", () => {
    assert.equal(placeTooltip(rect(990, 300), size, viewport).left, 1000 - 6 - 100);
  });

  it("prefers above when it fits neither way", () => {
    const p = placeTooltip(rect(500, 10, 24, 580), size, viewport);
    assert.equal(p.placement, "top");
    assert.equal(p.top, 6);
  });
});
