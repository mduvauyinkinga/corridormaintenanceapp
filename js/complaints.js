/**
 * complaints.js
 * ------------------------------------------------------------------
 * Complaint submission handler (self-coded backend version).
 *
 * - Guards the page for residents only.
 * - Requires the resident to have chosen a room (unit claim).
 * - Validates a category and at least one issue is selected.
 * - Validates and previews optional photo attachments.
 * - Compresses photos client-side and submits everything in one
 *   POST /api/complaints call (the server stores the photo bytes and
 *   writes the initial "Complaint Submitted" timeline event).
 */

import { api } from "./api.js";
import { requireRole, warnIfSessionExpiring } from "./auth.js";
import { renderNav } from "./nav.js";
import {
  setButtonLoading,
  showError,
  clearError,
  setFieldError,
  issuesForCategory,
  toast,
  $,
} from "./utils.js";
// Photo upload helpers (validateImageFile, prepareImageForUpload) are
// kept available if needed later, but photo submission is disabled until
// storage costs can be afforded.

const form = $("#complaint-form");
const submitBtn = $("#submit-complaint-btn");
const clearDraftBtn = $("#clear-draft-btn");
const issuesBox = $("#issues-list");
const issuesHint = $("#issues-hint");
const issuesError = document.querySelector('[data-error="issues"]');
const categoryInput = $("#category");
const categoryError = document.querySelector('[data-error="category"]');
const photosInput = $("#photos");
const photosError = document.querySelector('[data-error="photos"]');
const photoPreview = $("#photo-preview");
const uploadProgress = $("#upload-progress");
const notesInput = $("#notes");
const notesCount = $("#notes-count");
const draftStatus = $("#draft-status");

// Photo upload disabled - selectedFiles always empty
let selectedFiles = [];

// Signed-in resident profile (from requireRole in init).
let currentProfile = null;

const DRAFT_KEY_PREFIX = "corridor_draft_";
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function draftKey() {
  const uid = currentProfile?.uid || "anon";
  return `${DRAFT_KEY_PREFIX}${uid}`;
}

/**
 * Render the issue checkboxes for the chosen category. Previously the
 * same 9 static issues showed for every category (Electrical offered
 * Fridge/Shower) — now each category gets its own relevant list.
 * @param {string[]} [preserve] - issue values to keep checked (draft restore).
 */
function renderIssues(category, preserve = []) {
  issuesBox.innerHTML = "";
  if (!category) {
    if (issuesHint) issuesHint.textContent = "Choose a category first to see relevant issues.";
    return;
  }
  if (issuesHint) issuesHint.textContent = `Issues for ${category} — tick all that apply.`;
  const keep = new Set(preserve);
  issuesForCategory(category).forEach((issue) => {
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.name = "issues";
    box.value = issue;
    if (keep.has(issue)) box.checked = true;
    const text = document.createElement("span");
    text.textContent = issue;
    label.append(box, text);
    issuesBox.appendChild(label);
  });
}

/**
 * Save category + checked issues + notes to localStorage (debounced).
 * Photos are NOT saved (File objects can't persist) — the count + names
 * are kept so the user knows to re-attach them.
 */
let draftTimer = null;
function scheduleDraftSave() {
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(saveDraft, 400);
}

function saveDraft() {
  if (!currentProfile) return;
  try {
    const draft = {
      category: categoryInput.value || "",
      issues: Array.from(form.querySelectorAll('input[name="issues"]:checked')).map((cb) => cb.value),
      notes: notesInput.value || "",
      photoNames: selectedFiles.map((f) => f.name),
      savedAt: Date.now(),
    };
    localStorage.setItem(draftKey(), JSON.stringify(draft));
    if (draftStatus) {
      draftStatus.hidden = false;
      draftStatus.textContent = "Draft saved automatically.";
    }
  } catch (e) {
    /* storage full/blocked — form still works, just no autosave */
  }
}

