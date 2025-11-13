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
import { LOCATION_OPTIONS, SPECIALTIES } from "./constants.js";

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

function populateOptions(select, values) {
  // Always include a default "Select" option for dropdowns.
  select.innerHTML = '<option value="">Select</option>';
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

// No languages required in the simplified application; this function is a no-op.
function populateLanguages() {}

function toggleDoctorFields(role) {
  const section = document.querySelector("#doctorFields");
  const shouldShow = role === "DOCTOR";
  section.hidden = !shouldShow;
  section.querySelectorAll("select").forEach((select) => {
    select.required = shouldShow;
  });
  if (!shouldShow) {
    section.querySelectorAll("select").forEach((select) => {
      select.value = "";
    });
  }
}

// Removed language selection; return an empty array for legacy usage.
function selectedLanguages() {
  return [];
}

function validateDoctorFields(form) {
  let valid = true;
  if (!form.specialty.value) {
    setError("specialty", "Select a specialty");
    valid = false;
  }
  if (!form.city.value) {
    setError("city", "Select a city");
    valid = false;
  }
  return valid;
}

function validateForm(form) {
  clearErrors();
  let valid = true;
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
    valid = validateDoctorFields(form) && valid;
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

function enableEasyMultiSelect(select) {
  if (!select || !select.multiple) return;

  // Allow single clicks to toggle options (no Ctrl/Cmd needed)
  select.addEventListener("mousedown", (e) => {
    const opt = e.target;
    if (opt.tagName !== "OPTION") return;
    e.preventDefault();              // prevent native selection behavior
    opt.selected = !opt.selected;    // toggle
    // notify React-less forms that value changed
    select.dispatchEvent(new Event("input",  { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}


function attachEvents() {
  const form = document.querySelector("#signupForm");
  const submitBtn = document.querySelector("#signupBtn");

  populateOptions(form.specialty, SPECIALTIES);
  populateOptions(form.city, LOCATION_OPTIONS);
  // Languages are not used in the simplified flow.

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
