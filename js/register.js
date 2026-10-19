/**
 * register.js
 * ------------------------------------------------------------------
 * Resident registration handler.
 *
 * 1. Validates the form (name, student number, TUT email, passwords).
 * 2. POSTs to our backend /auth/register to create the account.
 * 3. Stores the returned session and redirects to choose-room.html.
 */
import { api, setSession, ALLOWED_DOMAIN } from "./api.js";
import {
  validateRequired,
  validateEmailDomain,
  setFieldError,
  setButtonLoading,
  showError,
  clearError,
  focusFirstError,
  initPasswordToggles,
  initPasswordStrength,
  initLiveAuthValidation,
  $,
} from "./utils.js";

const form = $("#register-form");
const submitBtn = $("#register-btn");

/** Validate the full form. Returns true if all fields are valid. */
function validateForm(data) {
  let valid = true;

  const nameInput = $("#full-name");
  const studentInput = $("#student-number");
  const emailInput = $("#email");
  const passwordInput = $("#password");
  const confirmInput = $("#confirm-password");

  // Full name
  if (!validateRequired(nameInput, "Full name")) valid = false;

  // Student number
  if (!validateRequired(studentInput, "Student number")) valid = false;

  // Email
  if (!validateRequired(emailInput, "Email")) {
    valid = false;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
    setFieldError(emailInput, "Please enter a valid email address.");
    valid = false;
  } else if (!validateEmailDomain(data.email.trim(), ALLOWED_DOMAIN)) {
    setFieldError(emailInput, `Registration is only allowed with ${ALLOWED_DOMAIN} email addresses.`);
    valid = false;
  } else {
    setFieldError(emailInput, "");
  }

  // Password
  if (!validateRequired(passwordInput, "Password")) {
    valid = false;
  } else if (data.password.length < 8) {
    setFieldError(passwordInput, "Password must be at least 8 characters.");
    valid = false;
  } else {
    setFieldError(passwordInput, "");
  }

  // Confirm password
  if (!validateRequired(confirmInput, "Confirm password")) {
    valid = false;
  } else if (data.confirmPassword !== data.password) {
    setFieldError(confirmInput, "Passwords do not match.");
    valid = false;
  } else {
    setFieldError(confirmInput, "");
  }

  return valid;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();
  const data = {
    fullName: $("#full-name").value.trim(),
    studentNumber: $("#student-number").value.trim(),
    email: $("#email").value.trim(),
    password: $("#password").value,
    confirmPassword: $("#confirm-password").value,
  };

  if (!validateForm(data)) {
    // Send keyboard/AT users straight to the first problem field.
    focusFirstError(form);
    return;
  }

  const restore = setButtonLoading(submitBtn, "Creating account...");

  try {
    const result = await api("/auth/register", {
      method: "POST",
      body: {
        fullName: data.fullName,
        studentNumber: data.studentNumber,
        email: data.email,
        password: data.password,
      },
      auth: false,
    });
    setSession(result.token, result.user);
    window.location.href = "choose-room.html";
  } catch (error) {
    console.error("[register] Registration failed:", error);
    showError(error.message || "Something went wrong. Please try again.");
    restore();
  }
});

// Show/hide password, live strength meter + live match validation.
initPasswordToggles();
initPasswordStrength($("#password"), $("#password-strength"));
initLiveAuthValidation({
  passwordInput: $("#password"),
  confirmInput: $("#confirm-password"),
});