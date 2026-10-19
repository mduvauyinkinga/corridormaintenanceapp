// index.js - entry point: validate config, migrate, seed, then listen.
import { createApp } from "./app.js";
import config, { validateConfig } from "./config.js";
import { runMigrations } from "./migrate.js";
import { seedManagementAccount, seedRoomsIfEmpty } from "./controllers/seedController.js";
import { startRetentionScheduler } from "./services/retention.js";

async function main() {
  validateConfig();
  await runMigrations();
  await seedManagementAccount();
  await seedRoomsIfEmpty();
  startRetentionScheduler();
  const app = createApp();
  app.listen(config.port, () => {
    console.log("API listening on http://localhost:" + config.port);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err.message);
  process.exit(1);
});