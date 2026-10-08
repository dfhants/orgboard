export const timezoneColors = Object.create(null);
// Ordered west → east so neighbouring timezones get neighbouring hues:
// Americas blue→violet, Europe/Africa green→yellow, Asia-Pacific orange→pink.
timezoneColors["PST (UTC−8)"] = "#0ea5e9";
timezoneColors["MST (UTC−7)"] = "#3b82f6";
timezoneColors["CST (UTC−6)"] = "#6366f1";
timezoneColors["EST (UTC−5)"] = "#8b5cf6";
timezoneColors["BRT (UTC−3)"] = "#a855f7";
timezoneColors["GMT (UTC+0)"] = "#10b981";
timezoneColors["CET (UTC+1)"] = "#84cc16";
timezoneColors["EAT (UTC+3)"] = "#eab308";
timezoneColors["IST (UTC+5:30)"] = "#f97316";
timezoneColors["JST (UTC+9)"] = "#ef4444";
timezoneColors["AEST (UTC+10)"] = "#ec4899";
timezoneColors["NZST (UTC+12)"] = "#d946ef";

export function colorForTimezone(tz) {
  return timezoneColors[tz] ?? "#9ca3af";
}

export const managerPillPalette = [
  "#818cf8", "#f472b6", "#fb923c", "#34d399", "#60a5fa",
  "#a78bfa", "#fbbf24", "#f87171", "#2dd4bf", "#e879f9",
];

export function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function colorForManager(employeeId) {
  return managerPillPalette[hashString(employeeId) % managerPillPalette.length];
}

export function pickRandomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

export function initializeSequence(records, prefix) {
  return Object.keys(records).reduce((max, key) => {
    const n = Number(key.replace(new RegExp(`^${prefix}`), ""));
    return Number.isNaN(n) ? max : Math.max(max, n);
  }, 0);
}

export const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

// ─── Timezone utilities ───

/** Parse a timezone label like "PST (UTC−8)" or "IST (UTC+5:30)" → numeric offset in hours. */
export function parseUtcOffset(tz) {
  const m = tz.match(/UTC([+\u2212-])(\d+)(?::(\d+))?/);
  if (!m) return NaN;
  const sign = m[1] === "\u2212" || m[1] === "-" ? -1 : 1;
  const hours = Number(m[2]);
  const minutes = m[3] ? Number(m[3]) : 0;
  return sign * (hours + minutes / 60);
}

/** Given an array of UTC offsets (numbers), return the max gap in hours between any two. */
export function computeMaxTimezoneGap(offsets) {
  if (offsets.length < 2) return 0;
  const unique = [...new Set(offsets)].sort((a, b) => a - b);
  if (unique.length < 2) return 0;
  return unique[unique.length - 1] - unique[0];
}

/**
 * Map a timezone gap (hours) to a ribbon color:
 *   0–4 h  → green  (easy overlap)
 *   5–8 h  → amber  (moderate spread)
 *   9+ h   → red    (difficult overlap)
 *   null/no employees → gray (neutral)
 */
export function ribbonColorForGap(gap) {
  if (gap == null) return "#c4c9d4";   // gray — no data
  if (gap <= 4)    return "#34d399";   // green
  if (gap <= 8)    return "#fbbf24";   // amber
  return "#f87171";                     // red
}

// ─── Check-status ribbon helpers ───

/**
 * Count how many team-scoped checks pass/fail for a given team.
 * `results` is the `results` array from `evaluateAllChecks()`.
 * `checkTypes` is the registry mapping type → { scope }.
 * Returns { passed, failed, total }.
 */
export function computeTeamCheckStatus(results, teamId, checkTypesRegistry) {
  let passed = 0;
  let failed = 0;
  for (const r of results) {
    const def = checkTypesRegistry[r.type];
    if (!def || def.scope !== "team") continue;
    const detail = r.details.find((d) => d.teamId === teamId);
    if (!detail) continue;
    if (detail.passed) passed++;
    else failed++;
  }
  return { passed, failed, total: passed + failed };
}

/**
 * Map a team's check status to a ribbon color.
 * Returns null when no team-scoped checks are active (caller falls through to timezone default).
 *   all pass → green
 *   mixed   → amber
 *   all fail → red
 */
export function ribbonColorForCheckStatus({ passed, failed, total }) {
  if (total === 0) return null;
  if (failed === 0) return "#34d399";   // green — all pass
  if (passed === 0) return "#f87171";   // red — all fail
  return "#fbbf24";                      // amber — mixed
}

