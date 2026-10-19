# Admin / Seed Tools — KEEP LOCALLY, DO NOT PUBLISH TO RESIDENTS

These files are REQUIRED for the one-time initial production setup and
any future migration, but they must NOT be part of the final
resident-facing GitHub Pages deployment:

- `seed-tool.html` — management-gated UI wrapper for seeding/verifying
- `seed-rooms.js` — creates `rooms` (250 docs)
- `seed-units.js` — creates `units` (1,500 bed slots)
- `verify-seed.js` — read-only verification of rooms + units
- `migrate-units-to-two-beds.js` — one-time migration from legacy
  single-slot `F506-A` format to modern `F506-A-1` / `F506-A-2` beds
- `js/seed-auth.js` — shared `requireManagement()` guard used by the
  scripts above

Safety notes:

- All write utilities enforce `requireManagement()` and Firestore rules
  additionally restrict `rooms`/`units` writes to `isManagement()`.
- `verify-seed.js` is read-only.
- No production page (`index`, `login`, `register`, `choose-room`,
  `dashboard`, `complaint`, `tracking`, `management`) imports these
  utilities. `seed-tool.html` is the only entry point and is already
  `noindex, nofollow` + disallowed in `robots.txt`.
- Before the final public deploy: move these to a private admin branch,
  `git rm` them, or publish Pages from a clean export that excludes them.
  Do NOT delete them before seeding + migration are complete.
