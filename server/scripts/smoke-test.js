// scripts/smoke-test.js
// Self-contained end-to-end test of the auth + complaints API. Uses an
// ISOLATED in-memory PGlite (PGLITE_DATA_DIR=":memory:"), so it never
// touches your persistent dev database in server/.pglite-data/.
// Runs migrations, starts the app, then exercises register -> login ->
// me -> complaints lifecycle plus the main error cases.
// Exits 0 when every check passes, 1 otherwise.

process.env.PGLITE_DATA_DIR = ":memory:";
process.env.DATABASE_DRIVER = "pglite";
process.env.NODE_ENV = "test"; // disables rate-limit middleware in app.js
process.env.JWT_SECRET = process.env.JWT_SECRET || "smoke-test-secret";

const { runMigrations } = await import("../src/migrate.js");
const { createApp } = await import("../src/app.js");

await runMigrations();
const app = createApp();
const server = app.listen(0);
const port = server.address().port;
const base = "http://127.0.0.1:" + port + "/api";

let failures = 0;
function check(name, cond, extra) {
  if (cond) {
    console.log("  PASS  " + name);
  } else {
    failures += 1;
    console.log("  FAIL  " + name + (extra !== undefined ? "  (got " + extra + ")" : ""));
  }
}
async function call(path, opts) {
  const res = await fetch(base + path, opts);
  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    /* ignore */
  }
  return { status: res.status, body };
}
function json(method, payload, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  return { method, headers, body: JSON.stringify(payload) };
}

const email = "test" + Date.now() + "@tut4life.ac.za";