/**
 * Build a tooltip string summarising check results for a team.
 * Returns null when no team-scoped checks are active.
 */
export function ribbonTooltipForCheckStatus(results, teamId, checkTypesRegistry) {
  const teamResults = [];
  for (const r of results) {
    const def = checkTypesRegistry[r.type];
    if (!def || def.scope !== "team") continue;
    const detail = r.details.find((d) => d.teamId === teamId);
    if (!detail) continue;
    teamResults.push({ name: r.criterionName, passed: detail.passed });
  }
  if (teamResults.length === 0) return null;
  const passing = teamResults.filter((r) => r.passed).length;
  const failing = teamResults.filter((r) => !r.passed);
  let tip = `${passing}/${teamResults.length} checks passing`;
  if (failing.length > 0) {
    const names = failing.slice(0, 3).map((r) => r.name);
    if (failing.length > 3) names.push(`+${failing.length - 3} more`);
    tip += `: ${names.join(", ")} \u2717`;
  }
  return tip;
}

// ─── Title → Level inference ───

/**
 * Infer an IC/management level from a job title string.
 * Returns a numeric level (2–9) or null if no pattern matches.
 *
 * L2: EVP
 * L3: SVP, Distinguished
 * L4: VP, Sr. Principal / Senior Principal
 * L5: Director, Principal
 * L6: Lead, Manager
 * L7: Senior (including "Senior Technical Program Manager")
 * L8: Engineer II / II suffix
 * L9: Engineer I / I suffix
 *
 * Order matters: more-specific / higher-seniority patterns are checked first.
 * "Senior" is checked before "Manager" so "Senior TPM" → L7 not L6.
 */
export function inferLevelFromTitle(title) {
  if (!title) return null;
  const t = title.toLowerCase();

  if (/\bevp\b/.test(t) || /\bexecutive vice president\b/.test(t)) return 2;
  if (/\bsvp\b/.test(t) || /\bsenior vice president\b/.test(t) || /\bdistinguished\b/.test(t)) return 3;
  if (/\bvp\b/.test(t) || /\bvice president\b/.test(t)) return 4;
  if (/\bsr\.?\s*principal\b/.test(t) || /\bsenior\s+principal\b/.test(t)) return 4;
  if (/\bdirector\b/.test(t)) return 5;
  if (/\bprincipal\b/.test(t)) return 5;
  if (/\bsenior\b/.test(t) || /\bsr\.\s/.test(t)) return 7;
  if (/\blead\b/.test(t) || /\bmanager\b/.test(t)) return 6;
  if (/\bii\b/.test(t)) return 8;
  if (/\bi\b/.test(t)) return 9;

  return null;
}

// ─── Location → Timezone inference ───

