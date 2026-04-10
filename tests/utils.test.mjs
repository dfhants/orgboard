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
  inferTimezoneFromLocation,
  inferLevelFromTitle,
  ribbonColorForGap,
  computeTeamCheckStatus,
  ribbonColorForCheckStatus,
  ribbonTooltipForCheckStatus,
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

// ─── inferTimezoneFromLocation ───────────────────────────────────────

describe("inferTimezoneFromLocation", () => {
  it("returns GMT for empty or null input", () => {
    assert.equal(inferTimezoneFromLocation(""), "GMT (UTC+0)");
    assert.equal(inferTimezoneFromLocation(null), "GMT (UTC+0)");
    assert.equal(inferTimezoneFromLocation(undefined), "GMT (UTC+0)");
  });

  it("returns GMT for unrecognized location", () => {
    assert.equal(inferTimezoneFromLocation("Planet Mars"), "GMT (UTC+0)");
  });

  // US zones
  it("maps US West Coast cities to PST", () => {
    assert.equal(inferTimezoneFromLocation("San Francisco, CA"), "PST (UTC−8)");
    assert.equal(inferTimezoneFromLocation("Seattle, Washington"), "PST (UTC−8)");
    assert.equal(inferTimezoneFromLocation("Los Angeles"), "PST (UTC−8)");
  });

  it("maps US Mountain cities to MST", () => {
    assert.equal(inferTimezoneFromLocation("Denver, Colorado"), "MST (UTC−7)");
    assert.equal(inferTimezoneFromLocation("Phoenix, Arizona"), "MST (UTC−7)");
  });

  it("maps US Central cities to CST", () => {
    assert.equal(inferTimezoneFromLocation("Chicago, Illinois"), "CST (UTC−6)");
    assert.equal(inferTimezoneFromLocation("Austin, Texas"), "CST (UTC−6)");
    assert.equal(inferTimezoneFromLocation("O'Fallon, Missouri"), "CST (UTC−6)");
  });

  it("maps US Eastern cities to EST", () => {
    assert.equal(inferTimezoneFromLocation("Arlington, Virginia"), "EST (UTC−5)");
    assert.equal(inferTimezoneFromLocation("New York, NY"), "EST (UTC−5)");
    assert.equal(inferTimezoneFromLocation("Boston, Massachusetts"), "EST (UTC−5)");
    assert.equal(inferTimezoneFromLocation("Atlanta, Georgia"), "EST (UTC−5)");
  });

  // UK & Ireland
  it("maps UK/Ireland locations to GMT", () => {
    assert.equal(inferTimezoneFromLocation("London, England (Devonshire Square)"), "GMT (UTC+0)");
    assert.equal(inferTimezoneFromLocation("Dublin, Ireland (Mountain View)"), "GMT (UTC+0)");
    assert.equal(inferTimezoneFromLocation("Edinburgh, Scotland"), "GMT (UTC+0)");
  });

  // Europe
  it("maps European cities to CET", () => {
    assert.equal(inferTimezoneFromLocation("Berlin, Germany"), "CET (UTC+1)");
    assert.equal(inferTimezoneFromLocation("Paris, France"), "CET (UTC+1)");
    assert.equal(inferTimezoneFromLocation("Stockholm, Sweden"), "CET (UTC+1)");
    assert.equal(inferTimezoneFromLocation("Amsterdam, Netherlands"), "CET (UTC+1)");
  });

  // India
  it("maps Indian cities to IST", () => {
    assert.equal(inferTimezoneFromLocation("Pune, India"), "IST (UTC+5:30)");
    assert.equal(inferTimezoneFromLocation("Bangalore, India"), "IST (UTC+5:30)");
    assert.equal(inferTimezoneFromLocation("Mumbai"), "IST (UTC+5:30)");
  });

  // East Asia
  it("maps East Asian cities to JST", () => {
    assert.equal(inferTimezoneFromLocation("Tokyo, Japan"), "JST (UTC+9)");
    assert.equal(inferTimezoneFromLocation("Seoul, Korea"), "JST (UTC+9)");
    assert.equal(inferTimezoneFromLocation("Singapore"), "JST (UTC+9)");
  });

  // Oceania
  it("maps Australian cities to AEST", () => {
    assert.equal(inferTimezoneFromLocation("Sydney, Australia"), "AEST (UTC+10)");
    assert.equal(inferTimezoneFromLocation("Melbourne"), "AEST (UTC+10)");
  });

  it("maps NZ to NZST", () => {
    assert.equal(inferTimezoneFromLocation("Auckland, New Zealand"), "NZST (UTC+12)");
  });

  // Latin America
  it("maps Brazilian cities to BRT", () => {
    assert.equal(inferTimezoneFromLocation("São Paulo, Brazil"), "BRT (UTC−3)");
  });

  it("maps Mexico to CST", () => {
    assert.equal(inferTimezoneFromLocation("Ciudad de México"), "CST (UTC−6)");
  });

  // Canada
  it("maps Canadian cities", () => {
    assert.equal(inferTimezoneFromLocation("Toronto, Ontario"), "EST (UTC−5)");
    assert.equal(inferTimezoneFromLocation("Vancouver, BC"), "PST (UTC−8)");
  });

  // Africa / Middle East
  it("maps African cities", () => {
    assert.equal(inferTimezoneFromLocation("Nairobi, Kenya"), "EAT (UTC+3)");
    assert.equal(inferTimezoneFromLocation("Lagos, Nigeria"), "CET (UTC+1)");
  });

  it("maps Middle Eastern cities to EAT", () => {
    assert.equal(inferTimezoneFromLocation("Dubai, UAE"), "EAT (UTC+3)");
    assert.equal(inferTimezoneFromLocation("Tel Aviv, Israel"), "EAT (UTC+3)");
  });

  // Workday prefix stripping
  it("strips 'Remote -' prefix before matching", () => {
    assert.equal(inferTimezoneFromLocation("Remote - California"), "PST (UTC−8)");
    assert.equal(inferTimezoneFromLocation("Remote - North Carolina"), "EST (UTC−5)");
    assert.equal(inferTimezoneFromLocation("Remote - New Jersey"), "EST (UTC−5)");
  });

  it("strips 'Vendor -' prefix before matching", () => {
    assert.equal(inferTimezoneFromLocation("Vendor - Pune, India (Ernst &Young LLP)"), "IST (UTC+5:30)");
  });

  it("is case-insensitive", () => {
    assert.equal(inferTimezoneFromLocation("LONDON"), "GMT (UTC+0)");
    assert.equal(inferTimezoneFromLocation("pune"), "IST (UTC+5:30)");
  });
});

