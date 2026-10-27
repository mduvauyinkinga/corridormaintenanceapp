/**
 * reset-password.js
 * ------------------------------------------------------------------
 * Sets a new password using a one-time reset token from the URL query
 * string (?token=xxx). POSTs to /api/auth/reset-password.
 */
import { api } from "./api.js";
import {
  $,
  setButtonLoading,
  showError,
  clearError,
  focusFirstError,
  initLiveAuthValidation,
  initPasswordStrength,
  initPasswordToggles,
} from "./utils.js";

const form = $("#reset-password-form");
const submitBtn = $("#reset-btn");
const tokenInput = $("#token");
const passwordInput = $("#password");
const confirmInput = $("#confirm-password");

// Read the reset token from the URL (?token=xxx).
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get("token") || "";
tokenInput.value = token;

if (!token) {
  showError("No reset token in the link. Please request a new reset link from the login page.");
  submitBtn.disabled = true;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  const password = passwordInput.value;
  const confirmPassword = confirmInput.value;

  let valid = true;
  if (!password || password.length < 8) {
    setFieldError(passwordInput, "Password must be at least 8 characters.");
    valid = false;
  }
  if (!confirmPassword) {
    setFieldError(confirmInput, "Please confirm your password.");
    valid = false;
  } else if (confirmPassword !== password) {
    setFieldError(confirmInput, "Passwords do not match.");
    valid = false;
  }
  if (!valid) {
    focusFirstError(form);
    return;
  }

  const restore = setButtonLoading(submitBtn, "Resetting…");

  try {
    await api("/auth/reset-password", {
      method: "POST",
      body: { token, password },
      auth: false,
    });

    form.innerHTML = `
      <div class="form__alert" role="alert" style="background:#eef4fb;border:1px solid #c6d0da;color:#143c5c;padding:var(--space-2);border-radius:var(--radius-sm);margin-bottom:var(--space-3);">
        <strong>Password reset.</strong> Your new password is now active. You can sign in.
      </div>
      <p class="form__switch">
        <a href="login.html">Go to sign in</a>
      </p>
    `;
  } catch (error) {
    console.error("[reset-password] failed:", error);
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

initPasswordToggles();
initLiveAuthValidation({ passwordInput, confirmInput });
initPasswordStrength(passwordInput, $("#password-strength"));