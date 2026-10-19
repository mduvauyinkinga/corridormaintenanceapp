/**
 * test/management-guard.mjs
 * ------------------------------------------------------------------
 * Proves what actually happens when someone opens management.html
 * WITHOUT signing in (route guard: js/management.js -> requireRole).
 *
 * Run:  node test/management-guard.mjs        (scenario A: no token)
 *       node test/management-guard.mjs B      (scenario B: stale token, API down)
 */

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HTML = readFileSync(join(ROOT, "management.html"), "utf8");

/** Which scenario to run: A (no token) | B (stale token, API down) | C (valid session). */
const scenario = (process.argv[2] || "A").toUpperCase();

/* ------------------------------ DOM shim ------------------------------ */

class FakeEl {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.dataset = {};
    this.classList = {
      _set: new Set(),
      add: (...c) => c.forEach((x) => this.classList._set.add(x)),
      remove: (...c) => c.forEach((x) => this.classList._set.delete(x)),
      toggle: (c, f) => (f ? this.classList._set.add(c) : this.classList._set.delete(c)),
      contains: (c) => this.classList._set.has(c),
    };
    this.textContent = "";
    this._innerHTML = "";
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this.id = "";
    this.name = "";
    this.type = "";
    this.isConnected = true;
    this.parent = null;
    this.parentNode = null;
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(v) { this._innerHTML = v; this.children = []; }
  get options() { return this.children.filter((c) => c.tagName === "OPTION"); }
  get className() { return [...this.classList._set].join(" "); }
  set className(v) { this.classList._set = new Set(String(v).split(/\s+/).filter(Boolean)); }
  appendChild(c) { this.children.push(c); c.parent = this; c.parentNode = this; return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
  }
  dispatchEvent(ev) {
    ev.target = this;
    (this.listeners[ev.type] || []).forEach((fn) => fn(ev));
    return true;
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
  removeAttribute(k) { delete this.attributes[k]; }
  focus() { globalThis.document.activeElement = this; }
  blur() {}
  remove() {
    const p = this.parent;
    if (p && p.children) p.children = p.children.filter((x) => x !== this);
  }
  closest() { return null; }
  matches() { return false; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

function collectAttrs(el, attrText) {
  for (const a of attrText.matchAll(/([a-z-]+)(?:="([^"]*)")?/gi)) {
    const name = a[1].toLowerCase();
    if (!name) continue;
    const value = a[2] === undefined ? "" : a[2];
    el.attributes[name] = value;
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      el.dataset[key] = value;
    }
  }
}

/** Build an element registry straight from the real management.html. */
function buildFromHTML() {
  const byId = new Map();
  const seen = new Set();
  for (const m of HTML.matchAll(/<([a-z0-9]+)([^>]*)>/gi)) {
    const attrs = m[2] || "";
    const idMatch = attrs.match(/\sid="([^"]+)"/i);
    const hasData = /\sdata-[a-z-]+/i.test(attrs);
    if (!idMatch && !hasData) continue;
    const el = new FakeEl(m[1]);
    collectAttrs(el, attrs);
    if (idMatch) { el.id = idMatch[1]; byId.set(el.id, el); }
    seen.add(el);
  }
  return { byId, attrEls: [...seen] };
}

const { byId, attrEls } = buildFromHTML();

function matchesSelector(el, sel) {
  const s = String(sel).trim();
  const attr = s.match(/^\[([a-z-]+)(?:="([^"]*)")?\]$/i);
  if (attr) {
    const name = attr[1].toLowerCase();
    if (!(name in el.attributes)) return false;
    return attr[2] === undefined || el.attributes[name] === attr[2];
  }
  if (s.startsWith("#")) return el.id === s.slice(1);
  if (s.startsWith(".")) return el.classList.contains(s.slice(1));
  return el.tagName.toLowerCase() === s.toLowerCase();
}

const docListeners = {};
const body = new FakeEl("body");
// Mirror the real <body class="..."> so the auth gate state is observable.
const bodyTag = HTML.match(/<body[^>]*\sclass="([^"]*)"/i);
if (bodyTag) {
  bodyTag[1].split(/\s+/).filter(Boolean).forEach((c) => body.classList.add(c));
}
const registry = [...attrEls, ...byId.values()];
globalThis.document = {
  activeElement: body,
  body,
  documentElement: new FakeEl("html"),
  createElement: (t) => new FakeEl(t),
  createTextNode: (t) => ({ textContent: t }),
  getElementById: (id) => byId.get(id) || null,
  querySelector: (sel) => registry.find((el) => matchesSelector(el, sel)) || null,
  querySelectorAll: (sel) => registry.filter((el) => matchesSelector(el, sel)),
  addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn); },
  removeEventListener(type, fn) {
    docListeners[type] = (docListeners[type] || []).filter((f) => f !== fn);
  },
};