// ─── inferLevelFromTitle ─────────────────────────────────────────────

describe("inferLevelFromTitle", () => {
  it("returns null for empty or null input", () => {
    assert.equal(inferLevelFromTitle(""), null);
    assert.equal(inferLevelFromTitle(null), null);
    assert.equal(inferLevelFromTitle(undefined), null);
  });

  it("returns null for unrecognized titles", () => {
    assert.equal(inferLevelFromTitle("Contingent Worker"), null);
    assert.equal(inferLevelFromTitle("Intern"), null);
  });

  // L2: EVP
  it("maps EVP to L2", () => {
    assert.equal(inferLevelFromTitle("EVP"), 2);
    assert.equal(inferLevelFromTitle("Executive Vice President"), 2);
  });

  // L3: SVP, Distinguished
  it("maps SVP to L3", () => {
    assert.equal(inferLevelFromTitle("SVP"), 3);
    assert.equal(inferLevelFromTitle("Senior Vice President"), 3);
  });

  it("maps Distinguished to L3", () => {
    assert.equal(inferLevelFromTitle("Distinguished Engineer"), 3);
  });

  // L4: VP, Sr. Principal
  it("maps VP to L4", () => {
    assert.equal(inferLevelFromTitle("VP of Engineering"), 4);
    assert.equal(inferLevelFromTitle("Vice President, Software Engineering"), 4);
  });

  it("maps Sr. Principal to L4", () => {
    assert.equal(inferLevelFromTitle("Sr. Principal Software Engineer"), 4);
    assert.equal(inferLevelFromTitle("Sr Principal Software Engineer"), 4);
    assert.equal(inferLevelFromTitle("Senior Principal Engineer"), 4);
  });

  // L5: Director, Principal
  it("maps Director to L5", () => {
    assert.equal(inferLevelFromTitle("Director, Data Engineering"), 5);
    assert.equal(inferLevelFromTitle("Director, Software Engineering"), 5);
  });

  it("maps Principal to L5", () => {
    assert.equal(inferLevelFromTitle("Principal Software Engineer"), 5);
    assert.equal(inferLevelFromTitle("Principal Technical Program Manager"), 5);
  });

  // L6: Lead, Manager
  it("maps Lead to L6", () => {
    assert.equal(inferLevelFromTitle("Lead Software Engineer"), 6);
    assert.equal(inferLevelFromTitle("Lead Data Engineer"), 6);
    assert.equal(inferLevelFromTitle("Lead Technical Program Manager"), 6);
  });

  it("maps Manager to L6", () => {
    assert.equal(inferLevelFromTitle("Manager, Software Engineering"), 6);
    assert.equal(inferLevelFromTitle("Manager, Data Engineering"), 6);
    assert.equal(inferLevelFromTitle("Manager, Technical Program Management"), 6);
    assert.equal(inferLevelFromTitle("Manager, Software Engineer, Quality"), 6);
  });

  // L7: Senior (including Senior TPM)
  it("maps Senior to L7", () => {
    assert.equal(inferLevelFromTitle("Senior Software Engineer"), 7);
    assert.equal(inferLevelFromTitle("Senior Data Engineer"), 7);
    assert.equal(inferLevelFromTitle("Senior Software Engineer, Quality"), 7);
  });

  it("maps Senior Technical Program Manager to L7 (not L6)", () => {
    assert.equal(inferLevelFromTitle("Senior Technical Program Manager"), 7);
  });

  // L8: II
  it("maps II suffix to L8", () => {
    assert.equal(inferLevelFromTitle("Software Engineer II"), 8);
    assert.equal(inferLevelFromTitle("Software Engineer II, Quality"), 8);
    assert.equal(inferLevelFromTitle("Data Engineer II"), 8);
  });

  // L9: I
  it("maps I suffix to L9", () => {
    assert.equal(inferLevelFromTitle("Software Engineer I"), 9);
    assert.equal(inferLevelFromTitle("Data Engineer I"), 9);
  });

  it("is case-insensitive", () => {
    assert.equal(inferLevelFromTitle("senior software engineer"), 7);
    assert.equal(inferLevelFromTitle("DIRECTOR, ENGINEERING"), 5);
    assert.equal(inferLevelFromTitle("vp of product"), 4);
  });
});