const locationTimezoneRules = [
  // US West Coast — PST (UTC−8)
  ["california", "PST (UTC−8)"], ["los angeles", "PST (UTC−8)"], ["san francisco", "PST (UTC−8)"],
  ["san jose", "PST (UTC−8)"], ["san diego", "PST (UTC−8)"], ["seattle", "PST (UTC−8)"],
  ["washington state", "PST (UTC−8)"], ["portland", "PST (UTC−8)"], ["oregon", "PST (UTC−8)"],
  ["nevada", "PST (UTC−8)"], ["las vegas", "PST (UTC−8)"],

  // US Mountain — MST (UTC−7)
  ["arizona", "MST (UTC−7)"], ["phoenix", "MST (UTC−7)"], ["denver", "MST (UTC−7)"],
  ["colorado", "MST (UTC−7)"], ["utah", "MST (UTC−7)"], ["salt lake", "MST (UTC−7)"],
  ["montana", "MST (UTC−7)"], ["wyoming", "MST (UTC−7)"], ["new mexico", "MST (UTC−7)"],
  ["idaho", "MST (UTC−7)"], ["boise", "MST (UTC−7)"],

  // US Central — CST (UTC−6)
  ["chicago", "CST (UTC−6)"], ["illinois", "CST (UTC−6)"], ["texas", "CST (UTC−6)"],
  ["houston", "CST (UTC−6)"], ["dallas", "CST (UTC−6)"], ["austin", "CST (UTC−6)"],
  ["san antonio", "CST (UTC−6)"], ["minnesota", "CST (UTC−6)"], ["minneapolis", "CST (UTC−6)"],
  ["wisconsin", "CST (UTC−6)"], ["iowa", "CST (UTC−6)"], ["missouri", "CST (UTC−6)"],
  ["kansas", "CST (UTC−6)"], ["nebraska", "CST (UTC−6)"], ["oklahoma", "CST (UTC−6)"],
  ["louisiana", "CST (UTC−6)"], ["new orleans", "CST (UTC−6)"], ["arkansas", "CST (UTC−6)"],
  ["mississippi", "CST (UTC−6)"], ["alabama", "CST (UTC−6)"], ["tennessee", "CST (UTC−6)"],
  ["nashville", "CST (UTC−6)"], ["memphis", "CST (UTC−6)"],
  ["north dakota", "CST (UTC−6)"], ["south dakota", "CST (UTC−6)"],

  // US Eastern — EST (UTC−5)
  ["new york", "EST (UTC−5)"], ["virginia", "EST (UTC−5)"], ["arlington", "EST (UTC−5)"],
  ["massachusetts", "EST (UTC−5)"], ["boston", "EST (UTC−5)"], ["pennsylvania", "EST (UTC−5)"],
  ["philadelphia", "EST (UTC−5)"], ["pittsburgh", "EST (UTC−5)"],
  ["new jersey", "EST (UTC−5)"], ["connecticut", "EST (UTC−5)"],
  ["maryland", "EST (UTC−5)"], ["washington, d", "EST (UTC−5)"],
  ["washington d", "EST (UTC−5)"], ["d.c.", "EST (UTC−5)"],
  ["georgia", "EST (UTC−5)"], ["atlanta", "EST (UTC−5)"],
  ["florida", "EST (UTC−5)"], ["miami", "EST (UTC−5)"], ["orlando", "EST (UTC−5)"],
  ["north carolina", "EST (UTC−5)"], ["south carolina", "EST (UTC−5)"],
  ["charlotte", "EST (UTC−5)"], ["raleigh", "EST (UTC−5)"],
  ["ohio", "EST (UTC−5)"], ["columbus", "EST (UTC−5)"], ["cleveland", "EST (UTC−5)"],
  ["michigan", "EST (UTC−5)"], ["detroit", "EST (UTC−5)"],
  ["indiana", "EST (UTC−5)"], ["kentucky", "EST (UTC−5)"],
  ["west virginia", "EST (UTC−5)"], ["maine", "EST (UTC−5)"],
  ["vermont", "EST (UTC−5)"], ["new hampshire", "EST (UTC−5)"],
  ["rhode island", "EST (UTC−5)"], ["delaware", "EST (UTC−5)"],

  // Canada
  ["vancouver", "PST (UTC−8)"], ["british columbia", "PST (UTC−8)"],
  ["calgary", "MST (UTC−7)"], ["edmonton", "MST (UTC−7)"], ["alberta", "MST (UTC−7)"],
  ["winnipeg", "CST (UTC−6)"], ["manitoba", "CST (UTC−6)"], ["saskatchewan", "CST (UTC−6)"],
  ["toronto", "EST (UTC−5)"], ["ottawa", "EST (UTC−5)"], ["montreal", "EST (UTC−5)"],
  ["ontario", "EST (UTC−5)"], ["quebec", "EST (UTC−5)"],
  ["halifax", "EST (UTC−5)"], ["nova scotia", "EST (UTC−5)"],
  ["newfoundland", "EST (UTC−5)"],

  // Latin America — BRT (UTC−3)
  ["brazil", "BRT (UTC−3)"], ["são paulo", "BRT (UTC−3)"], ["sao paulo", "BRT (UTC−3)"],
  ["rio de janeiro", "BRT (UTC−3)"], ["brasília", "BRT (UTC−3)"], ["brasilia", "BRT (UTC−3)"],
  ["argentina", "BRT (UTC−3)"], ["buenos aires", "BRT (UTC−3)"],
  ["bogotá", "EST (UTC−5)"], ["bogota", "EST (UTC−5)"], ["colombia", "EST (UTC−5)"],
  ["santiago", "EST (UTC−5)"], ["chile", "EST (UTC−5)"],
  ["lima", "EST (UTC−5)"], ["peru", "EST (UTC−5)"],
  ["mexico", "CST (UTC−6)"], ["ciudad de méxico", "CST (UTC−6)"],
  ["ciudad de mexico", "CST (UTC−6)"], ["guadalajara", "CST (UTC−6)"],
  ["monterrey", "CST (UTC−6)"],

  // UK & Ireland — GMT (UTC+0)
  ["london", "GMT (UTC+0)"], ["england", "GMT (UTC+0)"], ["united kingdom", "GMT (UTC+0)"],
  ["scotland", "GMT (UTC+0)"], ["edinburgh", "GMT (UTC+0)"], ["glasgow", "GMT (UTC+0)"],
  ["wales", "GMT (UTC+0)"], ["cardiff", "GMT (UTC+0)"],
  ["belfast", "GMT (UTC+0)"], ["northern ireland", "GMT (UTC+0)"],
  ["dublin", "GMT (UTC+0)"], ["ireland", "GMT (UTC+0)"],
  ["manchester", "GMT (UTC+0)"], ["birmingham", "GMT (UTC+0)"],
  ["cambridge", "GMT (UTC+0)"], ["oxford", "GMT (UTC+0)"],
  ["bristol", "GMT (UTC+0)"], ["leeds", "GMT (UTC+0)"],
  ["lisbon", "GMT (UTC+0)"], ["portugal", "GMT (UTC+0)"],
  ["iceland", "GMT (UTC+0)"], ["reykjavik", "GMT (UTC+0)"],

  // Western & Central Europe — CET (UTC+1)
  ["paris", "CET (UTC+1)"], ["france", "CET (UTC+1)"], ["lyon", "CET (UTC+1)"],
  ["berlin", "CET (UTC+1)"], ["germany", "CET (UTC+1)"], ["munich", "CET (UTC+1)"],
  ["münchen", "CET (UTC+1)"], ["frankfurt", "CET (UTC+1)"], ["hamburg", "CET (UTC+1)"],
  ["amsterdam", "CET (UTC+1)"], ["netherlands", "CET (UTC+1)"], ["rotterdam", "CET (UTC+1)"],
  ["brussels", "CET (UTC+1)"], ["belgium", "CET (UTC+1)"],
  ["madrid", "CET (UTC+1)"], ["spain", "CET (UTC+1)"], ["barcelona", "CET (UTC+1)"],
  ["rome", "CET (UTC+1)"], ["italy", "CET (UTC+1)"], ["milan", "CET (UTC+1)"],
  ["zurich", "CET (UTC+1)"], ["zürich", "CET (UTC+1)"], ["switzerland", "CET (UTC+1)"],
  ["geneva", "CET (UTC+1)"], ["bern", "CET (UTC+1)"],
  ["vienna", "CET (UTC+1)"], ["austria", "CET (UTC+1)"],
  ["stockholm", "CET (UTC+1)"], ["sweden", "CET (UTC+1)"],
  ["copenhagen", "CET (UTC+1)"], ["denmark", "CET (UTC+1)"],
  ["oslo", "CET (UTC+1)"], ["norway", "CET (UTC+1)"],
  ["helsinki", "CET (UTC+1)"], ["finland", "CET (UTC+1)"],
  ["prague", "CET (UTC+1)"], ["czech", "CET (UTC+1)"],
  ["warsaw", "CET (UTC+1)"], ["poland", "CET (UTC+1)"], ["krakow", "CET (UTC+1)"],
  ["budapest", "CET (UTC+1)"], ["hungary", "CET (UTC+1)"],
  ["bucharest", "CET (UTC+1)"], ["romania", "CET (UTC+1)"],
  ["sofia", "CET (UTC+1)"], ["bulgaria", "CET (UTC+1)"],
  ["croatia", "CET (UTC+1)"], ["zagreb", "CET (UTC+1)"],
  ["serbia", "CET (UTC+1)"], ["belgrade", "CET (UTC+1)"],
  ["luxembourg", "CET (UTC+1)"],

  // Eastern Europe & Middle East — EAT (UTC+3)
  ["athens", "EAT (UTC+3)"], ["greece", "EAT (UTC+3)"],
  ["istanbul", "EAT (UTC+3)"], ["turkey", "EAT (UTC+3)"], ["ankara", "EAT (UTC+3)"],
  ["kyiv", "EAT (UTC+3)"], ["ukraine", "EAT (UTC+3)"],
  ["moscow", "EAT (UTC+3)"], ["russia", "EAT (UTC+3)"],
  ["tel aviv", "EAT (UTC+3)"], ["israel", "EAT (UTC+3)"], ["jerusalem", "EAT (UTC+3)"],
  ["dubai", "EAT (UTC+3)"], ["uae", "EAT (UTC+3)"], ["abu dhabi", "EAT (UTC+3)"],
  ["saudi", "EAT (UTC+3)"], ["riyadh", "EAT (UTC+3)"],
  ["qatar", "EAT (UTC+3)"], ["doha", "EAT (UTC+3)"],
  ["bahrain", "EAT (UTC+3)"], ["kuwait", "EAT (UTC+3)"],
  ["cairo", "EAT (UTC+3)"], ["egypt", "EAT (UTC+3)"],

  // Africa — EAT (UTC+3) or GMT (UTC+0)
  ["nairobi", "EAT (UTC+3)"], ["kenya", "EAT (UTC+3)"],
  ["lagos", "CET (UTC+1)"], ["nigeria", "CET (UTC+1)"],
  ["south africa", "EAT (UTC+3)"], ["johannesburg", "EAT (UTC+3)"],
  ["cape town", "EAT (UTC+3)"],
  ["accra", "GMT (UTC+0)"], ["ghana", "GMT (UTC+0)"],

  // India — IST (UTC+5:30)
  ["india", "IST (UTC+5:30)"], ["bangalore", "IST (UTC+5:30)"], ["bengaluru", "IST (UTC+5:30)"],
  ["hyderabad", "IST (UTC+5:30)"], ["pune", "IST (UTC+5:30)"], ["mumbai", "IST (UTC+5:30)"],
  ["delhi", "IST (UTC+5:30)"], ["new delhi", "IST (UTC+5:30)"],
  ["chennai", "IST (UTC+5:30)"], ["kolkata", "IST (UTC+5:30)"],
  ["noida", "IST (UTC+5:30)"], ["gurgaon", "IST (UTC+5:30)"], ["gurugram", "IST (UTC+5:30)"],

  // East & Southeast Asia
  ["tokyo", "JST (UTC+9)"], ["japan", "JST (UTC+9)"], ["osaka", "JST (UTC+9)"],
  ["seoul", "JST (UTC+9)"], ["korea", "JST (UTC+9)"],
  ["beijing", "JST (UTC+9)"], ["shanghai", "JST (UTC+9)"], ["china", "JST (UTC+9)"],
  ["shenzhen", "JST (UTC+9)"], ["guangzhou", "JST (UTC+9)"],
  ["hong kong", "JST (UTC+9)"], ["taipei", "JST (UTC+9)"], ["taiwan", "JST (UTC+9)"],
  ["singapore", "JST (UTC+9)"],
  ["kuala lumpur", "JST (UTC+9)"], ["malaysia", "JST (UTC+9)"],
  ["bangkok", "JST (UTC+9)"], ["thailand", "JST (UTC+9)"],
  ["vietnam", "JST (UTC+9)"], ["ho chi minh", "JST (UTC+9)"], ["hanoi", "JST (UTC+9)"],
  ["jakarta", "JST (UTC+9)"], ["indonesia", "JST (UTC+9)"],
  ["manila", "JST (UTC+9)"], ["philippines", "JST (UTC+9)"],

  // Oceania
  ["sydney", "AEST (UTC+10)"], ["melbourne", "AEST (UTC+10)"], ["australia", "AEST (UTC+10)"],
  ["brisbane", "AEST (UTC+10)"], ["perth", "AEST (UTC+10)"], ["adelaide", "AEST (UTC+10)"],
  ["canberra", "AEST (UTC+10)"],
  ["new zealand", "NZST (UTC+12)"], ["auckland", "NZST (UTC+12)"], ["wellington", "NZST (UTC+12)"],
];

/**
 * Best-effort timezone inference from a location string.
 * Strips common prefixes like "Remote - " and "Vendor - " before matching.
 * Returns a timezone label from the predefined palette, or "GMT (UTC+0)" if no match.
 */
export function inferTimezoneFromLocation(location) {
  if (!location) return "GMT (UTC+0)";
  // Strip common Workday prefixes
  let loc = location.replace(/^(remote|vendor)\s*[-–—]\s*/i, "").toLowerCase();
  for (const [pattern, tz] of locationTimezoneRules) {
    if (loc.includes(pattern)) return tz;
  }
  return "GMT (UTC+0)";
}

// ─── Name cleaning ───

/**
 * Clean a name string: strip [C] contingent marker, (On Leave), and redundant
 * self-references like "Sydney Green (Sydney Green)". Applied to both employee
 * names and resolved manager names so they match during hierarchy building.
 */
export function cleanName(raw) {
  let name = raw;
  name = name.replace(/\s*\[C\]\s*$/, "").trim();
  name = name.replace(/\s*\(On Leave\)\s*$/i, "").trim();
  const dupeMatch = name.match(/^(.+?)\s*\(\1\)\s*$/);
  if (dupeMatch) name = dupeMatch[1].trim();
  return name;
}
