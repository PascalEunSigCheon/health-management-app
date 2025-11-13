import {
  bindSignOut,
  disableWhilePending,
  fetchJSON,
  formatDateTime,
  getConfig,
  getSession,
  loadConfig,
  requireRole,
  showToast,
  statusBadge,
} from "./app.js";
import {
  LOCATION_OPTIONS,
  MANDATORY_VITALS,
  SPECIALTIES,
  generateDoctorSlots,
} from "./constants.js";

const state = {
  doctors: [],
  appointments: [],
  latestMetrics: null,
  cachedVitals: null,  // Cache vitals in session
};

// Initialize debug helper immediately (before sign-in)
window.debugApp = {
  state: state,
  isInitialized: false,
  initError: null,
  getState: () => state,
  checkAuth: () => {
    try {
      const session = getSession();
      if (!session) {
        console.warn("Not signed in. Please sign in at signin.html");
        return { signedIn: false };
      }
      return { signedIn: true, session };
    } catch (error) {
      console.error("Error checking auth:", error);
      return { signedIn: false, error: error.message };
    }
  },
  checkConfig: () => {
    try {
      const config = getConfig();
      return { loaded: !!config, config };
    } catch (error) {
      return { loaded: false, error: error.message };
    }
  },
};

function setError(name, message) {
  const target = document.querySelector(`[data-error-for="${name}"]`);
  if (target) {
    target.textContent = message || "";
  }
}

function clearErrors() {
  document.querySelectorAll("[data-error-for]").forEach((node) => {
    node.textContent = "";
  });
}

function createNumberField(field) {
  const input = document.createElement("input");
  input.type = "number";
  input.name = field.name;
  input.required = Boolean(field.required);
  if (field.min !== undefined) input.min = field.min;
  if (field.max !== undefined) input.max = field.max;
  if (field.step !== undefined) input.step = field.step;
  input.inputMode = "decimal";
  return input;
}

function createSelectField(field) {
  const select = document.createElement("select");
  select.name = field.name;
  select.required = Boolean(field.required);
  select.appendChild(new Option("Select", ""));
  (field.options || []).forEach((option) => {
    select.appendChild(new Option(option.label, option.value));
  });
  return select;
}

function renderField(container, field) {
  const wrapper = document.createElement("label");
  wrapper.className = "form-field";
  const title = document.createElement("span");
  title.textContent = field.label;
  wrapper.appendChild(title);

  let control;
  if (field.type === "select") {
    control = createSelectField(field);
  } else {
    control = createNumberField(field);
  }
  control.dataset.field = field.name;
  wrapper.appendChild(control);

  const error = document.createElement("span");
  error.className = "error-text";
  error.dataset.errorFor = field.name;
  wrapper.appendChild(error);

  container.appendChild(wrapper);
}

function populateMandatoryVitals() {
  const container = document.querySelector("#mandatoryVitals");
  container.innerHTML = "";
  MANDATORY_VITALS.forEach((field) => renderField(container, field));
}

// No problem selection in simplified flow.

function populateSpecialties() {
  const select = document.querySelector("#specialtySelect");
  select.innerHTML = "";
  select.appendChild(new Option("Select specialty", ""));
  SPECIALTIES.forEach((value) => {
    select.appendChild(new Option(value, value));
  });
}

function populateFilters() {
  const location = document.querySelector("#locationFilter");
  LOCATION_OPTIONS.forEach((value) => location.appendChild(new Option(value, value)));
}

// There are no problem-specific vitals in the simplified flow.

function parseNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function collectVitals() {
  const payload = {};
  let valid = true;
  clearErrors();
  MANDATORY_VITALS.forEach((field) => {
    const input = document.querySelector(`[data-field="${field.name}"]`);
    const value = parseNumber(input?.value);
    if (value === null) {
      setError(field.name, "Required");
      valid = false;
      return;
    }
    if ((field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max)) {
      setError(field.name, `Value must be between ${field.min} and ${field.max}`);
      valid = false;
      return;
    }
    payload[field.name] = value;
  });
  
  // Cache vitals in session
  if (valid) {
    state.cachedVitals = payload;
    sessionStorage.setItem("health-app.vitals", JSON.stringify({
      vitals: payload,
      timestamp: new Date().toISOString()
    }));
  }
  
  return valid ? payload : null;
}

