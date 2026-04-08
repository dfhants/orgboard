export const timezoneColors = Object.create(null);
timezoneColors["PST (UTC−8)"] = "#dbeafe";
timezoneColors["MST (UTC−7)"] = "#bfdbfe";
timezoneColors["CST (UTC−6)"] = "#c7d2fe";
timezoneColors["EST (UTC−5)"] = "#e0e7ff";
timezoneColors["BRT (UTC−3)"] = "#a5b4fc";
timezoneColors["GMT (UTC+0)"] = "#d1fae5";
timezoneColors["CET (UTC+1)"] = "#a7f3d0";
timezoneColors["EAT (UTC+3)"] = "#fef3c7";
timezoneColors["IST (UTC+5:30)"] = "#fde68a";
timezoneColors["JST (UTC+9)"] = "#fce7f3";
timezoneColors["AEST (UTC+10)"] = "#ede9fe";
timezoneColors["NZST (UTC+12)"] = "#cffafe";

export function colorForTimezone(tz) {
  return timezoneColors[tz] ?? "#e5e7eb";
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
