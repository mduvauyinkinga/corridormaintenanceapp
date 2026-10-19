// db.js - database access layer.
// Default driver is real PostgreSQL via `pg`. When DATABASE_DRIVER=pglite,
// a PERSISTENT PGlite Postgres is used (dataDir on disk, zero-install
// dev/testing). Users, rooms, complaints all survive server restarts.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import config from "./config.js";

const { Pool } = pg;

let pool = null;
let pglite = null;

/** Directory where the persistent PGlite files live. */
function pgliteDataDir() {
  if (process.env.PGLITE_DATA_DIR) return process.env.PGLITE_DATA_DIR;
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.join(__dirname, "..", ".pglite-data");
}

/** Lazily create the pg connection pool. */
function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: config.databaseUrl });
    pool.on("error", (err) => console.error("[db] pool error:", err.message));
  }
  return pool;
}

/** Lazily create the persistent PGlite driver and wrap it to match pg. */
async function getPglite() {
  if (!pglite) {
    const { PGlite } = await import("@electric-sql/pglite");
    const dataDir = pgliteDataDir();
    // ":memory:" (used by the smoke test) keeps an isolated throwaway DB.
    let db;
    if (dataDir === ":memory:") {
      db = await PGlite.create();
    } else {
      fs.mkdirSync(dataDir, { recursive: true });
      db = await PGlite.create({ dataDir });
      console.log(`[db] pglite persistent storage: ${dataDir}`);
    }
    pglite = {
      query: (text, params) => db.query(text, params),
      connect: async () => ({
        query: (text, params) => db.query(text, params),
        exec: (text) => db.exec(text),
        release: () => {},
      }),
    };
  }
  return pglite;
}

async function getDriver() {
  if (config.databaseDriver === "pglite") return getPglite();
  return getPool();
}

/** Run a parameterised query and return the full result ({ rows, ... }). */
export async function query(text, params) {
  const driver = await getDriver();
  return driver.query(text, params);
}

/** Run a query and return just the rows array. */
export async function queryRows(text, params) {
  const result = await query(text, params);
  return result.rows;
}

/** Run a query and return the first row, or null. */
export async function queryRow(text, params) {
  const result = await query(text, params);
  return result.rows[0] || null;
}

/**
 * Get a client for a multi-statement transaction (BEGIN/COMMIT).
 * Returns { query, release }. For pg this is a dedicated pooled
 * connection; for pglite it is the single shared connection.
 */

export async function getClient() {
  if (config.databaseDriver === "pglite") {
    const d = await getPglite();
    return d.connect();
  }
  const client = await getPool().connect();
  return {
    query: (text, params) => client.query(text, params),
    exec: (text) => client.query(text),
    release: () => client.release(),
  };
}