function gatherSearchFilters() {
  return {
    specialty: document.querySelector("#specialtySelect").value,
    location: document.querySelector("#locationFilter").value,
    slotWindow: Number(document.querySelector("#slotWindow").value || "3"),
  };
}

function loadCachedVitals() {
  try {
    const cached = sessionStorage.getItem("health-app.vitals");
    if (cached) {
      const data = JSON.parse(cached);
      state.cachedVitals = data.vitals;
      
      // Restore vitals to form if still on same page
      MANDATORY_VITALS.forEach((field) => {
        const input = document.querySelector(`[data-field="${field.name}"]`);
        if (input && data.vitals[field.name]) {
          input.value = data.vitals[field.name];
        }
      });
      
      console.info("Loaded cached vitals from session");
      return data.vitals;
    }
  } catch (error) {
    console.error("Failed to load cached vitals", error);
  }
  return null;
}

function clearCachedVitals() {
  sessionStorage.removeItem("health-app.vitals");
  state.cachedVitals = null;
}

function describeDoctor(doctor) {
  const profile = doctor.doctorProfile || {};
  const parts = [];
  if (profile.city) {
    parts.push(profile.city);
  }
  return parts.join(" • ");
}

function futureSlots(slots, days) {
  // Ensure slots is an array
  if (!slots || !Array.isArray(slots) || slots.length === 0) {
    return [];
  }
  const now = Date.now();
  const limit = now + days * 24 * 60 * 60 * 1000;
  return slots
    .map((slot) => {
      const date = new Date(slot);
      return !Number.isNaN(date.getTime()) ? date : null;
    })
    .filter((date) => date !== null && date.getTime() > now && date.getTime() <= limit)
    .sort((a, b) => a.getTime() - b.getTime());
}

function renderDoctorCard(doctor) {
  const card = document.createElement("article");
  card.className = "list-card";
  card.setAttribute("role", "listitem");

  const header = document.createElement("div");
  header.className = "list-card-header";
  header.innerHTML = `
    <h3>${doctor.firstName || ""} ${doctor.lastName || ""}</h3>
    <span class="badge">${doctor.doctorProfile?.specialty || "Specialty pending"}</span>
  `;
  card.appendChild(header);

  const details = document.createElement("p");
  details.className = "helper-text";
  details.textContent = describeDoctor(doctor);
  card.appendChild(details);

  const slotSelect = document.createElement("select");
  slotSelect.className = "slot-select";
  slotSelect.innerHTML = "";
  slotSelect.appendChild(new Option("Select a slot", ""));

  const { slotWindow } = gatherSearchFilters();
  const slots = futureSlots(doctor.doctorProfile?.availSlots, slotWindow);
  const fallbackSlots = slots.length ? slots : futureSlots(generateDoctorSlots(slotWindow), slotWindow);

  fallbackSlots.slice(0, 20).forEach((date) => {
    const iso = date.toISOString();
    slotSelect.appendChild(new Option(formatDateTime(iso), iso));
  });

  const bookBtn = document.createElement("button");
  bookBtn.type = "button";
  bookBtn.textContent = "Book appointment";
  bookBtn.addEventListener("click", () => bookAppointment(doctor, slotSelect.value, bookBtn));

  const controls = document.createElement("div");
  controls.className = "doctor-actions";
  controls.appendChild(slotSelect);
  controls.appendChild(bookBtn);
  card.appendChild(controls);

  return card;
}

function renderDoctors(list) {
  const container = document.querySelector("#doctorResults");
  container.innerHTML = "";
  if (!list.length) {
    const empty = document.createElement("p");
    empty.className = "helper-text";
    empty.textContent = "No doctors matched your filters. Try broadening your selection.";
    container.appendChild(empty);
    return;
  }
  list.forEach((doctor) => container.appendChild(renderDoctorCard(doctor)));
}

