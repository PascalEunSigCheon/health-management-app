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
import { LANGUAGE_OPTIONS, LOCATION_OPTIONS, SPECIALTIES } from "./constants.js";

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
  select.innerHTML = `${select.name !== "languages" ? '<option value="">Select</option>' : ""}`;
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function populateLanguages(select) {
  select.innerHTML = "";
  LANGUAGE_OPTIONS.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function toggleDoctorFields(role) {
  const section = document.querySelector("#doctorFields");
  const shouldShow = role === "DOCTOR";
  section.hidden = !shouldShow;
  section.querySelectorAll("select").forEach((select) => {
    select.required = shouldShow;
  });
  if (!shouldShow) {
    section.querySelectorAll("select").forEach((select) => {
      if (select.multiple) {
        Array.from(select.options).forEach((option) => {
          option.selected = false;
        });
      } else {
        select.value = "";
      }
    });
  }
}

function selectedLanguages(select) {
  return Array.from(select.selectedOptions).map((option) => option.value);
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
  if (!selectedLanguages(form.languages).length) {
    setError("languages", "Select at least one language");
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

function attachEvents() {
  const form = document.querySelector("#signupForm");
  const submitBtn = document.querySelector("#signupBtn");
  populateOptions(form.specialty, SPECIALTIES);
  populateOptions(form.city, LOCATION_OPTIONS);
  populateLanguages(form.languages);
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
