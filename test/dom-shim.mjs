/**
 * test/dom-shim.mjs
 * ------------------------------------------------------------------
 * Minimal DOM shim so the pure filter utility (js/tracking.js) can be
 * imported in Node without a real browser. tracking.js imports
 * js/api.js (which references `window` at module scope) and js/modal.js
 * and js/nav.js and js/timeline.js (all of which read `document`).
 * This shim replaces those globals before the import happens.
 */

class FakeEl {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.listeners = {};
    this.classList = {
      _set: new Set(),
      add: (c) => this.classList._set.add(c),
      remove: (c) => this.classList._set.delete(c),
      toggle: (c, f) => (f ? this.classList._set.add(c) : this.classList._set.delete(c)),
      contains: (c) => this.classList._set.has(c),
    };
    this.attributes = {};
    this.dataset = {};
    this.textContent = "";
    this.innerHTML = "";
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this.id = "";
    this.isConnected = true;
    this.parent = null;
    this.appended = [];
  }
  appendChild(c) {
    this.children.push(c);
    this.appended.push(c);
    c.parent = this;
    c.id = c.id || "auto-" + this.appended.length;
    return c;
  }
  addEventListener(type, fn) {
    (this.listeners[type] = this.listeners[type] || []).push(fn);
  }
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
  matches(selector) {
    const tag = this.tagName.toLowerCase();
    const parts = String(selector).split(",").map((s) => s.trim());
    return parts.some((p) => {
      if (p === tag) return true;
      const m = p.match(/^([a-z]+)(\[([a-z-]+)=\"([^\"]*)\"\])$/i);
      if (!m) return false;
      if (m[1].toLowerCase() !== tag) return false;
      if (!m[3]) return true;
      return m[3] === "type" ? this.attributes.type === m[4] : this.getAttribute(m[3]) === m[4];
    });
  }
  querySelector(selector) {
    const results = this.querySelectorAll(selector);
    return results.length ? results[0] : null;
  }
  querySelectorAll(selector) {
    const raw = String(selector).split(",").map((s) => s.trim()).filter(Boolean);
    const wanted = new Set(raw.map((s) => s.split(":")[0].replace(/[\\[\]]/g, "")));
    const classes = raw.filter((s) => s.startsWith(".")).map((s) => s.slice(1));
    const out = [];
    const walk = (node) => {
      node.children.forEach((c) => {
        const tag = c.tagName.toLowerCase();
        const byClass = classes.length > 0 && classes.some((cl) => c.classList.contains(cl));
        const byTag = wanted.has(tag) || wanted.has("[tabindex]") || (wanted.has("a[href]") && tag === "a");
        if ((byClass || byTag) && !c.disabled) out.push(c);
        walk(c);
      });
    };
    walk(this);
    return out;
  }
  contains(el) { return this === el; }
}

const docListeners = {};

globalThis.document = {
  activeElement: null,
  createElement: (t) => new FakeEl(t),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn); },
  removeEventListener(type, fn) { docListeners[type] = (docListeners[type] || []).filter((f) => f !== fn); },
  body: new FakeEl("body"),
};

// Pre-register all DOM elements tracking.js reads at module scope (filter
// controls, modal shells, and edit-modal controls) so its top-level
// wiring code (addEventListener on those elements) succeeds.
const els = {};
[
  "tracking-body", "tracking-loading", "tracking-empty",
  "search-input", "filter-status", "filter-category", "sort-by", "tracking-count",
  "complaint-modal", "modal-details", "modal-photos", "modal-timeline",
  "modal-notes", "reopen-btn", "reopen-msg",
  "edit-modal", "edit-form", "edit-category", "edit-issues-list",
  "edit-notes", "edit-save-btn", "edit-alert",
].forEach((id) => {
  const e = new FakeEl("div");
  e.id = id;
  els[id] = e;
});

globalThis.window = {
  location: { pathname: "/tracking.html", search: "", hostname: "h", href: "" },
};

// Resolve #id queries against the pre-registered element registry.
globalThis.document.querySelector = (sel) => {
  if (sel.startsWith("#")) return els[sel.slice(1)] || null;
  return null;
};

globalThis.document.querySelectorAll = (sel) => {
  if (sel.startsWith("#")) return [els[sel.slice(1)] || null].filter(Boolean);
  return [];
};

globalThis.CustomEvent = class { constructor(type, opts = {}) { this.type = type; Object.assign(this, opts); } };

globalThis.localStorage = {
  store: {},
  getItem(k) { return k in this.store ? this.store[k] : null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
};

export function fireDocKey(key, opts = {}) {
  const ev = { type: "keydown", key, prevented: false, preventDefault() { this.prevented = true; }, ...opts };
  (docListeners.keydown || []).forEach((fn) => fn(ev));
  return ev;
}