/* --------------------------- window / storage --------------------------- */

const redirects = [];
globalThis.window = {
  __CORRIDOR_API_BASE__: "http://localhost:4000",
  location: {
    pathname: "/management.html",
    search: "",
    hostname: "localhost",
    _href: "http://localhost/management.html",
    get href() { return this._href; },
    set href(v) { this._href = v; redirects.push(v); },
  },
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  addEventListener() {},
  removeEventListener() {},
  scrollTo() {},
};

const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

globalThis.CustomEvent = class {
  constructor(type, opts = {}) { this.type = type; Object.assign(this, opts); }
};
globalThis.Event = globalThis.CustomEvent;
globalThis.HTMLElement = FakeEl;

// Scenario C stands in for a working backend; A and B have it unreachable.
const SESSION = { id: "u1", name: "M", role: "management" };
globalThis.fetch = async (url) => {
  if (scenario !== "C") throw new TypeError("Failed to fetch");
  const u = String(url);
  const ok = (payload) => ({ ok: true, status: 200, json: async () => payload });
  if (u.includes("/auth/me")) return ok({ user: SESSION });
  if (u.includes("/admin/users")) return ok({ users: [] });
  if (u.includes("/admin/overview")) return ok({ rooms: [], units: [], complaints: [] });
  if (u.includes("/admin/release-orphans")) return ok({ released: 0 });
  return ok({});
};

const rejections = [];
process.on("unhandledRejection", (err) => rejections.push(err));
const warnings = [];
const errors = [];
const origWarn = console.warn;
const origError = console.error;
console.warn = (...a) => { warnings.push(a.join(" ")); };
console.error = (...a) => { errors.push(a.map((x) => (x instanceof Error ? x.stack : String(x))).join(" ")); };

/* ------------------------------ scenarios ------------------------------ */

if (scenario === "B" || scenario === "C") {
  // A token exists but is not necessarily accepted.
  store.corridor_token = "eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjk5OTk5OTk5OTl9.sig";
  store.corridor_user = JSON.stringify(SESSION);
}

const t0 = Date.now();
try {
  await import(pathToFileURL(join(ROOT, "js", "management.js")).href);
} catch (e) {
  errors.push("module load failed: " + (e && e.stack ? e.stack : e));
}
await new Promise((r) => setTimeout(r, 500));

console.warn = origWarn;
console.error = origError;

const LABELS = {
  A: "NO token",
  B: "stale token, API unreachable",
  C: "valid management session",
};
const gateClosed = body.classList.contains("auth-guarding");

console.log(`\n=== Scenario ${scenario} (${LABELS[scenario] || scenario}) ===`);
console.log(`redirects: ${redirects.length ? JSON.stringify(redirects) : "NONE"}`);
console.log(`auth gate (body.auth-guarding) still closed: ${gateClosed}`);
console.log(`unhandled rejections: ${rejections.length}`);
rejections.forEach((e) => console.log(`  - ${e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e}`));
console.log(`console.error: ${errors.length}`);
errors.slice(0, 5).forEach((e) => console.log(`  - ${e.slice(0, 400)}`));
console.log(`console.warn: ${warnings.length}`);
warnings.slice(0, 8).forEach((w) => console.log(`  - ${w}`));
console.log(`elapsed: ${Date.now() - t0}ms`);

// ---- expectations ----
const failures = [];
if (scenario === "A" && !redirects.some((r) => r.startsWith("login.html"))) {
  failures.push("expected a redirect to login.html");
}
if (scenario === "A" && !gateClosed) {
  failures.push("expected the auth gate to stay closed while leaving the page");
}
if (scenario === "B" && !redirects.some((r) => r.startsWith("login.html"))) {
  failures.push("expected a redirect to login.html when the session cannot be verified");
}
if (scenario === "B" && !gateClosed) {
  failures.push("expected the auth gate to stay closed while leaving the page");
}
if (scenario === "B" && rejections.length) {
  failures.push("expected no unhandled rejection from the guard");
}
if (scenario === "C" && redirects.length) {
  failures.push("expected no redirect for a valid session, got " + redirects.join());
}
if (scenario === "C" && gateClosed) {
  failures.push("expected the auth gate to open for a valid session");
}

if (failures.length) {
  console.log("\nFAILED:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
console.log("\nOK — expectations met.");