function restoreDraft() {
  let draft = null;
  try {
    const raw = localStorage.getItem(draftKey());
    if (!raw) return false;
    draft = JSON.parse(raw);
    if (!draft || Date.now() - (draft.savedAt || 0) > DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(draftKey());
      return false;
    }
  } catch (e) {
    return false;
  }
  if (draft.category) {
    categoryInput.value = draft.category;
    renderIssues(draft.category, draft.issues || []);
  }
  if (draft.notes) {
    notesInput.value = draft.notes;
    updateNotesCount();
  }
  if (draftStatus) {
    draftStatus.hidden = false;
    draftStatus.textContent =
      draft.photoNames?.length > 0
        ? `Draft restored. Please re-attach ${draft.photoNames.length} photo${draft.photoNames.length === 1 ? "" : "s"} (${draft.photoNames.join(", ")}).`
        : "Draft restored.";
  }
  toast("Previous draft restored.", "info");
  return true;
}

function clearDraft() {
  try {
    localStorage.removeItem(draftKey());
  } catch (e) {
    /* ignore */
  }
  if (draftStatus) {
    draftStatus.hidden = true;
    draftStatus.textContent = "";
  }
}

function updateNotesCount() {
  if (!notesCount || !notesInput) return;
  const len = (notesInput.value || "").length;
  const max = Number(notesInput.getAttribute("maxlength")) || 1000;
  notesCount.textContent = `${len} / ${max}`;
}

/**
 * Show an inline error under a control, or clear it.
 * Uses setFieldError so aria-invalid / aria-describedby stay in sync with
 * what the user sees.
 */
function showFieldError(errorEl, input, message) {
  if (input) {
    setFieldError(input, message);
    return;
  }
  // Fields with no single input (e.g. the issues checkbox group) fall
  // back to writing the message directly.
  if (errorEl) {
    errorEl.textContent = message || "";
    errorEl.hidden = !message;
  }
}

/* --------------------------- Photo preview logic -------------------------- */

/**
 * Render thumbnail previews for the currently selected files and show
 * any validation errors for invalid files.
 */
function renderPhotoPreviews() {
  photoPreview.innerHTML = "";
  photosError.textContent = "";
  photosError.hidden = true;

  const countEl = $("#photo-count");
  if (countEl) {
    if (selectedFiles.length === 0) {
      countEl.hidden = true;
      countEl.textContent = "";
    } else {
      countEl.hidden = false;
      countEl.textContent = `${selectedFiles.length} of 5 photo${selectedFiles.length === 1 ? "" : "s"} selected`;
    }
  }

  if (selectedFiles.length === 0) return;

  selectedFiles.forEach((file, index) => {
    const error = validateImageFile(file);
    if (error) {
      photosError.textContent = error;
      photosError.hidden = false;
    }

    const box = document.createElement("div");
    box.className = "photo-preview__item";

    const img = document.createElement("img");
    img.alt = `Photo ${index + 1}: ${file.name}`;
    img.className = error ? "photo-preview__img is-invalid" : "photo-preview__img";

    // Local object URL for immediate preview.
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;
    box.appendChild(img);

    const label = document.createElement("span");
    label.className = "photo-preview__name";
    label.textContent = file.name;
    box.appendChild(label);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "photo-remove";
    removeBtn.setAttribute("aria-label", `Remove photo ${index + 1}: ${file.name}`);
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => {
      URL.revokeObjectURL(objectUrl);
      selectedFiles = selectedFiles.filter((_, i) => i !== index);
      // Rebuild the FileList-backed input so submit + validation stay in sync.
      try {
        const dt = new DataTransfer();
        selectedFiles.forEach((f) => dt.items.add(f));
        photosInput.files = dt.files;
      } catch (e) {
        /* DataTransfer unsupported — selectedFiles remains source of truth */
      }
      renderPhotoPreviews();
      scheduleDraftSave();
      photosInput.focus();
    });
    box.appendChild(removeBtn);

    photoPreview.appendChild(box);
  });
}

photosInput.addEventListener("change", () => {
  let picked = Array.from(photosInput.files || []);
  if (picked.length > 5) {
    showFieldError(photosError, photosInput, "You can attach up to 5 photos. Only the first 5 were kept.");
    picked = picked.slice(0, 5);
    try {
      const dt = new DataTransfer();
      picked.forEach((f) => dt.items.add(f));
      photosInput.files = dt.files;
    } catch (e) {
      /* ignore */
    }
  }
  selectedFiles = picked;
  renderPhotoPreviews();
  scheduleDraftSave(); // remember photo names so restore can ask for re-attach
});

/* ------------------------------ Initial load ------------------------------ */

