import {
  authenticateUser,
  disableWhilePending,
  loadConfig,
  showToast,
  validateEmail,
} from "./app.js";

function setError(name, message) {
  const field = document.querySelector(`[data-error-for="${name}"]`);
  if (field) field.textContent = message || "";
}

function clearErrors() {
  document.querySelectorAll("[data-error-for]").forEach((el) => {
    el.textContent = "";
  });
}

function validate(form) {
  clearErrors();
  let valid = true;
  if (!validateEmail(form.email.value.trim())) {
    setError("email", "Enter a valid email");
    valid = false;
  }
  if (!form.password.value) {
    setError("password", "Enter your password");
    valid = false;
  }
  return valid;
}

function navigateAfterLogin(session) {
  if (session.groups?.includes("PATIENT")) {
    window.location.replace("./patient.html");
    return;
  }
  if (session.groups?.includes("DOCTOR")) {
    window.location.replace("./doctor.html");
    return;
  }
  window.location.replace("./index.html");
}

async function init() {
  try {
    await loadConfig();
  } catch (error) {
    console.error(error);
  }
  const form = document.querySelector("#signinForm");
  const button = document.querySelector("#signinBtn");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validate(form)) return;
    try {
      const session = await disableWhilePending(
        button,
        authenticateUser(form.email.value.trim(), form.password.value)
      );
      showToast("Signed in", "success");
      navigateAfterLogin(session);
    } catch (error) {
      console.error(error);
      showToast(error.message || "Unable to sign in", "error");
    }
  });
}

window.addEventListener("DOMContentLoaded", init);
