/**
 * migrate.js
 * ------------------------------------------------------------------
 * Minimal, dependency-free migration runner.
 *
 * Every .sql file in src/migrations/ is applied once, in filename
 * order, inside a transaction. Applied files are recorded in the
 * schema_migrations table so they are never run twice.
 *
 * Run manually with:  npm run migrate
 * (src/index.js also calls runMigrations() at boot.)
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { query, getClient } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Apply any pending SQL migrations.
 * @returns {Promise<string[]>} the names of the files that were applied.
 */
export async function runMigrations() {
  await query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );

  const migrationsDir = path.join(__dirname, "migrations");
  const files = (await fs.readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = [];
  for (const file of files) {
    const already = await query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
    if (already.rows.length) continue;

    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    const client = await getClient();
    try {
      await client.query("BEGIN");
      await client.exec(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      applied.push(file);
      console.log(`[migrate] applied ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${err.message}`);
    } finally {
      client.release();
    }
  }

  if (applied.length === 0) {
    console.log("[migrate] no pending migrations");
  }
  return applied;
}

// Allow running directly: `npm run migrate`
if (process.argv[1] && process.argv[1].endsWith("migrate.js")) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}