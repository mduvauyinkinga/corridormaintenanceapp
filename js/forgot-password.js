/**
 * forgot-password.js
 * ------------------------------------------------------------------
 * Sends a password-reset link to the resident's email.
 * POSTs to /api/auth/forgot-password and shows a confirmation.
 */
import { api } from "./api.js";
import {
  $,
  setButtonLoading,
  showError,
  clearError,
  focusFirstError,
  initLiveAuthValidation,
} from "./utils.js";

const form = $("#forgot-password-form");
const submitBtn = $("#send-reset-btn");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  const emailInput = $("#email");
  const email = emailInput.value.trim();

  let valid = true;
  if (!email) {
    setFieldError(emailInput, "Email is required.");
    valid = false;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setFieldError(emailInput, "Please enter a valid email address.");
    valid = false;
  }
  if (!valid) {
    focusFirstError(form);
    return;
  }

  const restore = setButtonLoading(submitBtn, "Sending…");

  try {
    await api("/auth/forgot-password", {
      method: "POST",
      body: { email },
      auth: false,
    });

    // Always show the same message (anti-enumeration on the server).
    form.innerHTML = `
      <div class="form__alert" role="alert" style="background:#eef4fb;border:1px solid #c6d0da;color:#143c5c;padding:var(--space-2);border-radius:var(--radius-sm);margin-bottom:var(--space-3);">
        <strong>Reset link sent.</strong> If an account exists for <strong>${email}</strong>,
        a password-reset link has been sent to that email. It expires in 1 hour.
      </div>
      <p class="form__switch">
        Remember your password? <a href="login.html">Sign in</a>
      </p>
    `;
  } catch (error) {
    console.error("[forgot-password] failed:", error);
    showError(error.message || "Something went wrong. Please try again.");
    restore();
  }
});

function setFieldError(input, message) {
  const key = input.dataset.errorKey || input.name;
  const errorEl = document.querySelector(`[data-error="${key}"]`);
  if (errorEl) {
    errorEl.textContent = message || "";
    errorEl.hidden = !message;
  }
  input.classList.toggle("is-invalid", Boolean(message));
  input.setAttribute("aria-invalid", message ? "true" : "false");
}

initLiveAuthValidation({ passwordInput: $("#email") });