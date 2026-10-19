# Archive — NOT part of the deployed site

Everything in this folder is kept for reference/one-time setup only.
The GitHub Pages workflow (`.github/workflows/deploy-site.yml`) never
publishes this directory.

## admin-tools/
Firestore-era seeding utilities (seed-tool.html, seed-rooms.js,
seed-units.js, verify-seed.js, migrate-units-to-two-beds.js) and their
README. The Express backend now seeds rooms + bed slots automatically at
boot (`server/src/controllers/seedController.js`), so these are obsolete
unless you ever need to re-seed the old Firestore database directly.

## firebase-legacy/
The Firebase configuration (firestore.rules, storage.rules,
firebase.json, firestore.indexes.json) and the Cloud Function
(`functions/`) that released beds when a resident profile was deleted.
Kept only for reference while the mobile app finishes migrating off
Firestore (see README "Architecture"). Once the mobile app runs fully on
the REST API, the Firebase project can be disabled and these deleted.

## TODO*.md
Completed task records kept as a historical log.