async function init() {
  const profile = await requireRole(["resident"]);
  if (!profile) return;
  currentProfile = profile;

  renderNav(profile);

  // A complaint is the most expensive thing to lose mid-typing, so warn
  // before the token dies rather than after.
  warnIfSessionExpiring({ toast });

  // Require a room before allowing complaints.
  if (!profile.roomId || !profile.unitId) {
    showError("You must choose a room before submitting a complaint.");
    submitBtn.disabled = true;
    return;
  }

  // Dynamic issues: rebuild the checklist whenever the category changes.
  // Previously-checked issues are kept only if still relevant.
  renderIssues("");
  categoryInput.addEventListener("change", () => {
    const stillChecked = Array.from(
      form.querySelectorAll('input[name="issues"]:checked')
    ).map((cb) => cb.value);
    renderIssues(categoryInput.value, stillChecked);
    showFieldError(categoryError, categoryInput, "");
    scheduleDraftSave();
  });

  // Draft restore (after profile known so the key is per-user).
  restoreDraft();

  // Autosave on every edit; photos trigger too so names are remembered.
  notesInput.addEventListener("input", () => {
    updateNotesCount();
    scheduleDraftSave();
  });
  issuesBox.addEventListener("change", scheduleDraftSave);
  updateNotesCount();

  if (clearDraftBtn) {
    clearDraftBtn.addEventListener("click", () => {
      form.reset();
      renderIssues("");
      selectedFiles = [];
      try {
        photosInput.value = "";
      } catch (e) {
        /* ignore */
      }
      renderPhotoPreviews();
      updateNotesCount();
      clearDraft();
      toast("Draft cleared.", "info");
      categoryInput.focus();
    });
  }
}

/* ------------------------------ Submission -------------------------------- */

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  // Gather & validate category.
  const category = categoryInput.value;
  if (!category) {
    showFieldError(categoryError, categoryInput, "Please select a category.");
    categoryInput.focus();
    return;
  }
  showFieldError(categoryError, categoryInput, "");

  // Gather selected issues.
  const selectedIssues = Array.from(
    form.querySelectorAll('input[name="issues"]:checked')
  ).map((cb) => cb.value);

  if (selectedIssues.length === 0) {
    showFieldError(issuesError, null, "Please select at least one issue.");
    // Focus the first checkbox so AT users land in the fieldset.
    const firstIssue = form.querySelector('input[name="issues"]');
    if (firstIssue) firstIssue.focus();
    return;
  }
  showFieldError(issuesError, null, "");

  // Validate photos before preparing them.
  const invalidPhoto = selectedFiles.find((f) => validateImageFile(f));
  if (invalidPhoto) {
    showFieldError(photosError, photosInput, validateImageFile(invalidPhoto));
    return;
  }
  showFieldError(photosError, photosInput, "");

  if (!currentProfile) {
    window.location.href = "login.html";
    return;
  }

  const notes = $("#notes").value.trim();

  const restore = setButtonLoading(submitBtn, "Submitting…");

  try {
    // Compress photos client-side (replaces the Firebase Storage upload).
    const photos = [];
    if (selectedFiles.length > 0) {
      uploadProgress.hidden = false;
      for (let i = 0; i < selectedFiles.length; i++) {
        uploadProgress.textContent = `Preparing photos… ${i + 1} of ${selectedFiles.length}`;
        const dataURL = await prepareImageForUpload(selectedFiles[i]);
        photos.push(dataURL);
      }
      uploadProgress.textContent = "Submitting…";
    }

    await api("/complaints", {
      method: "POST",
      body: {
        category,
        issues: selectedIssues,
        notes: notes || "",
        ...(photos.length > 0 ? { photos } : {}),
      },
    });

    toast("Complaint submitted successfully!", "success");
    form.reset();
    renderIssues("");
    selectedFiles = [];
    photoPreview.innerHTML = "";
    const countEl = $("#photo-count");
    if (countEl) {
      countEl.hidden = true;
      countEl.textContent = "";
    }
    uploadProgress.hidden = true;
    updateNotesCount();
    clearDraft(); // submitted — draft must not come back
    setTimeout(() => {
      window.location.href = "tracking.html";
    }, 800);
  } catch (error) {
    console.error("[complaints] submit error:", error);
    showError(error.message || "Could not submit the complaint. Please try again.");
    restore();
  }
});

init();
