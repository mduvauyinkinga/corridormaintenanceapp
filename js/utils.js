/**
 * utils.js
 * ------------------------------------------------------------------
 * Reusable utility helpers: DOM queries, form validation, loading
 * states, error handling, date formatting, and toasts.
 *
 * Every page imports the helpers it needs to avoid duplicate code.
 */

/* ---------------------------------- DOM ---------------------------------- */

/** Query a single element by selector. Throws if not found. */
export function $(selector, root = document) {
  const el = root.querySelector(selector);
  if (!el) {
    console.warn(`[utils] Element not found: "${selector}"`);
  }
  return el;
}

/** Query multiple elements by selector and return an array. */
export function $$(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/* ------------------------------ Form helpers ------------------------------ */

/** Read all fields within a form into a plain object keyed by name. */
export function serializeForm(form) {
  const data = {};
  const formData = new FormData(form);
  formData.forEach((value, key) => {
    data[key] = value;
  });
  return data;
}

/**
 * Set/clear an inline error message on a field's error container.
 *
 * Also wires aria-invalid / aria-describedby so a screen reader announces
 * the error when focus lands on the field. Without these the message is
 * only visible, never spoken.
 *
 * @param {HTMLElement} input - the field the error belongs to.
 * @param {string} message - the error text, or "" to clear.
 */
export function setFieldError(input, message) {
  const key = input.dataset.errorKey || input.name;
  const errorEl = document.querySelector(`[data-error="${key}"]`);
  if (errorEl) {
    errorEl.textContent = message || "";
    errorEl.hidden = !message;
  }
  input.classList.toggle("is-invalid", Boolean(message));
  input.setAttribute("aria-invalid", message ? "true" : "false");
  if (message && errorEl) {
    // Point the field at its message so AT reads it on focus. An id is
    // generated when the markup has none.
    if (!errorEl.id) errorEl.id = `error-${key}`;
    input.setAttribute("aria-describedby", errorEl.id);
  } else {
    input.removeAttribute("aria-describedby");
  }
}

/**
 * Move focus to the first invalid field in a form and announce it.
 * Called after a failed submit so keyboard/AT users are taken straight
 * to the problem instead of hunting for the red text.
 *
 * @param {HTMLFormElement} form
 * @returns {boolean} true when a field was focused.
 */
export function focusFirstError(form) {
  if (!form) return false;
  const firstInvalid = form.querySelector(".is-invalid");
  if (!firstInvalid) return false;
  firstInvalid.focus();
  return true;
}

/**
 * Validate that a field is non-empty.
 * Returns true if valid, otherwise shows the field error.
 */
export function validateRequired(input, label) {
  if (!input.value.trim()) {
    setFieldError(input, `${label} is required.`);
    return false;
  }
  setFieldError(input, "");
  return true;
}

/**
 * Validate an email domain against an allowed domain.
 * Supported when the domain string includes a leading "@".
 */
export function validateEmailDomain(email, allowedDomain) {
  const atIndex = email.indexOf("@");
  if (atIndex === -1) return false;
  const domain = email.slice(atIndex);
  return domain.toLowerCase() === allowedDomain.toLowerCase();
}

/* ------------------------------ Loading state ----------------------------- */

/**
 * Show a loading state on a button and disable it.
 * Returns a function to restore the button's original label/state.
 */
export function setButtonLoading(button, loadingText = "Please wait...") {
  const original = button.textContent;
  button.dataset.originalText = original;
  button.disabled = true;
  button.textContent = loadingText;
  button.classList.add("is-loading");
  return () => {
    button.disabled = false;
    button.textContent = button.dataset.originalText || original;
    button.classList.remove("is-loading");
  };
}

/* ------------------------------- Toasts ----------------------------------- */

/** Show a small toast notification at the bottom of the screen. */
export function toast(message, type = "info", duration = 3500) {
  // Direct query: the container is created on first use, so a missing
  // element here is expected and shouldn't emit a "$ not found" warning.
  let container = document.querySelector("#toast-container");
  if (!container) {
    // Create a container on the fly if missing.
    const div = document.createElement("div");
    div.id = "toast-container";
    div.className = "toast-container";
    div.setAttribute("aria-live", "polite");
    document.body.appendChild(div);
    container = div;
  }

  const toastEl = document.createElement("div");
  toastEl.className = `toast toast--${type}`;
  toastEl.setAttribute("role", "status");
  toastEl.textContent = message;
  container.appendChild(toastEl);

  // Auto-dismiss.
  setTimeout(() => {
    toastEl.classList.add("toast--hide");
    setTimeout(() => toastEl.remove(), 300);
  }, duration);
}

/* ----------------------------- Date formatting ---------------------------- */

/** Format a Firestore timestamp / Date into a readable local string. */
export function formatDate(dateLike) {
  if (!dateLike) return "—";
  let date;
  if (dateLike instanceof Date) {
    date = dateLike;
  } else if (typeof dateLike.toDate === "function") {
    date = dateLike.toDate(); // Firestore Timestamp
  } else if (dateLike.seconds) {
    date = new Date(dateLike.seconds * 1000);
  } else {
    date = new Date(dateLike);
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Format a Firestore timestamp / Date into a readable local date + time. */
export function formatDateTime(dateLike) {
  if (!dateLike) return "—";
  let date;
  if (dateLike instanceof Date) {
    date = dateLike;
  } else if (typeof dateLike.toDate === "function") {
    date = dateLike.toDate();
  } else if (dateLike.seconds) {
    date = new Date(dateLike.seconds * 1000);
  } else {
    date = new Date(dateLike);
  }
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Compare a complaint's estimated completion value against "now".
 * Returns true when the complaint is not Completed and its estimated
 * completion date (or timestamp) is in the past.
 */
export function isOverdue(complaint) {
  if (!complaint) return false;
  if (normalizeStatus(complaint.status) === "Completed") return false;
  const est = complaint.estimatedCompletion;
  if (!est) return false;
  let date;
  if (typeof est.toDate === "function") {
    date = est.toDate();
  } else if (est.seconds) {
    date = new Date(est.seconds * 1000);
  } else if (est instanceof Date) {
    date = est;
  } else if (typeof est === "string") {
    date = new Date(est);
  } else {
    return false;
  }
  return date.getTime() < Date.now();
}

/* --------------------------- Status / badges ------------------------------ */

/**
 * Valid complaint statuses, in workflow order.
 *
 * Backwards compatibility: legacy complaints stored with status "Pending"
 * are displayed as "Submitted" (see the normalizeStatus helper below).
 */
export const COMPLAINT_STATUSES = [
  "Submitted",
  "Received",
  "Assigned",
  "In Progress",
  "Waiting for Parts",
  "Completed",
  "Cancelled",
];

/**
 * Normalize a stored complaint status for display.
 * Legacy "Pending" maps to "Submitted" so the new workflow stays consistent.
 */
export function normalizeStatus(status) {
  if (status === "Pending") return "Submitted";
  return status && COMPLAINT_STATUSES.includes(status) ? status : "Submitted";
}

/**
 * Map a complaint status string to a CSS badge class.
 * Falls back to the "Submitted" badge for unknown statuses.
 */
export function statusBadge(status) {
  const s = normalizeStatus(status);
  const map = {
    Submitted: "badge badge--pending",
    Received: "badge badge--received",
    Assigned: "badge badge--assigned",
    "In Progress": "badge badge--in-progress",
    "Waiting for Parts": "badge badge--waiting",
    Completed: "badge badge--completed",
    Cancelled: "badge badge--cancelled",
  };
  return map[s] || "badge badge--pending";
}

/**
 * Linear workflow shown in the status stepper. "Waiting for Parts" is a
 * side-state (work paused), not a forward step — it renders as a paused
 * notice under a frozen stepper instead of breaking the line.
 * Cancelled is terminal and renders its own notice.
 */
export const WORKFLOW_STEPS = [
  "Submitted",
  "Received",
  "Assigned",
  "In Progress",
  "Completed",
];

/**
 * Describe where a complaint sits in the workflow for the stepper.
 * @returns {{ index: number, paused: boolean, terminal: string|null }}
 */
export function workflowPosition(status) {
  const s = normalizeStatus(status);
  if (s === "Cancelled") return { index: -1, paused: false, terminal: "Cancelled" };
  if (s === "Waiting for Parts") {
    // Paused between Assigned and In Progress — work acknowledged but blocked.
    return { index: 2, paused: true, terminal: null };
  }
  const index = WORKFLOW_STEPS.indexOf(s);
  return { index: index === -1 ? 0 : index, paused: false, terminal: null };
}

/**
 * Build a visual stepper (ol > li) for a complaint status.
 * Done steps get a check, the current step gets aria-current="step",
 * Waiting for Parts freezes at Assigned + a paused notice,
 * Cancelled renders a terminal notice instead of a stepper.
 */
export function renderStepper(status) {
  const { index, paused, terminal } = workflowPosition(status);
  const wrap = document.createElement("div");
  wrap.className = "stepper-wrap";

  if (terminal === "Cancelled") {
    const note = document.createElement("p");
    note.className = "stepper-note stepper-note--cancelled";
    note.textContent = "This complaint was cancelled.";
    wrap.appendChild(note);
    return wrap;
  }

  const ol = document.createElement("ol");
  ol.className = "stepper";
  ol.setAttribute("aria-label", `Progress: ${normalizeStatus(status)}`);

  WORKFLOW_STEPS.forEach((step, i) => {
    const li = document.createElement("li");
    let state = "todo";
    if (i < index) state = "done";
    else if (i === index) state = step === "Completed" && !paused ? "done" : "current";
    li.className = `stepper__step stepper__step--${state}${paused && i === index ? " stepper__step--paused" : ""}`;
    if (state === "current") li.setAttribute("aria-current", "step");

    const dot = document.createElement("span");
    dot.className = "stepper__dot";
    dot.setAttribute("aria-hidden", "true");
    dot.textContent = state === "done" ? "✓" : "";

    const label = document.createElement("span");
    label.className = "stepper__label";
    label.textContent = step;

    li.append(dot, label);
    ol.appendChild(li);
  });
  wrap.appendChild(ol);

  if (paused) {
    const note = document.createElement("p");
    note.className = "stepper-note stepper-note--paused";
    note.textContent = "Paused — waiting for parts. Work resumes as soon as parts arrive.";
    wrap.appendChild(note);
  }
  return wrap;
}

/* --------------------------- Categories & priority ------------------------ */

/** Valid complaint categories. */
export const COMPLAINT_CATEGORIES = [
  "Electrical",
  "Plumbing",
  "Furniture",
  "Appliances",
  "Security",
  "Windows & Doors",
  "Cleaning",
  "Other",
];

/** Valid priority levels, in severity order. */
export const PRIORITIES = ["Low", "Medium", "High", "Emergency"];

/**
 * Issues shown per category on the complaint form. Keeps the checklist
 * relevant — e.g. Electrical no longer offers Fridge/Shower.
 * "Other" is always appended so nothing is ever unreportable.
 */
export const CATEGORY_ISSUES = {
  Electrical: ["Toilet light", "Plug socket", "Light switch", "DB board / tripping power", "Heater", "Electrical"],
  Plumbing: ["Shower", "Toilet", "Tap / basin", "Water leak", "Blocked drain", "Geyser / hot water"],
  Furniture: ["Bed", "Mattress", "Desk", "Chair", "Cupboard / wardrobe", "Shelf"],
  Appliances: ["Stove", "Fridge", "Microwave", "Kettle"],
  Security: ["Door lock", "Key / access card", "Window lock", "Intercom / gate"],
  "Windows & Doors": ["Door", "Door handle", "Window", "Window handle", "Broken glass"],
  Cleaning: ["Shared kitchen", "Bathroom", "Corridor / stairs", "Bins / waste", "Pests"],
  Other: ["Other"],
};

export const ALL_ISSUES_FALLBACK = [
  "Toilet light", "Stove", "Fridge", "Door", "Window",
  "Shower", "Water leak", "Electrical", "Other",
];

/** Issues for a category, with "Other" always last. Unknown -> fallback list. */
export function issuesForCategory(category) {
  const list = CATEGORY_ISSUES[category];
  if (Array.isArray(list) && list.length) return [...list];
  return [...ALL_ISSUES_FALLBACK];
}

/**
 * Normalize a stored priority for display.
 * Unknown / missing values fall back to "Low".
 */
export function normalizePriority(priority) {
  return priority && PRIORITIES.includes(priority) ? priority : "Low";
}

/** Map a priority level to a CSS badge class. */
export function priorityBadge(priority) {
  const p = normalizePriority(priority);
  const map = {
    Low: "badge badge--priority badge--priority-low",
    Medium: "badge badge--priority badge--priority-medium",
    High: "badge badge--priority badge--priority-high",
    Emergency: "badge badge--priority badge--priority-emergency",
  };
  return map[p] || map.Low;
}

/* --------------------------------- Errors --------------------------------- */

/** Extract a human-readable message from a Firebase error. */
export function getFirebaseErrorMessage(error) {
  const code = error?.code || "";
  const map = {
    "auth/email-already-in-use": "This email is already registered.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/weak-password": "Password must be at least 8 characters.",
    "auth/user-not-found": "No account found with this email.",
    "auth/wrong-password": "Incorrect password. Please try again.",
    "auth/too-many-requests":
      "Too many attempts. Please try again later.",
    "auth/network-request-failed":
      "Network error. Check your connection and try again.",
  };
  return map[code] || error?.message || "Something went wrong. Please try again.";
}

/** Show an error alert region if present, otherwise log to console. */
export function showError(message) {
  const alertEl = $("#form-alert");
  if (alertEl) {
    alertEl.textContent = message;
    alertEl.hidden = false;
  } else {
    console.error(message);
  }
}

/** Clear a form-level alert. */
export function clearError() {
  const alertEl = $("#form-alert");
  if (alertEl) {
    alertEl.textContent = "";
    alertEl.hidden = true;
    // Drop tone modifiers so the next message is not styled as the last
    // one (e.g. an info-toned "session expired" notice bleeding onto a
    // genuine validation error).
    alertEl.classList.remove("form__alert--info", "form__alert--success");
  }
}

/* ------------------------- Password UX helpers -------------------------- */

/**
 * Wire every [data-password-toggle] button on the page to show/hide its
 * target password field. Keeps label + aria-pressed in sync.
 */
export function initPasswordToggles(root = document) {
  root.querySelectorAll("[data-password-toggle]").forEach((btn) => {
    const input = document.getElementById(btn.dataset.passwordToggle);
    if (!input) return;
    btn.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "Hide" : "Show";
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
      btn.setAttribute("aria-pressed", String(show));
      input.focus();
    });
  });
}

/**
 * Score a password 0-4: length, mixed case, digit, symbol.
 */
export function scorePassword(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  return Math.min(4, score);
}

/**
 * Live password-strength meter. Pass the input + container
 * (#password-strength with .strength__fill + .strength__label).
 */
export function initPasswordStrength(input, container) {
  if (!input || !container) return;
  const label = container.querySelector(".strength__label");
  const update = () => {
    const pw = input.value || "";
    if (!pw) {
      container.className = "strength";
      if (label) label.textContent = "Enter password";
      return;
    }
    const score = scorePassword(pw);
    const level = score <= 1 ? "weak" : score <= 3 ? "fair" : "strong";
    const text = score <= 1 ? "Weak" : score <= 3 ? "Fair" : "Strong";
    container.className = `strength strength--${level}`;
    if (label) label.textContent = text;
  };
  input.addEventListener("input", update);
  update();
}

/**
 * Validate password fields live (match + min length) so users get
 * feedback while typing, not only on submit.
 */
export function initLiveAuthValidation({ passwordInput, confirmInput } = {}) {
  if (passwordInput) {
    passwordInput.addEventListener("blur", () => {
      const v = passwordInput.value || "";
      if (v && v.length < 8) setFieldError(passwordInput, "Password must be at least 8 characters.");
      else if (v) setFieldError(passwordInput, "");
    });
    passwordInput.addEventListener("input", () => {
      if ((passwordInput.value || "").length >= 8) setFieldError(passwordInput, "");
      if (confirmInput && confirmInput.value) {
        setFieldError(
          confirmInput,
          confirmInput.value === passwordInput.value ? "" : "Passwords do not match."
        );
      }
    });
  }
  if (confirmInput && passwordInput) {
    confirmInput.addEventListener("input", () => {
      if (!confirmInput.value) return;
      setFieldError(
        confirmInput,
        confirmInput.value === passwordInput.value ? "" : "Passwords do not match."
      );
    });
  }
}

/**
 * Build skeleton placeholder cards (loading shimmer) inside a container.
 * Replaces "Loading…" text with a perceived-performance win.
 */
export function renderSkeletons(container, count = 3) {
  if (!container) return;
  container.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const card = document.createElement("div");
    card.className = "skeleton-card";
    card.setAttribute("aria-hidden", "true");
    const l1 = document.createElement("div");
    l1.className = "skeleton skeleton-line skeleton-line--short";
    const l2 = document.createElement("div");
    l2.className = "skeleton skeleton-line skeleton-line--mid";
    const l3 = document.createElement("div");
    l3.className = "skeleton skeleton-line";
    card.append(l1, l2, l3);
    container.appendChild(card);
  }
}
