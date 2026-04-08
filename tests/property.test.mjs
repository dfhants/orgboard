import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  escapeHtml,
  hashString,
  colorForManager,
  colorForTimezone,
  managerPillPalette,
} from "../src/utils.mjs";
import { normalizeInsertIndex } from "../src/team-logic.mjs";

// ─── escapeHtml properties ───────────────────────────────────────────

describe("escapeHtml properties", () => {
  it("output never contains raw <, >, \", or '", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const out = escapeHtml(s);
        // After encoding, raw dangerous chars must not appear
        // We check by reversing: replace all known entities, then assert no raw chars
        const stripped = out
          .replaceAll("&amp;", "")
          .replaceAll("&lt;", "")
          .replaceAll("&gt;", "")
          .replaceAll("&quot;", "")
          .replaceAll("&#39;", "");
        assert.ok(!stripped.includes("<"), `raw < in: ${out}`);
        assert.ok(!stripped.includes(">"), `raw > in: ${out}`);
        assert.ok(!stripped.includes('"'), `raw " in: ${out}`);
        assert.ok(!stripped.includes("'"), `raw ' in: ${out}`);
      }),
    );
  });

  it("output never contains raw < or > (broad strings)", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const out = escapeHtml(s);
        const stripped = out
          .replaceAll("&amp;", "")
          .replaceAll("&lt;", "")
          .replaceAll("&gt;", "")
          .replaceAll("&quot;", "")
          .replaceAll("&#39;", "");
        assert.ok(!stripped.includes("<"));
        assert.ok(!stripped.includes(">"));
      }),
    );
  });

  it("double-encoding occurs — not idempotent for strings with special chars", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => /[<>"'&]/.test(s)),
        (s) => {
          const once = escapeHtml(s);
          const twice = escapeHtml(once);
          assert.notEqual(once, twice);
        },
      ),
    );
  });
});

// ─── hashString properties ───────────────────────────────────────────

describe("hashString properties", () => {
  it("is deterministic: hashString(s) === hashString(s)", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        assert.equal(hashString(s), hashString(s));
      }),
    );
  });

  it("returns a non-negative integer for all strings", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const h = hashString(s);
        assert.equal(typeof h, "number");
        assert.ok(h >= 0, `negative: ${h}`);
        assert.equal(h, Math.floor(h), `not integer: ${h}`);
      }),
    );
  });

  it("returns a non-negative integer for broad strings", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const h = hashString(s);
        assert.ok(h >= 0);
        assert.equal(h, Math.floor(h));
      }),
    );
  });
});

// ─── normalizeInsertIndex properties ─────────────────────────────────

describe("normalizeInsertIndex properties", () => {
  it("always returns a value in [0, arr.length]", () => {
    fc.assert(
      fc.property(
        fc.array(fc.anything()),
        fc.integer(),
        (arr, i) => {
          const result = normalizeInsertIndex(arr, i);
          assert.ok(result >= 0, `got ${result} < 0`);
          assert.ok(result <= arr.length, `got ${result} > ${arr.length}`);
        },
      ),
    );
  });

  it("returns arr.length for non-integer inputs", () => {
    fc.assert(
      fc.property(
        fc.array(fc.anything(), { minLength: 1 }),
        fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined), fc.constant(true)),
        (arr, i) => {
          const result = normalizeInsertIndex(arr, i);
          assert.equal(result, arr.length);
        },
      ),
    );
  });
});

// ─── colorForTimezone properties ─────────────────────────────────────

describe("colorForTimezone properties", () => {
  it("always returns a string starting with #", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const color = colorForTimezone(s);
        assert.equal(typeof color, "string");
        assert.ok(color.startsWith("#"), `"${color}" doesn't start with #`);
      }),
    );
  });
});

// ─── colorForManager properties ──────────────────────────────────────

describe("colorForManager properties", () => {
  it("always returns a string from the palette", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const color = colorForManager(s);
        assert.ok(
          managerPillPalette.includes(color),
          `"${color}" not in palette`,
        );
      }),
    );
  });
});