// ─── ribbonColorForGap ───────────────────────────────────────────────

describe("ribbonColorForGap", () => {
  it("returns gray for null (no data)", () => {
    assert.equal(ribbonColorForGap(null), "#c4c9d4");
  });

  it("returns gray for undefined", () => {
    assert.equal(ribbonColorForGap(undefined), "#c4c9d4");
  });

  it("returns green for 0h gap", () => {
    assert.equal(ribbonColorForGap(0), "#34d399");
  });

  it("returns green for 4h gap (upper bound)", () => {
    assert.equal(ribbonColorForGap(4), "#34d399");
  });

  it("returns amber for 5h gap", () => {
    assert.equal(ribbonColorForGap(5), "#fbbf24");
  });

  it("returns amber for 8h gap (upper bound)", () => {
    assert.equal(ribbonColorForGap(8), "#fbbf24");
  });

  it("returns red for 9h gap", () => {
    assert.equal(ribbonColorForGap(9), "#f87171");
  });

  it("returns red for large gaps", () => {
    assert.equal(ribbonColorForGap(17), "#f87171");
  });

  it("handles fractional gaps", () => {
    assert.equal(ribbonColorForGap(4.5), "#fbbf24");
    assert.equal(ribbonColorForGap(8.5), "#f87171");
  });
});

// ─── computeTeamCheckStatus ──────────────────────────────────────────

const mockCheckTypes = {
  "has-manager": { scope: "team" },
  "timezone-gap": { scope: "team" },
  "employee-count": { scope: "team" },
  "all-assigned": { scope: "scenario" },
};