async function searchDoctors() {
  const session = getSession();
  if (!session) {
    showToast("Sign in to search doctors", "error");
    return;
  }

  const { specialty, location, slotWindow } = gatherSearchFilters();
  const capturedVitals = collectVitals();

  if (!specialty) {
    showToast("Select a specialty before searching", "error");
    return;
  }
  if (!capturedVitals) {
    showToast("Enter mandatory vitals before searching", "error");
    return;
  }

  state.vitals = capturedVitals;
  state.selectedSpecialty = specialty;

  const btn = document.querySelector("#findDoctorsBtn");
  try {
    const response = await disableWhilePending(btn, fetchJSON("/doctors"));
    let doctors = response.items || [];
    doctors = doctors.filter((doc) => {
      const docSpecialty = doc.doctorProfile?.specialty;
      return docSpecialty === specialty;
    });
    if (location) {
      doctors = doctors.filter((doc) => doc.doctorProfile?.city === location);
    }
    state.doctors = doctors;
    renderDoctors(doctors);
    
    // Auto-scroll to results after render
    setTimeout(() => {
      const heading = document.querySelector("#doctorSearchHeading");
      if (heading) {
        heading.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 300);
  } catch (error) {
    console.error("Search failed", error);
    showToast(error.message || "Unable to load doctors", "error");
  }
}

// --- Diabetes predictor UI and logic ---
const DIABETES_MODEL_URL = "https://kydqfodd48.execute-api.eu-west-3.amazonaws.com/default/test-model-endpoint";

function createRadioField(name, label) {
  const wrapper = document.createElement("fieldset");
  wrapper.className = "form-field radio-group";
  const legend = document.createElement("legend");
  legend.textContent = label;
  wrapper.appendChild(legend);
  [
    { v: 0, t: "No" },
    { v: 1, t: "Yes" },
  ].forEach((opt) => {
    const labelEl = document.createElement("label");
    labelEl.className = "radio-label";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = String(opt.v);
    if (opt.v === 0) input.checked = true;
    labelEl.appendChild(input);
    labelEl.appendChild(document.createTextNode(opt.t));
    wrapper.appendChild(labelEl);
  });
  return wrapper;
}

function createNumberControl(name, label, attrs = {}) {
  const wrapper = document.createElement("label");
  wrapper.className = "form-field";
  const title = document.createElement("span");
  title.textContent = label;
  wrapper.appendChild(title);
  const input = document.createElement("input");
  input.type = "number";
  input.dataset.field = name;
  if (attrs.min !== undefined) input.min = String(attrs.min);
  if (attrs.max !== undefined) input.max = String(attrs.max);
  if (attrs.step !== undefined) input.step = String(attrs.step);
  if (attrs.default !== undefined) input.value = String(attrs.default);
  wrapper.appendChild(input);
  const help = document.createElement("span");
  help.className = "helper-text";
  if (attrs.help) help.textContent = attrs.help;
  wrapper.appendChild(help);
  return wrapper;
}

function createSelectControl(name, label, options = [], defaultVal) {
  const wrapper = document.createElement("label");
  wrapper.className = "form-field";
  wrapper.appendChild(Object.assign(document.createElement("span"), { textContent: label }));
  const select = document.createElement("select");
  select.dataset.field = name;
  options.forEach((opt) => select.appendChild(new Option(opt.label, opt.value)));
  if (defaultVal !== undefined) select.value = defaultVal;
  wrapper.appendChild(select);
  return wrapper;
}

function populateDiabetesPredictor() {
  const container = document.querySelector("#predictorFields");
  container.innerHTML = "";

  // BMI: 10-70 step 0.1
  container.appendChild(createNumberControl("BMI", "BMI (kg/m²)", { min: 10, max: 70, step: 0.1, help: "Range 10–70" }));

  // HighBP
  container.appendChild(createRadioField("HighBP", "Ever told you have high blood pressure?"));

  // HighChol
  container.appendChild(createRadioField("HighChol", "Ever told you have high cholesterol?"));

  // GenHlth (1-5: Excellent->5 .. Poor->1), default 3
  container.appendChild(createSelectControl("GenHlth", "General health", [
    { label: "Excellent (5)", value: 5 },
    { label: "Very Good (4)", value: 4 },
    { label: "Good (3)", value: 3 },
    { label: "Fair (2)", value: 2 },
    { label: "Poor (1)", value: 1 },
  ], 3));

  // PhysHlth (0-30)
  container.appendChild(createNumberControl("PhysHlth", "Physical health (days not good in last 30)", { min: 0, max: 30, step: 1, help: "0–30 days" }));

  // Age codes 1..14 (labels)
  const ageOptions = [
    { label: "18–24 (1)", value: 1 },
    { label: "25–29 (2)", value: 2 },
    { label: "30–34 (3)", value: 3 },
    { label: "35–39 (4)", value: 4 },
    { label: "40–44 (5)", value: 5 },
    { label: "45–49 (6)", value: 6 },
    { label: "50–54 (7)", value: 7 },
    { label: "55–59 (8)", value: 8 },
    { label: "60–64 (9)", value: 9 },
    { label: "65–69 (10)", value: 10 },
    { label: "70–74 (11)", value: 11 },
    { label: "75–79 (12)", value: 12 },
    { label: "80 or older (13)", value: 13 },
    { label: "Unknown/Other (14)", value: 14 },
  ];
  container.appendChild(createSelectControl("Age", "Age group", ageOptions, 3));

  // DiffWalk
  container.appendChild(createRadioField("DiffWalk", "Serious difficulty walking or climbing stairs?"));

  // Smoker
  container.appendChild(createRadioField("Smoker", "Smoked ≥100 cigarettes lifetime?"));

  document.querySelector("#predictBtn").addEventListener("click", predictDiabetes);
}

function readPredictorField(name) {
  // Try element with data-field first (selects/inputs)
  const el = document.querySelector(`[data-field="${name}"]`) || document.querySelector(`[name="${name}"]`);
  if (el) {
    const tag = el.tagName;
    if (tag === "SELECT") {
      return el.value !== "" ? Number(el.value) : null;
    }
    if (tag === "INPUT") {
      // If this is a radio input, fall through to radio handling below to find checked value
      if (el.type && el.type.toLowerCase() === "radio") {
        // fallthrough
      } else {
        return el.value !== "" ? Number(el.value) : null;
      }
    }
  }
  // Radios: query by name
  const radios = document.getElementsByName(name);
  if (radios && radios.length) {
    for (const r of radios) if (r.checked) return Number(r.value);
  }
  return null;
}

async function predictDiabetes() {
  const resultEl = document.querySelector("#diabetesResult");
  resultEl.textContent = "";

  const features = {
    BMI: readPredictorField("BMI"),
    HighBP: readPredictorField("HighBP"),
    HighChol: readPredictorField("HighChol"),
    GenHlth: readPredictorField("GenHlth"),
    PhysHlth: readPredictorField("PhysHlth"),
    Age: readPredictorField("Age"),
    DiffWalk: readPredictorField("DiffWalk"),
    Smoker: readPredictorField("Smoker"),
  };

  // Basic validation
  for (const [k, v] of Object.entries(features)) {
    if (v === null || v === undefined || Number.isNaN(v)) {
      resultEl.textContent = `Please provide a valid value for ${k}`;
      return;
    }
  }

  resultEl.textContent = "Calculating...";

  try {
    // Try /predict on our API first; if network/error/non-2xx, fall back to external
    let resp;
    try {
      resp = await fetch(`${getConfig().apiBaseUrl}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ features }),
      });
      if (!resp.ok) {
        throw new Error(`Proxy predict failed (${resp.status})`);
      }
    } catch (_proxyErr) {
      resp = await fetch(DIABETES_MODEL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ features }),
      });
    }

    const json = await resp.json().catch(() => ({}));
    // Try common response formats
    let pct = null;
    if (json?.probability !== undefined) pct = json.probability;
    else if (json?.probabilities && Array.isArray(json.probabilities)) pct = json.probabilities[1] ?? json.probabilities[0];
    else if (json?.score !== undefined) pct = json.score;
    else if (json?.prediction !== undefined) {
      // prediction maybe 0/1; if so present as 0%/100%
      pct = Number(json.prediction) * 100;
    }

    if (pct !== null && pct !== undefined) {
      // If value is between 0 and 1, convert to percentage
      if (pct > 0 && pct <= 1) pct = pct * 100;
      const pctNum = Number(pct);
      // Classify and craft interactive message
      let mood = "low";
      if (pctNum >= 50) mood = "high";
      else if (pctNum >= 20) mood = "moderate";

      // Build a small progress bar and message
      const barOuter = document.createElement("div");
      barOuter.style.height = "10px";
      barOuter.style.borderRadius = "999px";
      barOuter.style.background = "#e5e7eb";
      barOuter.style.overflow = "hidden";

      const barInner = document.createElement("div");
      barInner.style.height = "100%";
      barInner.style.width = "0%";
      barInner.style.transition = "width 500ms ease";
      barInner.style.background = mood === "high" ? "#ef4444" : mood === "moderate" ? "#f59e0b" : "#10b981";
      barOuter.appendChild(barInner);

      const lead = document.createElement("div");
      lead.style.marginTop = "8px";
      lead.textContent = `Estimated diabetes probability: ${pctNum.toFixed(1)}%`;

      const hint = document.createElement("div");
      hint.className = "helper-text";
      hint.style.marginTop = "4px";
      if (mood === "low") hint.textContent = "Great news! Keep up a balanced diet and regular activity.";
      else if (mood === "moderate") hint.textContent = "Consider a check-up. Small lifestyle tweaks can make a big difference.";
      else hint.textContent = "We recommend consulting a clinician for personalized guidance.";

      resultEl.innerHTML = "";
      resultEl.appendChild(barOuter);
      resultEl.appendChild(lead);
      resultEl.appendChild(hint);
      // Animate bar after append
      requestAnimationFrame(() => {
        barInner.style.width = `${Math.max(1, Math.min(100, pctNum))}%`;
      });
      
      // Auto-scroll to result after animation
      setTimeout(() => {
        if (resultEl) {
          resultEl.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 600);
    } else {
      // Unknown format — show raw JSON
      resultEl.textContent = `Model response: ${JSON.stringify(json)}`;
    }
  } catch (err) {
    console.error("Diabetes model call failed", err);
    // If the fetch failed due to CORS or network, provide a local demo predictor fallback
    const isNetwork = err instanceof TypeError || (err && err.message && err.message.toLowerCase().includes("failed to fetch"));
    if (isNetwork) {
      // compute a simple heuristic demo prediction so users can continue testing locally
      const demoPct = demoPredict(features);
      resultEl.textContent = `Model call failed (CORS/network). Demo prediction: ${demoPct.toFixed(1)}%`;
      console.info("Demo predictor used", { features, demoPct });
    } else {
      resultEl.textContent = `Prediction failed: ${err.message || err}`;
    }
  }
}

function demoPredict(features) {
  // Heuristic: base from BMI, plus flags
  const bmi = Number(features.BMI) || 0;
  let score = 0;
  // BMI contribution (above 22 increases risk)
  score += Math.max(0, (bmi - 22)) * 1.8;
  // HighBP, HighChol, DiffWalk, Smoker add fixed points
  score += features.HighBP ? 14 : 0;
  score += features.HighChol ? 10 : 0;
  score += features.DiffWalk ? 10 : 0;
  score += features.Smoker ? 8 : 0;
  // GenHlth: 5 is best (lowers risk), 1 is worst
  score += (5 - Number(features.GenHlth || 3)) * 3.5;
  // PhysHlth: more bad days increases risk slightly
  score += Math.max(0, Number(features.PhysHlth || 0)) * 0.4;
  // Age code: older groups add risk (simple mapping)
  score += (Number(features.Age) || 1) * 1.2;
  // Normalize to percentage and clamp
  let pct = Math.min(95, Math.max(1, score));
  return pct;
}

async function bookAppointment(doctor, slotISO, button) {
  if (!slotISO) {
    showToast("Select an available slot", "error");
    return;
  }
  const vitals = collectVitals();
  if (!vitals) {
    showToast("Complete the vitals form before booking", "error");
    return;
  }
  const payload = {
    doctorId: doctor.userId,
    slotISO,
    vitals,
    // Provide a default reason code for backend compatibility
    reasonCode: "GENERAL",
  };
  try {
    // Log payload for debugging server-side issues
    console.info("Creating appointment payload", payload);
    console.info("Slot ISO format:", slotISO, "Type:", typeof slotISO);
    console.info("Doctor object:", doctor);
    console.info("Available slots from doctor:", doctor.doctorProfile?.availSlots?.slice(0, 3));
    
    await disableWhilePending(
      button,
      fetchJSON("/appointments", {
        method: "POST",
        body: JSON.stringify(payload),
      })
    );
    showToast("Appointment requested", "success");
    clearCachedVitals();  // Clear after successful booking
    await Promise.all([loadAppointments(), loadLatestVitals()]);
    
    // Auto-scroll to appointments section after data loads
    setTimeout(() => {
      const heading = document.querySelector("#appointmentsHeading");
      if (heading) {
        heading.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 400);
  } catch (error) {
    console.error("Appointment creation failed", error);
    // If fetchJSON attached status/body, show more helpful message
    if (error?.status) {
      console.error("Server response body:", error.body);
      // Show a short preview and log full body
      const preview = typeof error.body === "object" ? JSON.stringify(error.body).slice(0, 200) : String(error.body);
      showToast(`${error.message} (${error.status}) - ${preview}`, "error");
    } else {
      showToast(error.message || "Unable to book appointment", "error");
    }
  }
}

function renderAppointmentItem(appointment) {
  const item = document.createElement("article");
  item.className = "list-card";
  item.setAttribute("role", "listitem");
  const doctorName = appointment.doctorName || appointment.doctorId || "Doctor";
  item.innerHTML = `
    <div class="list-card-header">
      <h3>${doctorName}</h3>
      ${statusBadge(appointment.status)}
    </div>
    <p class="helper-text">${formatDateTime(appointment.slotISO)}</p>
  `;
  if (["PENDING", "CONFIRMED"].includes(appointment.status)) {
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "secondary";
    cancelBtn.textContent = "Cancel appointment";
    cancelBtn.addEventListener("click", () => cancelAppointment(appointment, cancelBtn));
    item.appendChild(cancelBtn);
  }
  return item;
}

function renderAppointments(list) {
  const container = document.querySelector("#appointmentsList");
  container.innerHTML = "";
  if (!list.length) {
    const empty = document.createElement("p");
    empty.className = "helper-text";
    empty.textContent = "You have not booked any appointments yet.";
    container.appendChild(empty);
    return;
  }
  list.forEach((appointment) => container.appendChild(renderAppointmentItem(appointment)));
}

async function loadAppointments() {
  try {
    console.info("Loading patient appointments...");
    const response = await fetchJSON("/appointments/patient");
    console.info("Appointments response:", response);
    const items = response.items || [];
    state.appointments = items
      .slice()
      .sort((a, b) => new Date(b.createdAt || b.slotISO).getTime() - new Date(a.createdAt || a.slotISO).getTime());
    console.info(`Loaded ${state.appointments.length} appointments`);
    renderAppointments(state.appointments);
  } catch (error) {
    console.error("Failed to load appointments", error);
    showToast(error.message || "Unable to load appointments", "error");
  }
}

async function cancelAppointment(appointment, button) {
  try {
    await disableWhilePending(
      button,
      fetchJSON(`/appointments/${appointment.appointmentId}/cancel`, { method: "POST" })
    );
    showToast("Appointment cancelled", "success");
    await loadAppointments();
  } catch (error) {
    console.error("Cancellation failed", error);
    showToast(error.message || "Unable to cancel appointment", "error");
  }
}

function renderMetrics(metrics) {
  const container = document.querySelector("#healthIndexPanel");
  container.innerHTML = "";
  if (!metrics) {
    const empty = document.createElement("p");
    empty.className = "helper-text";
    empty.textContent = "No vitals captured yet.";
    container.appendChild(empty);
    return;
  }
  Object.entries(metrics).forEach(([key, value]) => {
    const row = document.createElement("div");
    row.className = "metric";
    row.innerHTML = `<span class="metric-label">${key}</span><span class="metric-value">${value}</span>`;
    container.appendChild(row);
  });
}

async function loadLatestVitals() {
  const session = getSession();
  if (!session?.email) {
    console.warn("No session email found, skipping vitals load");
    return;
  }
  try {
    console.info("Loading latest vitals for:", session.email);
    const data = await fetchJSON(`/patient-health/${encodeURIComponent(session.email)}/latest`);
    console.info("Vitals response:", data);
    state.latestMetrics = data.item?.metrics || null;
    renderMetrics(state.latestMetrics);
    if (state.latestMetrics) {
      console.info("Rendered vitals:", state.latestMetrics);
    } else {
      console.info("No vitals data available");
    }
  } catch (error) {
    console.error("Failed to load latest vitals", error);
    renderMetrics(null);
  }
}

function attachDemoSeeder() {
  const button = document.querySelector("#demoDataBtn");
  if (!button) {
    console.info("Demo seeder button not found in HTML, skipping");
    return;
  }
  button.hidden = false;
  button.addEventListener("click", async () => {
    try {
      const response = await fetch("./assets/demo-data/doctors.json", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Failed to read demo data (${response.status})`);
      }
      const doctors = await response.json();
      await fetchJSON("/admin/seed/doctors", {
        method: "POST",
        body: JSON.stringify({ doctors }),
      });
      showToast("Demo doctors seeded", "success");
    } catch (error) {
      console.error("Demo seed failed", error);
      showToast("Seed endpoint unavailable. Use CLI instructions in the README.", "error");
    }
  });
}

