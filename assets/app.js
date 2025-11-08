const SESSION_KEY = "healthApp.session";
let configPromise;
let cachedConfig;
let cognitoLibraryPromise;

function ensureToastContainer() {
  let container = document.querySelector(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    container.setAttribute("role", "status");
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message, variant = "success") {
  const container = ensureToastContainer();
  const toast = document.createElement("div");
  toast.className = `toast ${variant}`;
  toast.innerHTML = `<div>${message}</div>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4500);
}

export async function loadConfig() {
  if (!configPromise) {
    configPromise = fetch("./config.json", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load config.json: ${response.status}`);
        }
        cachedConfig = await response.json();
        return cachedConfig;
      })
      .catch((error) => {
        console.error(error);
        showToast("Unable to load configuration", "error");
        throw error;
      });
  }
  return configPromise;
}

export function getConfig() {
  if (!cachedConfig) {
    throw new Error("Config not loaded yet");
  }
  return cachedConfig;
}

async function ensureCognitoLibrary() {
  if (!cognitoLibraryPromise) {
    cognitoLibraryPromise = new Promise((resolve, reject) => {
      if (window.AmazonCognitoIdentity) {
        resolve(window.AmazonCognitoIdentity);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/amazon-cognito-identity-js@6.3.6/dist/amazon-cognito-identity.min.js";
      script.async = true;
      script.onload = () => resolve(window.AmazonCognitoIdentity);
      script.onerror = () => reject(new Error("Failed to load Cognito library"));
      document.head.appendChild(script);
    });
  }
  return cognitoLibraryPromise;
}

function decodeJwt(token) {
  try {
    const [, payload] = token.split(".");
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch (error) {
    console.error("Failed to decode JWT", error);
    return {};
  }
}

export function getSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }
  try {
    const session = JSON.parse(raw);
    const now = Math.floor(Date.now() / 1000);
    if (!session.expiresAt || session.expiresAt <= now) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch (error) {
    console.error("Invalid session", error);
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function persistSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function buildUserPool(cognito) {
  const config = getConfig();
  return new cognito.CognitoUserPool({
    UserPoolId: config.userPoolId,
    ClientId: config.userPoolClientId,
  });
}

export async function signUpUser(form) {
  await loadConfig();
  const cognito = await ensureCognitoLibrary();
  const pool = buildUserPool(cognito);

  const email = form.email.value.trim().toLowerCase();
  const password = form.password.value;
  const firstName = form.firstName.value.trim();
  const lastName = form.lastName.value.trim();
  const role = form.role.value;
  const specialty = form.specialty?.value.trim();
  const languages = form.languages?.value.trim();
  const location = form.location?.value.trim();

  const attributeList = [
    new cognito.CognitoUserAttribute({ Name: "given_name", Value: firstName }),
    new cognito.CognitoUserAttribute({ Name: "family_name", Value: lastName }),
    new cognito.CognitoUserAttribute({ Name: "custom:role", Value: role }),
  ];
  if (specialty) {
    attributeList.push(new cognito.CognitoUserAttribute({ Name: "custom:specialty", Value: specialty }));
  }
  if (languages) {
    attributeList.push(new cognito.CognitoUserAttribute({ Name: "custom:languages", Value: languages }));
  }
  if (location) {
    attributeList.push(new cognito.CognitoUserAttribute({ Name: "custom:location", Value: location }));
  }

  return new Promise((resolve, reject) => {
    pool.signUp(email, password, attributeList, [], (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

export async function confirmUser(email, code) {
  await loadConfig();
  const cognito = await ensureCognitoLibrary();
  const pool = buildUserPool(cognito);
  const user = new cognito.CognitoUser({ Username: email.toLowerCase(), Pool: pool });

  return new Promise((resolve, reject) => {
    user.confirmRegistration(code, true, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

export async function resendConfirmation(email) {
  await loadConfig();
  const cognito = await ensureCognitoLibrary();
  const pool = buildUserPool(cognito);
  const user = new cognito.CognitoUser({ Username: email.toLowerCase(), Pool: pool });

  return new Promise((resolve, reject) => {
    user.resendConfirmationCode((err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

export async function authenticateUser(email, password) {
  await loadConfig();
  const cognito = await ensureCognitoLibrary();
  const pool = buildUserPool(cognito);
  const authenticationDetails = new cognito.AuthenticationDetails({
    Username: email.toLowerCase(),
    Password: password,
  });
  const cognitoUser = new cognito.CognitoUser({ Username: email.toLowerCase(), Pool: pool });

  return new Promise((resolve, reject) => {
    cognitoUser.authenticateUser(authenticationDetails, {
      onSuccess: (session) => {
        const idToken = session.getIdToken().getJwtToken();
        const accessToken = session.getAccessToken().getJwtToken();
        const refreshToken = session.getRefreshToken().getToken();
        const payload = decodeJwt(idToken);
        const groups = payload["cognito:groups"] || [];
        const normalizedGroups = Array.isArray(groups) ? groups : String(groups).split(",").filter(Boolean);
        const expiresAt = payload.exp;
        const stored = {
          email: email.toLowerCase(),
          idToken,
          accessToken,
          refreshToken,
          groups: normalizedGroups,
          expiresAt,
        };
        persistSession(stored);
        resolve(stored);
      },
      onFailure: reject,
      newPasswordRequired: () => {
        reject(new Error("Password reset required"));
      },
    });
  });
}

export function signOutUser() {
  const session = getSession();
  if (session) {
    ensureCognitoLibrary().then((cognito) => {
      try {
        const pool = buildUserPool(cognito);
        const cognitoUser = new cognito.CognitoUser({ Username: session.email, Pool: pool });
        cognitoUser.signOut();
      } catch (error) {
        console.warn("Failed to sign out Cognito user", error);
      }
    });
  }
  clearSession();
}

export function userHasGroup(group) {
  const session = getSession();
  return Boolean(session?.groups?.includes(group));
}

export async function fetchJSON(path, options = {}) {
  await loadConfig();
  const session = getSession();
  const config = getConfig();
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  if (session?.idToken) {
    headers.set("Authorization", `Bearer ${session.idToken}`);
  }
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    ...options,
    headers,
  });
  if (response.status === 204) {
    return null;
  }
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = json.message || response.statusText;
    throw new Error(message);
  }
  return json;
}

export function requireRole(allowed) {
  const session = getSession();
  if (!session) {
    window.location.replace("./signin.html");
    return false;
  }
  const hasRole = allowed.some((group) => session.groups?.includes(group));
  if (!hasRole) {
    window.location.replace("./index.html");
    return false;
  }
  return true;
}

export function disableWhilePending(button, promise) {
  button.disabled = true;
  return promise.finally(() => {
    button.disabled = false;
  });
}

export function validateEmail(value) {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(value);
}

export function validateStrongPassword(value) {
  if (!value || value.length < 8) return false;
  const checks = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/];
  return checks.every((regex) => regex.test(value));
}

export function bindSignOut(button) {
  button.addEventListener("click", () => {
    signOutUser();
    window.location.replace("./index.html");
  });
}

export function formatDateTime(isoString) {
  const date = new Date(isoString);
  return `${date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })} • ${date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;
}

export function statusBadge(status) {
  const normalized = status?.toUpperCase?.() || "";
  const classes = ["badge"];
  if (normalized === "CONFIRMED") classes.push("success");
  if (["DECLINED", "CANCELLED"].includes(normalized)) classes.push("danger");
  return `<span class="${classes.join(" ")}">${normalized}</span>`;
}

export function groupLabel(groups) {
  if (!groups) return "";
  return Array.isArray(groups) ? groups.join(", ") : String(groups);
}

export function getUserEmail() {
  return getSession()?.email || "";
}
