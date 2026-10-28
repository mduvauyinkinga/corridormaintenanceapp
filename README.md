# Corridor Hill Residence Maintenance System

A production-quality maintenance-reporting system for Corridor Hill
Residence. Three pieces ship from this repository:

1. **Website** — static HTML5/CSS3/Vanilla JS (ES6 Modules), no
   frameworks, no build tools. Hosted on **GitHub Pages**.
2. **API** — self-coded **Express + PostgreSQL** backend (`server/`)
   with JWT auth and role-based access. Hosted on **Render** (see
   `render.yaml`).
3. **Mobile app** — **Expo / React Native** client (`mobile/`),
   distributed via **EAS Build**. Mid-migration: auth already runs on
   the API; the remaining data services still use Firebase and are
   being ported to the REST endpoints (see "Mobile migration" below).

---

## Tech Stack

- Website: HTML5, CSS3, Vanilla JS (ES6 Modules).
- API: Node.js (ESM), Express 4, `pg`, `jsonwebtoken`, `bcryptjs`,
  `helmet`, `express-rate-limit`.
- Database: PostgreSQL (Render Postgres / Neon / Supabase / local).
- Mobile: Expo SDK 57, React Navigation.

---

## Security model

- **Passwords** hashed with bcrypt (min 8 characters).
- **JWT** Bearer tokens; every protected request re-reads the user row
  so role changes take effect immediately. Tokens expire (default 7d).
- **Roles**: `resident` and `management`. Management-only endpoints
  are guarded server-side (`requireRole(["management"])`).
- **Rate limiting**: 30 requests / 15 min on `/api/auth`, 600 / 15 min
  globally (disabled when `NODE_ENV=test`).
- **Anti-enumeration**: login returns one generic failure message for
  both unknown email and wrong password.
- **Input limits**: field-length caps on names, student numbers,
  categories, issues, notes and announcements; photo uploads limited
  to 5 images, ~1.5 MB each, JPEG/PNG/WebP only.
- **Production boot guards**: the server refuses to start with
  `CORS_ORIGIN=*` or a `JWT_SECRET` shorter than 32 characters.
- The frontend renders all user data with `textContent` (no
  `innerHTML` with dynamic data), so stored XSS is not possible.

---

## Website structure

```
/
├── index.html            landing page
├── login.html            sign in
├── register.html         resident registration (@tut4life.ac.za only)
├── choose-room.html      block -> room -> bed selection
├── dashboard.html        resident overview
├── complaint.html        submit a complaint (photos allowed)
├── tracking.html         resident complaint tracking + timeline
├── management.html       management dashboard (complaints, residents,
│                         occupancy, units, announcements)
├── 404.html
├── css/                  style, auth, forms, dashboard, management, responsive
├── js/
│   ├── config.js         environment switch (local vs production API URL)
│   ├── api.js            HTTP client (JWT storage, fetch wrapper)
│   ├── auth.js           route guards (requireAuth / requireRole) +
│   │                     session-expiry warning
│   ├── nav.js            shared navbar + logout
│   ├── modal.js          shared dialog a11y (focus trap, focus restore,
│   │                     Escape, nested dialogs) for every modal
│   ├── register.js / login.js / choose-room.js
│   ├── dashboard.js / complaints.js / tracking.js
│   ├── management.js / timeline.js / lightbox.js / upload.js
│   └── utils.js          DOM + validation + toast helpers
├── assets/               images, icons
├── server/               Express API (see below)
├── mobile/               Expo app (see below)
├── archive/              legacy Firebase files & one-time tools — never deployed
├── render.yaml           Render blueprint (API + Postgres)
└── .github/workflows/deploy-site.yml   Pages deployment (site files only)
```

---

## Running locally

### 1. API

```powershell
cd server
copy .env.example .env    # then edit values (see below)
npm install
npm run dev               # http://localhost:4000
```

`.env` values for local development (zero-install database):