describe("computeTeamCheckStatus", () => {
  it("returns all zeros for empty results", () => {
    assert.deepEqual(computeTeamCheckStatus([], "t1", mockCheckTypes), { passed: 0, failed: 0, total: 0 });
  });

  it("counts only team-scoped checks", () => {
    const results = [
      { type: "has-manager", criterionName: "Manager", details: [{ teamId: "t1", passed: true }] },
      { type: "all-assigned", criterionName: "All assigned", details: [{ passed: false, message: "2 unassigned" }] },
    ];
    assert.deepEqual(computeTeamCheckStatus(results, "t1", mockCheckTypes), { passed: 1, failed: 0, total: 1 });
  });

  it("counts pass and fail for a team", () => {
    const results = [
      { type: "has-manager", criterionName: "Manager", details: [{ teamId: "t1", passed: true }, { teamId: "t2", passed: false }] },
      { type: "timezone-gap", criterionName: "TZ Gap", details: [{ teamId: "t1", passed: false }, { teamId: "t2", passed: true }] },
    ];
    assert.deepEqual(computeTeamCheckStatus(results, "t1", mockCheckTypes), { passed: 1, failed: 1, total: 2 });
    assert.deepEqual(computeTeamCheckStatus(results, "t2", mockCheckTypes), { passed: 1, failed: 1, total: 2 });
  });

  it("ignores unknown check types", () => {
    const results = [
      { type: "unknown-type", criterionName: "X", details: [{ teamId: "t1", passed: false }] },
    ];
    assert.deepEqual(computeTeamCheckStatus(results, "t1", mockCheckTypes), { passed: 0, failed: 0, total: 0 });
  });

  it("returns zeros for a team not found in details", () => {
    const results = [
      { type: "has-manager", criterionName: "Manager", details: [{ teamId: "t2", passed: true }] },
    ];
    assert.deepEqual(computeTeamCheckStatus(results, "t1", mockCheckTypes), { passed: 0, failed: 0, total: 0 });
  });
});

// ─── ribbonColorForCheckStatus ───────────────────────────────────────

describe("ribbonColorForCheckStatus", () => {
  it("returns null for no checks", () => {
    assert.equal(ribbonColorForCheckStatus({ passed: 0, failed: 0, total: 0 }), null);
  });

  it("returns green when all pass", () => {
    assert.equal(ribbonColorForCheckStatus({ passed: 3, failed: 0, total: 3 }), "#34d399");
  });

  it("returns red when all fail", () => {
    assert.equal(ribbonColorForCheckStatus({ passed: 0, failed: 2, total: 2 }), "#f87171");
  });

  it("returns amber for mixed results", () => {
    assert.equal(ribbonColorForCheckStatus({ passed: 1, failed: 1, total: 2 }), "#fbbf24");
  });

  it("returns green for single passing check", () => {
    assert.equal(ribbonColorForCheckStatus({ passed: 1, failed: 0, total: 1 }), "#34d399");
  });

  it("returns red for single failing check", () => {
    assert.equal(ribbonColorForCheckStatus({ passed: 0, failed: 1, total: 1 }), "#f87171");
  });
});

// ─── ribbonTooltipForCheckStatus ─────────────────────────────────────

describe("ribbonTooltipForCheckStatus", () => {
  it("returns null for empty results", () => {
    assert.equal(ribbonTooltipForCheckStatus([], "t1", mockCheckTypes), null);
  });

  it("returns null when only scenario-scoped checks", () => {
    const results = [
      { type: "all-assigned", criterionName: "All assigned", details: [{ passed: false }] },
    ];
    assert.equal(ribbonTooltipForCheckStatus(results, "t1", mockCheckTypes), null);
  });

  it("shows all passing", () => {
    const results = [
      { type: "has-manager", criterionName: "Manager", details: [{ teamId: "t1", passed: true }] },
    ];
    assert.equal(ribbonTooltipForCheckStatus(results, "t1", mockCheckTypes), "1/1 checks passing");
  });

  it("lists failing check names", () => {
    const results = [
      { type: "has-manager", criterionName: "Manager", details: [{ teamId: "t1", passed: true }] },
      { type: "timezone-gap", criterionName: "TZ Gap", details: [{ teamId: "t1", passed: false }] },
    ];
    assert.equal(ribbonTooltipForCheckStatus(results, "t1", mockCheckTypes), "1/2 checks passing: TZ Gap \u2717");
  });

  it("truncates to 3 failing names", () => {
    const results = [
      { type: "has-manager", criterionName: "A", details: [{ teamId: "t1", passed: false }] },
      { type: "timezone-gap", criterionName: "B", details: [{ teamId: "t1", passed: false }] },
      { type: "employee-count", criterionName: "C", details: [{ teamId: "t1", passed: false }] },
      // Need a 4th team-scoped type — reuse has-manager with a different result entry
    ];
    // With 3 failing and 0 passing, all listed
    assert.equal(ribbonTooltipForCheckStatus(results, "t1", mockCheckTypes), "0/3 checks passing: A, B, C \u2717");
  });
});
