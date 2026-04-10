// ─── SQLite persistence via sql.js (WASM) + IndexedDB ───

import initSqlJs from "sql.js";
import sqlWasm from "sql.js/dist/sql-wasm-browser.wasm?url";

const DB_NAME = "orgboard";
const DB_STORE = "database";
const DB_KEY = "main";
const DEBOUNCE_MS = 300;

let db = null;
let flushTimer = null;

// ─── IndexedDB helpers ───

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(store, key) {
  return new Promise((resolve, reject) => {
    const tx = store.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(store, key, value) {
  return new Promise((resolve, reject) => {
    const tx = store.transaction(DB_STORE, "readwrite");
    const req = tx.objectStore(DB_STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ─── Flush sql.js database binary to IndexedDB (debounced) ───

function flushToIDB() {
  if (!db) return;
  const data = db.export();
  openIDB().then((idb) => idbPut(idb, DB_KEY, data)).catch((err) => {
    console.error("OrgBoard: failed to persist DB to IndexedDB", err);
  });
}

function schedulePersist() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushToIDB, DEBOUNCE_MS);
}

// ─── Schema ───

function ensureSchema(database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS scenarios (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      state TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  // Validate that the expected columns exist (catches stale schemas)
  const cols = database.exec("PRAGMA table_info(scenarios)");
  const colNames = cols.length ? new Set(cols[0].values.map((r) => r[1])) : new Set();
  for (const required of ["id", "name", "state", "created_at", "updated_at"]) {
    if (!colNames.has(required)) {
      throw new Error(`scenarios table missing column: ${required}`);
    }
  }

  database.run(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS criteria (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      config TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0
    )
  `);
  // Migration: add pinned column if upgrading from older schema
  try { database.run("ALTER TABLE criteria ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0"); } catch (_) { /* already exists */ }
}

// ─── Public API ───

export async function initDB() {
  const SQL = await initSqlJs({
    locateFile: () => sqlWasm,
  });

  let savedData = null;
  try {
    const idb = await openIDB();
    savedData = await idbGet(idb, DB_KEY);
  } catch (_) {
    // First run or IDB unavailable — start fresh
  }

  try {
    db = savedData ? new SQL.Database(savedData) : new SQL.Database();
    ensureSchema(db);
  } catch (err) {
    console.warn("OrgBoard: stored database is corrupt, resetting to fresh DB.", err);
    try {
      const idb = await openIDB();
      await idbPut(idb, DB_KEY, null);
    } catch (_) {
      // Best-effort clear
    }
    db = new SQL.Database();
    ensureSchema(db);  // If this throws, it's a real bug — let it propagate
  }

  schedulePersist();
}

export function listScenarios() {
  const rows = db.exec("SELECT id, name, updated_at FROM scenarios ORDER BY created_at ASC");
  if (rows.length === 0) return [];
  return rows[0].values.map(([id, name, updated_at]) => ({ id, name, updated_at }));
}

export function loadScenario(id) {
  const stmt = db.prepare("SELECT state FROM scenarios WHERE id = ?");
  stmt.bind([id]);
  let result = null;
  if (stmt.step()) {
    result = JSON.parse(stmt.get()[0]);
  }
  stmt.free();
  return result;
}

export function saveScenario(id, name, stateObj) {
  // Use INSERT OR IGNORE for created_at so it only sets on first insert
  const now = Date.now();
  const stmt = db.prepare("SELECT 1 FROM scenarios WHERE id = ?");
  stmt.bind([id]);
  const exists = stmt.step();
  stmt.free();

  if (exists) {
    db.run(
      "UPDATE scenarios SET name = ?, state = ?, updated_at = ? WHERE id = ?",
      [name, JSON.stringify(stateObj), now, id]
    );
  } else {
    db.run(
      "INSERT INTO scenarios (id, name, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [id, name, JSON.stringify(stateObj), now, now]
    );
  }
  schedulePersist();
}

export function deleteScenario(id) {
  db.run("DELETE FROM scenarios WHERE id = ?", [id]);
  schedulePersist();
}

export function getMeta(key) {
  const stmt = db.prepare("SELECT value FROM meta WHERE key = ?");
  stmt.bind([key]);
  let result = null;
  if (stmt.step()) {
    result = stmt.get()[0];
  }
  stmt.free();
  return result;
}

export function setMeta(key, value) {
  db.run("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", [key, value]);
  schedulePersist();
}

// ─── Criteria CRUD ───

export function listCriteria() {
  const rows = db.exec("SELECT id, name, type, config, enabled, sort_order, pinned FROM criteria ORDER BY sort_order ASC, rowid ASC");
  if (rows.length === 0) return [];
  return rows[0].values.map(([id, name, type, config, enabled, sort_order, pinned]) => ({
    id, name, type, config: JSON.parse(config), enabled: !!enabled, sort_order, pinned: !!pinned,
  }));
}

export function saveCriterion(criterion) {
  const { id, name, type, config, enabled, sort_order, pinned } = criterion;
  db.run(
    "INSERT OR REPLACE INTO criteria (id, name, type, config, enabled, sort_order, pinned) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, name, type, JSON.stringify(config), enabled ? 1 : 0, sort_order ?? 0, pinned ? 1 : 0]
  );
  schedulePersist();
}

export function deleteCriterion(id) {
  db.run("DELETE FROM criteria WHERE id = ?", [id]);
  schedulePersist();
}

export function exportDB() {
  if (!db) return null;
  return db.export();
}