```
DATABASE_DRIVER=pglite
JWT_SECRET=<any random string, 32+ chars for production>
CORS_ORIGIN=*
```

The server runs migrations and seeds rooms/beds automatically on boot
when the database is empty. The optional `MANAGER_EMAIL` /
`MANAGER_PASSWORD` env vars create the management account at boot.

Smoke test (isolated in-memory database, never touches your dev data):

```powershell
npm run smoke
```

### 2. Website

Serve the repo root (ES modules need HTTP, not `file://`):

```powershell
python -m http.server 8080   # or VS Code "Live Server"
```

Open `http://localhost:8080`. `js/config.js` automatically points the
site at `http://localhost:4000` when running locally.

### 3. Mobile

```powershell
cd mobile
npm install
npm start                  # Android emulator -> http://10.0.2.2:4000
# physical device:
$env:EXPO_PUBLIC_API_BASE_URL="http://<your-PC-LAN-IP>:4000"; npm start
```

---

## Deployment

### API → Render

1. Push the repo to GitHub.
2. Render Dashboard → **New → Blueprint** → select the repo
   (`render.yaml` defines the API service + free Postgres).
3. In the service environment settings set `CORS_ORIGIN` to your
   GitHub Pages URL (`https://<username>.github.io`) and fill in
   `MANAGER_EMAIL` / `MANAGER_PASSWORD` (8+ characters).
4. Deploy. The health check is `/api/health`; migrations and seeding
   run at boot.

### Website → GitHub Pages

1. Repo Settings → Pages → Source: **GitHub Actions**.
2. Push to `main`; the workflow
   (`.github/workflows/deploy-site.yml`) publishes only the
   resident-facing files — admin tools and archives are excluded.
3. After the first API deploy, put the real Render URL into
   `js/config.js` (`PROD_API_BASE`) and push again.

### Mobile → Play Store (EAS)

```powershell
cd mobile
npx eas build --profile preview --platform android   # internal APK
npx eas build --profile production --platform android
```

Set `EXPO_PUBLIC_API_BASE_URL=https://<render-service>.onrender.com`
for production builds (EAS env var or `eas.json`).

---

## API overview

All routes are under `/api`. Protected routes require
`Authorization: Bearer <token>`.

| Method | Route | Access | Purpose |
|--------|-------|--------|---------|
| POST | /auth/register | public | resident sign-up (domain-restricted) |
| POST | /auth/login | public | email + password sign-in |
| GET | /auth/me | signed in | current profile |
| POST | /auth/logout | signed in | token discard |
| GET | /rooms?block= | signed in | rooms in a block |
| GET | /units?roomId= | signed in | bed slots in a room |
| POST | /units/claim | signed in | atomic bed claim (uid from JWT) |
| GET/POST | /complaints | resident | list own (or `?scope=unit` own + unit mates) / create |
| GET | /complaints/:id | owner, unit mate or management | read a report |
| PATCH/… | /complaints/:id | owner or management | edit, cancel, reopen |
| PATCH | /complaints/:id/status,priority,dates | management | workflow updates |
| GET/POST | /complaints/:id/notes | see notes | maintenance notes |
| GET | /complaints/:id/timeline | owner, unit mate or management | lifecycle events |
| GET | /complaints/:id/photos/:pid | owner, unit mate or management | photo bytes |

### Unit mates see each other's reports

Two beds share one lettered unit (e.g. `A101-A-1` and `A101-A-2`).
`GET /complaints?scope=unit` returns the resident's own reports **plus**
everything the other bed has already filed, so nobody reports the same
fault twice. Every row carries `residentName`, which the tracking screens
render as "Reported by". Unit mates can open the details, timeline, notes
and photos of a shared report, but **edit / cancel / reopen remain limited
to the resident who filed it** (and management). Without `scope=unit` the
list stays own-only, so dashboard statistics still count only your own
complaints.

### Photo URLs are signed

