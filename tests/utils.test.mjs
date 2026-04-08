import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  escapeHtml,
  hashString,
  colorForManager,
  colorForTimezone,
  pickRandomItem,
  initializeSequence,
  timezoneColors,
  managerPillPalette,
  parseUtcOffset,
  computeMaxTimezoneGap,
} from "../src/utils.mjs";

// ─── escapeHtml ──────────────────────────────────────────────────────

describe("escapeHtml", () => {
  it("encodes ampersand", () => {
    assert.equal(escapeHtml("a&b"), "a&amp;b");
  });

  it("encodes less-than", () => {
    assert.equal(escapeHtml("<div>"), "&lt;div&gt;");
  });

  it("encodes greater-than", () => {
    assert.equal(escapeHtml("a>b"), "a&gt;b");
  });

  it("encodes double quotes", () => {
    assert.equal(escapeHtml('a"b'), "a&quot;b");
  });

  it("encodes single quotes", () => {
    assert.equal(escapeHtml("a'b"), "a&#39;b");
  });

  it("handles empty string", () => {
    assert.equal(escapeHtml(""), "");
  });

  it("coerces numbers to string", () => {
    assert.equal(escapeHtml(42), "42");
  });

  it("returns string unchanged when no special chars", () => {
    assert.equal(escapeHtml("hello world"), "hello world");
  });

  it("encodes mixed special characters", () => {
    assert.equal(
      escapeHtml(`<a href="x">'&'</a>`),
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
    );
  });

  it("double-encodes already-encoded input", () => {
    assert.equal(escapeHtml("&amp;"), "&amp;amp;");
    assert.equal(escapeHtml("&lt;"), "&amp;lt;");
  });
});

// ─── hashString ──────────────────────────────────────────────────────

describe("hashString", () => {
  it("is deterministic — same input yields same output", () => {
    assert.equal(hashString("hello"), hashString("hello"));
  });

  it("returns a non-negative integer", () => {
    const h = hashString("test");
    assert.equal(typeof h, "number");
    assert.ok(h >= 0);
    assert.equal(h, Math.floor(h));
  });

  it("returns 0 for empty string", () => {
    assert.equal(hashString(""), 0);
  });

  it("produces different hashes for different strings", () => {
    const pairs = [
      ["a", "b"],
      ["hello", "world"],
      ["p1", "p2"],
      ["abc", "cba"],
    ];
    for (const [a, b] of pairs) {
      assert.notEqual(hashString(a), hashString(b), `"${a}" and "${b}" should differ`);
    }
  });
});

// ─── colorForManager ─────────────────────────────────────────────────

describe("colorForManager", () => {
  it("returns a string from the palette", () => {
    const color = colorForManager("p1");
    assert.ok(managerPillPalette.includes(color), `${color} not in palette`);
  });

  it("is deterministic for the same ID", () => {
    assert.equal(colorForManager("p1"), colorForManager("p1"));
    assert.equal(colorForManager("p99"), colorForManager("p99"));
  });

  it("returns a palette value for any string input", () => {
    for (const id of ["", "a", "abc123", "p1000"]) {
      assert.ok(managerPillPalette.includes(colorForManager(id)));
    }
  });
});

// ─── colorForTimezone ────────────────────────────────────────────────

describe("colorForTimezone", () => {
  it("returns known color for known timezones", () => {
    assert.equal(colorForTimezone("PST (UTC−8)"), "#dbeafe");
    assert.equal(colorForTimezone("GMT (UTC+0)"), "#d1fae5");
    assert.equal(colorForTimezone("JST (UTC+9)"), "#fce7f3");
  });

  it("returns fallback #e5e7eb for unknown timezone", () => {
    assert.equal(colorForTimezone("FAKE"), "#e5e7eb");
    assert.equal(colorForTimezone(""), "#e5e7eb");
  });

  it("covers all entries in timezoneColors", () => {
    for (const [tz, expected] of Object.entries(timezoneColors)) {
      assert.equal(colorForTimezone(tz), expected, `mismatch for ${tz}`);
    }
  });
});

// ─── pickRandomItem ──────────────────────────────────────────────────

describe("pickRandomItem", () => {
  it("returns an element from the array", () => {
    const items = ["a", "b", "c"];
    const result = pickRandomItem(items);
    assert.ok(items.includes(result));
  });

  it("returns the only element from a single-element array", () => {
    assert.equal(pickRandomItem(["only"]), "only");
  });

  it("handles arrays of numbers", () => {
    const items = [1, 2, 3];
    const result = pickRandomItem(items);
    assert.ok(items.includes(result));
  });
});

// ─── initializeSequence ─────────────────────────────────────────────

describe("initializeSequence", () => {
  it("extracts max sequence number from record keys", () => {
    const records = { p1: {}, p5: {}, p3: {} };
    assert.equal(initializeSequence(records, "p"), 5);
  });

  it("returns 0 for empty records", () => {
    assert.equal(initializeSequence({}, "p"), 0);
  });

  it("ignores keys that do not match the prefix", () => {
    const records = { t1: {}, t2: {}, p3: {} };
    assert.equal(initializeSequence(records, "t"), 2);
  });

  it("handles non-numeric suffixes gracefully", () => {
    const records = { p1: {}, pfoo: {}, p10: {} };
    assert.equal(initializeSequence(records, "p"), 10);
  });

  it("works with team prefix", () => {
    const records = { t1: {}, t4: {}, t2: {} };
    assert.equal(initializeSequence(records, "t"), 4);
  });
});

// ─── parseUtcOffset ──────────────────────────────────────────────────

describe("parseUtcOffset", () => {
  it("parses positive integer offset", () => {
    assert.equal(parseUtcOffset("CET (UTC+1)"), 1);
  });

  it("parses negative integer offset with minus sign", () => {
    assert.equal(parseUtcOffset("EST (UTC-5)"), -5);
  });

  it("parses negative integer offset with unicode minus", () => {
    assert.equal(parseUtcOffset("PST (UTC\u22128)"), -8);
  });

  it("parses fractional offset", () => {
    assert.equal(parseUtcOffset("IST (UTC+5:30)"), 5.5);
  });

  it("parses zero offset", () => {
    assert.equal(parseUtcOffset("GMT (UTC+0)"), 0);
  });

  it("parses large offset", () => {
    assert.equal(parseUtcOffset("NZST (UTC+12)"), 12);
  });

  it("returns NaN for invalid string", () => {
    assert.ok(Number.isNaN(parseUtcOffset("no timezone here")));
  });
});

// ─── computeMaxTimezoneGap ───────────────────────────────────────────

describe("computeMaxTimezoneGap", () => {
  it("returns 0 for empty array", () => {
    assert.equal(computeMaxTimezoneGap([]), 0);
  });

  it("returns 0 for single offset", () => {
    assert.equal(computeMaxTimezoneGap([5]), 0);
  });

  it("returns 0 for identical offsets", () => {
    assert.equal(computeMaxTimezoneGap([3, 3, 3]), 0);
  });

  it("computes gap between two offsets", () => {
    assert.equal(computeMaxTimezoneGap([-8, 0]), 8);
  });

  it("computes gap across multiple offsets", () => {
    assert.equal(computeMaxTimezoneGap([-8, -5, 0, 1, 9]), 17);
  });

  it("handles fractional offsets", () => {
    assert.equal(computeMaxTimezoneGap([0, 5.5]), 5.5);
  });
});
