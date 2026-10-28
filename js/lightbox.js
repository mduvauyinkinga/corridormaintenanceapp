/**
 * lightbox.js
 * ------------------------------------------------------------------
 * Shared full-screen image viewer + thumbnail gallery for complaint
 * photos. Used by both the resident tracking page and the management
 * dashboard so the behavior stays consistent everywhere.
 *
 * Provides:
 *   - renderGallery(container, urls) : thumbnail grid; clicking a
 *     thumbnail opens the lightbox at that image.
 *   - openLightbox(urls, startIndex) : full-screen modal with prev/next
 *     navigation, a position counter, keyboard (Esc / arrows), focus
 *     trapping and a dark overlay.
 */

/** Singleton lightbox root element (created lazily). */
let lightboxEl = null;
let lightboxUrls = [];
let lightboxIndex = 0;
let previouslyFocused = null;

/**
 * Build the lightbox DOM (one shared instance per page).
 */
function ensureLightbox() {
  if (lightboxEl) return lightboxEl;

  lightboxEl = document.createElement("div");
  lightboxEl.className = "lightbox hidden";
  lightboxEl.setAttribute("role", "dialog");
  lightboxEl.setAttribute("aria-modal", "true");
  lightboxEl.setAttribute("aria-label", "Image viewer");
  lightboxEl.innerHTML = `
    <div class="lightbox__overlay" data-lightbox-close></div>
    <div class="lightbox__panel">
      <button type="button" class="lightbox__close" data-lightbox-close aria-label="Close image viewer">&times;</button>
      <button type="button" class="lightbox__nav lightbox__nav--prev" data-lightbox-prev aria-label="Previous image">&#8249;</button>
      <figure class="lightbox__stage">
        <img class="lightbox__img" alt="Complaint photo enlarged" />
        <figcaption class="lightbox__caption" aria-live="polite"></figcaption>
      </figure>
      <button type="button" class="lightbox__nav lightbox__nav--next" data-lightbox-next aria-label="Next image">&#8250;</button>
    </div>
  `;
  document.body.appendChild(lightboxEl);

  // Wire controls.
  lightboxEl.querySelectorAll("[data-lightbox-close]").forEach((el) => {
    el.addEventListener("click", closeLightbox);
  });
  lightboxEl
    .querySelector("[data-lightbox-prev]")
    .addEventListener("click", () => showImage(lightboxIndex - 1));
  lightboxEl
    .querySelector("[data-lightbox-next]")
    .addEventListener("click", () => showImage(lightboxIndex + 1));

  // Keyboard support.
  lightboxEl.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeLightbox();
    } else if (event.key === "ArrowLeft") {
      showImage(lightboxIndex - 1);
    } else if (event.key === "ArrowRight") {
      showImage(lightboxIndex + 1);
    }
  });

  // Focus trap: keep Tab cycling inside the lightbox.
  lightboxEl.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const focusables = lightboxEl.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  return lightboxEl;
}

/**
 * Display the image at `index`, wrapping around at both ends.
 * @param {number} index - Target index into lightboxUrls.
 */
function showImage(index) {
  if (lightboxUrls.length === 0) return;
  lightboxIndex = (index + lightboxUrls.length) % lightboxUrls.length;

  const img = lightboxEl.querySelector(".lightbox__img");
  img.src = lightboxUrls[lightboxIndex];
  img.alt = `Complaint photo ${lightboxIndex + 1} of ${lightboxUrls.length}`;

  const caption = lightboxEl.querySelector(".lightbox__caption");
  caption.textContent = `${lightboxIndex + 1} of ${lightboxUrls.length}`;

  // Manage nav visibility: single image hides the arrows.
  const single = lightboxUrls.length <= 1;
  lightboxEl.querySelectorAll(".lightbox__nav").forEach((btn) => {
    btn.classList.toggle("hidden", single);
  });

  // Focus management on keyboard navigation.
  img.focus?.({ preventScroll: true });
}

/**
 * Open the full-screen viewer starting at `startIndex`.
 * @param {string[]} urls - Array of download URLs.
 * @param {number} startIndex - Index of the image to show first (default 0).
 */
export function openLightbox(urls, startIndex = 0) {
  const list = Array.isArray(urls) ? urls.filter(Boolean) : [];
  if (list.length === 0) return;

  const el = ensureLightbox();
  lightboxUrls = list;
  previouslyFocused = document.activeElement;

  el.classList.remove("hidden");
  document.body.classList.add("modal-open");
  showImage(startIndex);

  // Move focus into the dialog for screen readers / keyboard users.
  const firstBtn = el.querySelector("button");
  firstBtn?.focus?.({ preventScroll: true });
}

/** Close the lightbox and restore focus to the invoking element. */
export function closeLightbox() {
  if (!lightboxEl) return;
  lightboxEl.classList.add("hidden");
  document.body.classList.remove("modal-open");
  lightboxUrls = [];
  if (previouslyFocused && typeof previouslyFocused.focus === "function") {
    previouslyFocused.focus?.({ preventScroll: true });
  }
  previouslyFocused = null;
}

/**
 * Render a thumbnail gallery into `container`.
 *
 * Each thumbnail is a <button> (accessible) that opens the lightbox.
 * The container is cleared first.
 *
 * @param {HTMLElement} container - Target element.
 * @param {string[]} urls - Array of download URLs.
 */
export function renderGallery(container, urls) {
  if (!container) return;
  container.innerHTML = "";

  const list = Array.isArray(urls) ? urls.filter(Boolean) : [];
  if (list.length === 0) {
    const empty = document.createElement("div");
    empty.className = "photo-empty";
    empty.textContent = "No photos attached.";
    container.appendChild(empty);
    return;
  }

  list.forEach((url, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "photo-gallery__item";
    btn.setAttribute("aria-label", `Open photo ${index + 1} of ${list.length} in the viewer`);

    const img = document.createElement("img");
    img.src = url;
    img.alt = `Complaint photo ${index + 1}`;
    img.loading = "lazy";
    img.decoding = "async";
    btn.appendChild(img);

    btn.addEventListener("click", () => openLightbox(list, index));
    container.appendChild(btn);
  });
}

/**
 * Ensure a lightbox exists even when no gallery was rendered.
 * Not strictly required by the pages, but keeps the module self-contained
 * for testability.
 */
export function preloadLightbox() {
  ensureLightbox();
}

