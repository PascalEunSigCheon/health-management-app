import {
  confirmUser,
  disableWhilePending,
  loadConfig,
  resendConfirmation,
  showToast,
  signUpUser,
  validateEmail,
  validateStrongPassword,
} from "./app.js";

let pendingEmail = "";

function setError(inputName, message) {
  const field = document.querySelector(`[data-error-for="${inputName}"]`);
  if (field) {
    field.textContent = message || "";
  }
}

function clearErrors() {
  document.querySelectorAll("[data-error-for]").forEach((el) => {
    el.textContent = "";
  });
}

function toggleDoctorFields(role) {
  const section = document.querySelector("#doctorFields");
  section.hidden = role !== "DOCTOR";
  section.querySelectorAll("input").forEach((input) => {
    if (input.name === "languages") {
      input.required = false;
    } else {
      input.required = role === "DOCTOR";
    }
  });
}

function validateForm(form) {
  let valid = true;
  clearErrors();
  if (!form.firstName.value.trim()) {
    setError("firstName", "Enter your first name");
    valid = false;
  }
  if (!form.lastName.value.trim()) {
    setError("lastName", "Enter your last name");
    valid = false;
  }
  if (!validateEmail(form.email.value.trim())) {
    setError("email", "Enter a valid email");
    valid = false;
  }
  if (!validateStrongPassword(form.password.value)) {
    setError("password", "Password must meet complexity requirements");
    valid = false;
  }
  if (!form.role.value) {
    setError("role", "Choose a role");
    valid = false;
  }
  if (form.role.value === "DOCTOR") {
    if (!form.specialty.value.trim()) {
      setError("specialty", "Enter a specialty");
      valid = false;
    }
    if (!form.location.value.trim()) {
      setError("location", "Enter a location");
      valid = false;
    }
  }
  return valid;
}

async function performSignup(form, submitBtn) {
  try {
    await disableWhilePending(submitBtn, signUpUser(form));
    pendingEmail = form.email.value.trim();
    document.querySelector("#confirmEmail").textContent = pendingEmail;
    document.querySelector("#confirmationSection").hidden = false;
    showToast("Check your email for the confirmation code", "success");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Unable to sign up", "error");
  }
}

async function handleConfirm(event) {
  event.preventDefault();
  if (!pendingEmail) {
    showToast("Complete sign-up first", "error");
    return;
  }
  const form = event.currentTarget;
  const code = form.code.value.trim();
  if (!code) {
    setError("code", "Enter the verification code");
    return;
  }
  const button = document.querySelector("#confirmBtn");
  try {
    await disableWhilePending(button, confirmUser(pendingEmail, code));
    showToast("Account confirmed. You can sign in now.", "success");
    window.location.replace("./signin.html");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Unable to confirm", "error");
  }
}

async function handleResend() {
  if (!pendingEmail) {
    showToast("Submit the sign-up form first", "error");
    return;
  }
  const button = document.querySelector("#resendBtn");
  try {
    await disableWhilePending(button, resendConfirmation(pendingEmail));
    showToast("Confirmation code resent", "success");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Unable to resend code", "error");
  }
}

function attachEvents() {
  const form = document.querySelector("#signupForm");
  const submitBtn = document.querySelector("#signupBtn");
  form.role.addEventListener("change", () => toggleDoctorFields(form.role.value));
  toggleDoctorFields(form.role.value);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!validateForm(form)) return;
    performSignup(form, submitBtn);
  });
  document.querySelector("#confirmationForm").addEventListener("submit", handleConfirm);
  document.querySelector("#resendBtn").addEventListener("click", handleResend);
}

async function init() {
  try {
    await loadConfig();
  } catch (error) {
    console.error(error);
  }
  attachEvents();
}

window.addEventListener("DOMContentLoaded", init);
