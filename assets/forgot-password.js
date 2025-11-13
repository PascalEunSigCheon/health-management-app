import {
  requestPasswordReset,
  resetPassword,
  showToast,
  validateEmail,
  validateStrongPassword,
  disableWhilePending,
  loadConfig,
} from "./app.js";

/**
 * Utility to set an error message for a field by name
 * @param {string} name
 * @param {string} message
 */
function setError(name, message) {
  const el = document.querySelector(`[data-error-for="${name}"]`);
  if (el) el.textContent = message || "";
}

/**
 * Clear all error messages
 */
function clearErrors() {
  document.querySelectorAll("[data-error-for]").forEach((node) => {
    node.textContent = "";
  });
}

async function init() {
  try {
    await loadConfig();
  } catch (error) {
    console.error(error);
  }
  const requestForm = document.querySelector("#requestResetForm");
  const resetForm = document.querySelector("#resetPasswordForm");
  let emailForReset = "";
  requestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors();
    const email = requestForm.email.value.trim().toLowerCase();
    if (!validateEmail(email)) {
      setError("email", "Enter a valid email");
      return;
    }
    const btn = document.querySelector("#requestBtn");
    try {
      await disableWhilePending(btn, requestPasswordReset(email));
      emailForReset = email;
      showToast("Verification code sent. Check your inbox.", "success");
      requestForm.hidden = true;
      resetForm.hidden = false;
    } catch (error) {
      console.error(error);
      showToast(error.message || "Unable to send reset code", "error");
    }
  });
  resetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors();
    if (!emailForReset) {
      showToast("Request a reset code first", "error");
      return;
    }
    const code = resetForm.code.value.trim();
    const newPassword = resetForm.newPassword.value;
    if (!code) {
      setError("code", "Enter the verification code");
      return;
    }
    if (!validateStrongPassword(newPassword)) {
      setError("newPassword", "Password does not meet complexity requirements");
      return;
    }
    const btn = document.querySelector("#resetBtn");
    try {
      await disableWhilePending(btn, resetPassword(emailForReset, code, newPassword));
      showToast("Password reset successful. You can sign in now.", "success");
      window.location.replace("./signin.html");
    } catch (error) {
      console.error(error);
      showToast(error.message || "Unable to reset password", "error");
    }
  });
}

window.addEventListener("DOMContentLoaded", init);