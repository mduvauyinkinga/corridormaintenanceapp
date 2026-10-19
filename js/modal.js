/**
 * modal.js
 * ------------------------------------------------------------------
 * Shared accessibility behaviour for every dialog on the site.
 *
 * The photo lightbox (js/lightbox.js) already trapped focus, restored
 * it on close and handled Escape. The complaint, edit and unit modals
 * did NOT: they set aria-modal="true" but left Tab free to walk into the
 * page behind the overlay, and dropped focus entirely on close. For a
 * keyboard or screen-reader user that means tabbing through invisible
 * content and losing their place.
 *
 * This module lifts that behaviour out of the lightbox so every modal
 * gets it. It is deliberately dependency-free and never fights the
 * caller: the caller still owns showing/hiding the element.
 */

/** Elements that can receive focus inside a dialog. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** What had focus before each open modal, keyed by element. */
const restoreTargets = new WeakMap();

/** Modals currently open, so Escape only affects the topmost one. */
const openStack = [];

/**
 * The focusable descendants of a dialog, in DOM order.
 * @param {HTMLElement} root
 * @returns {HTMLElement[]}
 */
function focusablesIn(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

/**
 * The best element to focus when a dialog opens: the first field with a
 * label (so a screen reader announces the dialog's purpose), else the
 * first control, else the panel itself.
 * @param {HTMLElement} panel
 * @returns {HTMLElement|null}
 */
function initialFocusTarget(panel) {
  const focusables = focusablesIn(panel);
  if (focusables.length === 0) return null;

  // Prefer a real form field over a close button — it saves a keystroke
  // and makes the dialog announce what it is for.
  const field = focusables.find(
    (el) => el.matches("input, select, textarea") && !el.matches('[type="hidden"]')
  );
  if (field) return field;

  const closeBtn = panel.querySelector("[data-close-modal], .modal__close");
  return closeBtn || focusables[0];
}

/** Keep Tab cycling inside the topmost open dialog. */
function trapTab(event) {
  const top = openStack[openStack.length - 1];
  if (!top) return;

  const focusables = focusablesIn(top);
  if (focusables.length === 0) {
    // Nothing focusable inside: never let focus escape to the page.
    event.preventDefault();
    return;
  }

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;

  if (event.shiftKey) {
    // Shift+Tab on the first element wraps to the last.
    if (active === first || !top.contains(active)) {
      event.preventDefault();
      last.focus();
    }
  } else if (active === last || !top.contains(active)) {
    // Tab on the last element wraps to the first.
    event.preventDefault();
    first.focus();
  }
}

/** Close the topmost dialog when Escape is pressed. */
function onKeydown(event) {
  if (openStack.length === 0) return;
  if (event.key === "Escape") {
    event.preventDefault();
    const top = openStack[openStack.length - 1];
    // Let the page decide how to close (it may need to reset state).
    top.dispatchEvent(new CustomEvent("modal:escape", { bubbles: true }));
    return;
  }
  if (event.key === "Tab") trapTab(event);
}

let listening = false;

function startListening() {
  if (listening) return;
  document.addEventListener("keydown", onKeydown, true);
  listening = true;
}

function stopListening() {
  if (!listening) return;
  document.removeEventListener("keydown", onKeydown, true);
  listening = false;
}

/**
 * Register a dialog as open: remember what had focus, move focus into
 * the dialog, and start trapping Tab/Escape.
 *
 * @param {HTMLElement} panel - the dialog element (must already be visible).
 * @returns {boolean} true when the dialog was opened.
 */
export function openModal(panel) {
  if (!panel) return false;
  if (openStack.includes(panel)) return false;

  startListening();
  // Only remember the first opener, so nested dialogs unwind correctly.
  if (!restoreTargets.has(panel)) {
    restoreTargets.set(panel, document.activeElement);
  }
  openStack.push(panel);

  const target = initialFocusTarget(panel);
  if (target) {
    target.focus({ preventScroll: true });
  } else {
    // Make an otherwise unfocusable dialog reachable so focus is never
    // left behind on the page underneath.
    panel.setAttribute("tabindex", "-1");
    panel.focus({ preventScroll: true });
  }
  return true;
}

/**
 * Register a dialog as closed and return focus to whatever opened it.
 * Does NOT hide the element — the caller keeps that responsibility so
 * it can also reset its own state.
 *
 * @param {HTMLElement} panel
 * @returns {boolean} true when the dialog was closed.
 */
export function closeModal(panel) {
  if (!panel) return false;
  const index = openStack.indexOf(panel);
  if (index === -1) return false;

  openStack.splice(index, 1);
  if (openStack.length === 0) stopListening();

  const previous = restoreTargets.get(panel);
  restoreTargets.delete(panel);
  if (previous && typeof previous.focus === "function" && previous.isConnected) {
    previous.focus({ preventScroll: true });
  }
  return true;
}

/**
 * Close every open dialog, newest first. Used on sign-out so focus is
 * never left stranded on a page the user is navigating away from.
 */
export function closeAllModals() {
  [...openStack].reverse().forEach((panel) => closeModal(panel));
}

/** True when at least one dialog is currently open. */
export function isModalOpen() {
  return openStack.length > 0;
}