try {
  let r = await call("/auth/register", json("POST", { fullName: "Test Resident", studentNumber: "2100000", email, password: "secret123" }));
  check("register -> 201", r.status === 201, r.status);
  check("register returns token", Boolean(r.body && r.body.token));
  check("register role = resident", r.body && r.body.user && r.body.user.role === "resident");
  check("register returns uid", Boolean(r.body && r.body.user && r.body.user.uid));

  r = await call("/auth/register", json("POST", { fullName: "Dup", studentNumber: "1", email, password: "secret123" }));
  check("duplicate email -> 409", r.status === 409, r.status);

  r = await call("/auth/register", json("POST", { fullName: "X", studentNumber: "1", email: "someone@gmail.com", password: "secret123" }));
  check("wrong domain -> 400", r.status === 400, r.status);

  r = await call("/auth/register", json("POST", { fullName: "Y", studentNumber: "1", email: "short@tut4life.ac.za", password: "abc" }));
  check("short password -> 400", r.status === 400, r.status);

  r = await call("/auth/login", json("POST", { email, password: "secret123" }));
  check("login -> 200", r.status === 200, r.status);
  const token = r.body && r.body.token;

  r = await call("/auth/login", json("POST", { email, password: "wrongpass" }));
  check("wrong password -> 401", r.status === 401, r.status);

  r = await call("/auth/login", json("POST", { email: "nobody@tut4life.ac.za", password: "x" }));
  check("unknown email -> 401", r.status === 401, r.status);

  // Anti-enumeration: both failures must return the SAME generic message.
  r = await call("/auth/login", json("POST", { email, password: "wrongpass" }));
  const msgWrongPass = r.body && r.body.error;
  r = await call("/auth/login", json("POST", { email: "nobody-xyz@tut4life.ac.za", password: "whatever" }));
  const msgUnknown = r.body && r.body.error;
  check("login failures share one generic message", Boolean(msgWrongPass) && msgWrongPass === msgUnknown, msgWrongPass + " vs " + msgUnknown);
  check("generic message does not reveal existence", !/no account|not found/i.test(msgUnknown || ""), msgUnknown);

  // ---- Security regression checks (Phase 1 hardening) ----
  // Security headers from helmet.
  {
    const res = await fetch(base + "/health");
    check("helmet sets X-Content-Type-Options", res.headers.get("x-content-type-options") === "nosniff", res.headers.get("x-content-type-options"));
    check("helmet sets X-Frame-Options", Boolean(res.headers.get("x-frame-options")), res.headers.get("x-frame-options"));
  }

  // Room/unit occupancy data must require a token.
  r = await call("/rooms?block=A");
  check("rooms without token -> 401", r.status === 401, r.status);
  r = await call("/units?roomId=A101");
  check("units without token -> 401", r.status === 401, r.status);
  r = await call("/units/some-unit");
  check("unit by id without token -> 401", r.status === 401, r.status);

  // Claim must require a token AND ignore any uid in the body (the uid
  // comes from the JWT only — nobody can claim beds for other users).
  r = await call("/units/claim", json("POST", { uid: "victim-uid", unitId: "X", roomId: "Y" }));
  check("claim without token -> 401", r.status === 401, r.status);

  // Registration field limits.
  r = await call("/auth/register", json("POST", {
    fullName: "N".repeat(200), studentNumber: "2100000",
    email: "longname" + Date.now() + "@tut4life.ac.za", password: "secret123",
  }));
  check("over-long name -> 400", r.status === 400, r.status);

  r = await call("/auth/me", { headers: { Authorization: "Bearer " + token } });
  check("me -> 200", r.status === 200, r.status);
  check("me returns correct email", r.body && r.body.user && r.body.user.email === email, r.body && r.body.user && r.body.user.email);

  r = await call("/auth/me", {});
  check("me without token -> 401", r.status === 401, r.status);

  // ---- Complaints lifecycle ----
  // Give the smoke user a room first (mirrors choose-room claim; the
  // frontend redirects roomless residents, the API enforces it too).
  const { query: smokeQuery } = await import("../src/db.js");
  await smokeQuery(
    "UPDATE users SET room_id = 'A101', unit_id = 'A101-A-1', room_letter = 'A' WHERE email = $1",
    [email]
  );

  r = await call("/complaints", json("POST", { category: "Plumbing", issues: ["Leak"], notes: "Tap leaks" }, token));
  check("complaint create -> 201", r.status === 201, r.status);
  const complaintId = r.body && r.body.complaint && r.body.complaint.id;
  check("complaint has id", Boolean(complaintId));
  check("complaint status Submitted", r.body.complaint && r.body.complaint.status === "Submitted");

  r = await call("/complaints?residentId=" + (r.body.complaint.residentId || ""), { headers: { Authorization: "Bearer " + token } });
  check("complaint list -> 200", r.status === 200, r.status);
  check("complaint list contains new", Array.isArray(r.body.complaints) && r.body.complaints.some((c) => c.id === complaintId));

  r = await call("/complaints/" + complaintId, json("PATCH", { notes: "Updated notes" }, token));
  check("complaint edit -> 200", r.status === 200, r.status);

  r = await call("/complaints/" + complaintId + "/timeline", { headers: { Authorization: "Bearer " + token } });
  check("timeline has submitted event", r.status === 200 && Array.isArray(r.body.events) && r.body.events.length >= 2, r.status);

  r = await call("/complaints/" + complaintId + "/cancel", json("POST", {}, token));
  check("complaint cancel -> 200", r.status === 200, r.status);
  check("cancelled status", r.body.complaint && r.body.complaint.status === "Cancelled");

  r = await call("/complaints/" + complaintId, json("PATCH", { notes: "Too late" }, token));
  check("edit after cancel -> 400", r.status === 400, r.status);

  // ---- Complaint photos (regression: <img> cannot send a token) ----
  // A 1x1 transparent PNG, small enough to pass the 1.5MB decoded cap.
  const TINY_PNG =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
  r = await call(
    "/complaints",
    json("POST", { category: "Electrical", issues: ["Socket"], photos: [TINY_PNG] }, token)
  );
  check("complaint with photo -> 201", r.status === 201, r.status);
  const photoURLs = (r.body && r.body.complaint && r.body.complaint.photoURLs) || [];

  check("create returns one photo URL", photoURLs.length === 1, photoURLs.length);
  check(
    "photo URL is signed with exp+sig",
    typeof photoURLs[0] === "string" && /[?&]exp=\d+/.test(photoURLs[0]) && /[?&]sig=[0-9a-f]+/.test(photoURLs[0]),
    photoURLs[0]
  );
  check(
    "photo URL has no token in it",
    typeof photoURLs[0] === "string" && !photoURLs[0].includes("token"),
    photoURLs[0]
  );

  // THE regression: a bare <img src> request with NO Authorization header
  // must serve image bytes. This is what broke before the signed URLs.
  // NB: photoURLs are server-absolute ("/api/..."), so use the ORIGIN —
  // `base` already ends in /api and would produce /api/api/...
  const origin = base.slice(0, -"/api".length);
  const rawPhoto = await fetch(origin + photoURLs[0]);
  const photoBytes = Buffer.from(await rawPhoto.arrayBuffer());
  check(
    "photo fetch without token -> 200 (the <img> case)",
    rawPhoto.status === 200,
    rawPhoto.status
  );
  check(
    "photo fetch returns an image content-type",
    (rawPhoto.headers.get("content-type") || "").startsWith("image/"),
    rawPhoto.headers.get("content-type")
  );
  check("photo bytes round-trip", photoBytes.length > 0 && photoBytes[0] === 0x89, photoBytes.length);
  check(
    "photo response is private + cacheable",
    (rawPhoto.headers.get("cache-control") || "").includes("private"),
    rawPhoto.headers.get("cache-control")
  );

  // A tampered signature must NOT be honoured.
  const tampered = photoURLs[0].replace(/sig=[0-9a-f]+/, "sig=" + "0".repeat(64));
  const tamperedRes = await fetch(origin + tampered);
  check("photo with forged signature -> 401/403", tamperedRes.status === 401 || tamperedRes.status === 403, tamperedRes.status);

  // A missing signature must NOT be honoured either.
  const unsigned = photoURLs[0].replace(/[?&]exp=\d+&sig=[0-9a-f]+/, "");
  const unsignedRes = await fetch(origin + unsigned);
  check("photo without signature -> 401/403", unsignedRes.status === 401 || unsignedRes.status === 403, unsignedRes.status);

  // The owner can still fetch with a Bearer token.
  const bearerPhoto = await fetch(origin + unsigned, {
    headers: { Authorization: "Bearer " + token },
  });
  check("photo fetch with owner token -> 200", bearerPhoto.status === 200, bearerPhoto.status);

  // A different resident must NOT be able to read it, even with a token.
  const otherEmail = "other" + Date.now() + "@tut4life.ac.za";
  const other = await call(
    "/auth/register",
    json("POST", { fullName: "Other Resident", studentNumber: "2299999", email: otherEmail, password: "secret123" })
  );
  const otherToken = other.body && other.body.token;
  const forbidden = await fetch(origin + unsigned, {
    headers: { Authorization: "Bearer " + otherToken },
  });
  check("photo fetch by a different resident -> 403", forbidden.status === 403, forbidden.status);

  // ---- Unit-mate sharing ----
  // A second resident in the SAME unit (the other bed) must see the first
  // resident's reports — but only ever as a read-only viewer.
  const mateEmail = "mate" + Date.now() + "@tut4life.ac.za";
  const mate = await call(
    "/auth/register",
    json("POST", { fullName: "Unit Mate", studentNumber: "2300001", email: mateEmail, password: "secret123" })
  );
  const mateToken = mate.body && mate.body.token;
  const mateUid = mate.body && mate.body.user && mate.body.user.uid;
  check("unit mate register -> 201", mate.status === 201, mate.status);
  await smokeQuery(
    "UPDATE users SET room_id = 'A101', unit_id = 'A101-A-2', room_letter = 'A' WHERE id = $1",
    [mateUid]
  );

  r = await call("/complaints", json("POST", { category: "Appliances", issues: ["Stove"] }, mateToken));
  check("unit mate complaint create -> 201", r.status === 201, r.status);
  const mateComplaintId = r.body && r.body.complaint && r.body.complaint.id;

  // The default list stays personal so dashboard stats stay own-only.
  r = await call("/complaints", { headers: { Authorization: "Bearer " + token } });
  check(
    "default complaint list stays own-only",
    Array.isArray(r.body.complaints) && !r.body.complaints.some((c) => c.id === mateComplaintId),
    r.body.complaints && r.body.complaints.length
  );

  // ?scope=unit adds the unit mate's report and the reporter's name.
  r = await call("/complaints?scope=unit", { headers: { Authorization: "Bearer " + token } });
  check("unit scope list -> 200", r.status === 200, r.status);
  check(
    "unit scope list contains own report",
    Array.isArray(r.body.complaints) && r.body.complaints.some((c) => c.id === complaintId)
  );
  const seenMateReport = Array.isArray(r.body.complaints)
    ? r.body.complaints.find((c) => c.id === mateComplaintId)
    : null;
  check("unit scope list contains unit mate's report", Boolean(seenMateReport), seenMateReport);
  check(
    "list row carries the reporter's name",
    Boolean(seenMateReport) && seenMateReport.residentName === "Unit Mate",
    seenMateReport && seenMateReport.residentName
  );

  // The unit mate can READ the other report: details, timeline, notes.
  r = await call("/complaints/" + complaintId, { headers: { Authorization: "Bearer " + mateToken } });
  check("unit mate can read the report -> 200", r.status === 200, r.status);
  r = await call("/complaints/" + complaintId + "/timeline", { headers: { Authorization: "Bearer " + mateToken } });
  check("unit mate can read the timeline -> 200", r.status === 200, r.status);
  r = await call("/complaints/" + complaintId + "/notes", { headers: { Authorization: "Bearer " + mateToken } });
  check("unit mate can read the notes -> 200", r.status === 200, r.status);

  // ...but must NOT be able to change somebody else's report.
  r = await call("/complaints/" + complaintId, json("PATCH", { notes: "Not mine" }, mateToken));
  check("unit mate edit -> 403", r.status === 403, r.status);
  r = await call("/complaints/" + complaintId + "/cancel", json("POST", {}, mateToken));
  check("unit mate cancel -> 403", r.status === 403, r.status);
  r = await call("/complaints/" + complaintId + "/reopen", json("POST", {}, mateToken));
  check("unit mate reopen -> 403", r.status === 403, r.status);

  // A resident who has not claimed a bed has no unit, so nothing is shared.
  r = await call("/complaints?scope=unit", { headers: { Authorization: "Bearer " + otherToken } });
  check(
    "resident without a unit sees no unit reports",
    Array.isArray(r.body.complaints) && r.body.complaints.length === 0,
    r.body.complaints && r.body.complaints.length
  );

  // ---- Announcements ----
  r = await call("/announcements/latest?roomId=ROOM1", { headers: { Authorization: "Bearer " + token } });
  check("announcement latest -> 200 (null ok)", r.status === 200, r.status);

  r = await call("/auth/logout", json("POST", {}, token));
  check("logout -> 200", r.status === 200, r.status);
} finally {
  server.close();
}

if (failures === 0) {
  console.log("All smoke tests passed.");
  process.exit(0);
}
console.log(failures + " smoke test(s) failed.");
process.exit(1);