async function init() {
  try {
    console.info("Patient portal initializing...");
    await loadConfig();
    
    if (!requireRole(["PATIENT"])) {
      console.warn("Not authorized as PATIENT or not signed in");
      window.debugApp.initError = "Not authorized or not signed in";
      return;
    }

    const session = getSession();
    const name = [session.given_name, session.family_name].filter(Boolean).join(" ") || "Patient";
    document.querySelector("#userName").textContent = name;
    document.querySelector("#userEmail").textContent = session.email;
    bindSignOut(document.querySelector("#signOutBtn"));

    // Populate the mandatory vitals and selection lists for the simplified flow.
    populateMandatoryVitals();
    loadCachedVitals();  // Load previously entered vitals
  populateDiabetesPredictor();
  populateSpecialties();
  populateFilters();

  // Search doctors when the user clicks the Find Doctors button
  document.querySelector("#findDoctorsBtn").addEventListener("click", searchDoctors);

  // Expose the demo seeder button without requiring a query parameter
  attachDemoSeeder();
  
  // Add enhanced debug helper to window for troubleshooting
  Object.assign(window.debugApp, {
    isInitialized: true,
    getLastDoctors: () => state.doctors,
    getConfig: getConfig,
    getSession: getSession,
    getAppointments: () => state.appointments,
    getLatestMetrics: () => state.latestMetrics,
    reloadData: async () => {
      console.log("Reloading appointments and vitals...");
      await Promise.all([loadAppointments(), loadLatestVitals()]);
      console.log("Reload complete");
    },
    checkSlots: () => {
      if (!state.doctors.length) {
        console.log("No doctors loaded. Click 'Find doctors' first.");
        return;
      }
      state.doctors.forEach((doc) => {
        const slots = doc.doctorProfile?.availSlots || [];
        console.log(`${doc.firstName} ${doc.lastName} (${doc.userId}): ${slots.length} slots`);
        if (slots.length > 0) console.log(`  First 3 slots: ${slots.slice(0, 3).join(", ")}`);
      });
    },
  });
  
  console.info("Patient portal initialized. Loading initial data...");
  await Promise.all([loadAppointments(), loadLatestVitals()]);
  console.info("Initial data load complete");
  } catch (error) {
    console.error("Failed to initialize patient portal:", error);
    window.debugApp.initError = error.message;
    showToast("Failed to initialize portal. Please sign in again.", "error");
  }
}

window.addEventListener("DOMContentLoaded", init);