Photos are rendered by `<img src>` (web) and `<Image source>` (mobile),
neither of which can send an `Authorization` header. The photo route
therefore accepts **either** a valid Bearer token **or** a short-lived
HMAC signature (`?exp=<unix>&sig=<hex>`) appended to the path by
`toPublicComplaint`. Keys derive from `JWT_SECRET` via
`server/src/photoToken.js`, signatures never contain the token itself,
and a leaked URL stops working when it expires (default 7 days;
override with `PHOTO_URL_TTL_SECONDS`). Forged, missing, or expired
signatures are rejected with 401/403. Because of this, the photo route
is registered *before* the router-wide `requireAuth` guard and uses
`optionalAuth` instead.
| GET/POST | /announcements | signed in / management | per-room messages |
| GET | /admin/users, /admin/overview | management | bulk reads |
| POST | /admin/seed, /admin/release-orphans | management | maintenance |

---

## Database model

```
users(id, name, student_number, email, password_hash, role,
      room_id, unit_id, room_letter, block, room_number, created_at)

rooms(id, block, room_number, floor)

units(id, room_id, room_letter, bed_number, occupied,
      resident_id, block, room_number, floor)

complaints(id, resident_id, room_id, unit_id, issues[], category,
           priority, notes, status, reopen_requested, reopen_status,
           photo_urls[], estimated_completion, actual_completion,
           archived, archived_at, created_at, updated_at)

complaint_photos(id, complaint_id, mime_type, data)
timeline_events(id, complaint_id, action, description,
                author_id, author_name, author_role, created_at)
maintenance_notes(id, complaint_id, text, author_id, author_name,
                  created_at)
unit_announcements(id, room_id, message, author_name, created_at)
```

Rooms/beds: each parent room (e.g. `F506`) has sub-rooms A, B, C with
two beds each (`F506-A-1`, `F506-A-2`, …). Seeded automatically at
server boot (250 rooms, 1,500 beds).

---

## Complaint retention

Complaints never pile up in the management queue forever. A scheduled job
(`server/src/services/retention.js`) runs on server boot and every 24h:

1. **Archive after 14 days** — `Completed`/`Cancelled` complaints whose
   `updated_at` is older than `ARCHIVE_AFTER_DAYS` (default 14) get
   `archived = TRUE`. They leave the default **Open** queue (management UI
   defaults to Open + paginates 25 rows/page) but stay in the database and
   remain reachable via the **Archived** chip (`?includeArchived=true`).
2. **Hard-delete after 6 months** — archived (or still-unarchived
   `Completed`/`Cancelled`) rows older than `DELETE_AFTER_DAYS`
   (default 180) are deleted. Notes, timeline events and photo bytes go
   with them via `ON DELETE CASCADE`.
3. Complaints with a pending reopen request (`reopen_requested = TRUE`)
   are never archived or deleted.

Both knobs live in `server/.env` (see `.env.example`) and `render.yaml`.
Management can inspect or trigger the job manually:

```
GET  /api/admin/retention                 # policy + due counts
POST /api/admin/retention/run?dryRun=true  # preview, no changes
POST /api/admin/retention/run              # run now
```

---

## User roles

| Role | Capabilities |
|------|--------------|
| **resident** | Register, login, claim a bed, submit/edit/cancel/track complaints, read unit mates' reports, request reopen |
| **management** | All resident data, status/priority/dates workflow, notes, announcements, unit/occupancy management |

Complaint workflow: `Submitted → Received → Assigned → In Progress →
(Waiting for Parts) → Completed`, plus `Cancelled` (resident, from
Submitted/Received only) and reopen requests on Completed complaints.

---

## Mobile migration (in progress)

The mobile app's authentication already runs on the Express API.
Still to migrate from Firebase to REST (endpoints all exist):
`roomService`, `complaintService`, `managementService`, `noteService`,
`timelineService`, `storageService`, `announcementService`. Once done,
remove the `firebase` dependency and `mobile/src/config/firebase.js`,
then the Firebase project can be disabled. Legacy Firebase files are
preserved under `archive/firebase-legacy/` until then.

