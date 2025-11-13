import {
  bindSignOut,
  disableWhilePending,
  fetchJSON,
  formatDateTime,
  getSession,
  loadConfig,
  requireRole,
  showToast,
  statusBadge,
} from "./app.js";

const state = {
  pending: [],
  confirmed: [],
  selected: null,
  pollHandle: null,
};

// Reason codes have been removed from the simplified application.  The
// appointment card only displays the slot time.

function updateLastUpdated() {
  const label = document.querySelector("#lastUpdated");
  label.textContent = `Updated ${new Date().toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;
}

function describeAppointment(appointment) {
  // Only display the date and time of the appointment.  We no longer show a
  // reason code because patients do not specify problems in the simplified flow.
  return formatDateTime(appointment.slotISO);
}

function renderActionButtons(appointment) {
  const wrapper = document.createElement("div");
  wrapper.className = "doctor-actions";

  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.textContent = "Confirm";
  confirmBtn.addEventListener("click", () => handleDecision(appointment, "confirm", confirmBtn));
  wrapper.appendChild(confirmBtn);

  const declineBtn = document.createElement("button");
  declineBtn.type = "button";
  declineBtn.className = "secondary";
  declineBtn.textContent = "Decline";
  declineBtn.addEventListener("click", () => handleDecision(appointment, "decline", declineBtn));
  wrapper.appendChild(declineBtn);

  return wrapper;
}

function renderAppointmentCard(appointment, includeActions = false) {
  const card = document.createElement("article");
  card.className = "list-card";
  card.setAttribute("role", "listitem");
  card.tabIndex = 0;

  const header = document.createElement("div");
  header.className = "list-card-header";
  header.innerHTML = `
    <h3>${appointment.patientEmail || appointment.patientId}</h3>
    ${statusBadge(appointment.status)}
  `;
  card.appendChild(header);

  const details = document.createElement("p");
  details.className = "helper-text";
  details.textContent = describeAppointment(appointment);
  card.appendChild(details);

  const actions = document.createElement("div");
  actions.className = "doctor-actions";
  const viewBtn = document.createElement("button");
  viewBtn.type = "button";
  viewBtn.className = "secondary";
  viewBtn.textContent = "View vitals";
  viewBtn.addEventListener("click", () => loadPatientSummary(appointment));
  actions.appendChild(viewBtn);
  card.appendChild(actions);

  if (includeActions) {
    card.appendChild(renderActionButtons(appointment));
  }

  card.addEventListener("click", () => loadPatientSummary(appointment));
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      loadPatientSummary(appointment);
    }
  });

  return card;
}

function renderAppointmentList(containerSelector, items, includeActions = false) {
  const container = document.querySelector(containerSelector);
  container.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "helper-text";
    empty.textContent = "No appointments in this view.";
    container.appendChild(empty);
    return;
  }
  items.forEach((item) => container.appendChild(renderAppointmentCard(item, includeActions)));
}

async function handleDecision(appointment, action, button) {
  const path = action === "confirm" ? "confirm" : "decline";
  try {
    await disableWhilePending(
      button,
      fetchJSON(`/appointments/${appointment.appointmentId}/${path}`, { method: "POST" })
    );
    showToast(`Appointment ${action}ed`, "success");
    await loadDoctorData();
  } catch (error) {
    console.error(`Failed to ${action} appointment`, error);
    showToast(error.message || `Unable to ${action} appointment`, "error");
  }
}

function renderMetrics(metrics) {
  const panel = document.querySelector("#healthSummary");
  panel.innerHTML = "";
  
  if (!metrics) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Select an appointment to view patient vitals.";
    panel.appendChild(empty);
    return;
  }
  
  // Create a professional vitals grid
  const grid = document.createElement("div");
  grid.className = "vitals-grid";
  
  // Define vital labels and units for better display
  const vitalLabels = {
    heightCm: { label: "Height", unit: "cm" },
    weightKg: { label: "Weight", unit: "kg" },
    temperatureC: { label: "Temperature", unit: "°C" },
    bmi: { label: "BMI", unit: "" },
    bloodPressureSystolic: { label: "BP Systolic", unit: "mmHg" },
    bloodPressureDiastolic: { label: "BP Diastolic", unit: "mmHg" },
    heartRate: { label: "Heart Rate", unit: "bpm" },
    respiratoryRate: { label: "Respiratory Rate", unit: "/min" },
    oxygenSaturation: { label: "O₂ Saturation", unit: "%" },
    glucoseLevel: { label: "Glucose", unit: "mg/dL" },
  };
  
  Object.entries(metrics).forEach(([key, value]) => {
    const vitalInfo = vitalLabels[key] || { label: key, unit: "" };
    
    const card = document.createElement("div");
    card.className = "vital-card";
    
    const label = document.createElement("div");
    label.className = "vital-card-label";
    label.textContent = vitalInfo.label;
    
    const valueContainer = document.createElement("div");
    valueContainer.style.display = "flex";
    valueContainer.style.alignItems = "baseline";
    valueContainer.style.gap = "4px";
    
    const valueSpan = document.createElement("span");
    valueSpan.className = "vital-card-value";
    valueSpan.textContent = typeof value === 'number' ? value.toFixed(1) : value;
    
    const unitSpan = document.createElement("span");
    unitSpan.className = "vital-card-unit";
    unitSpan.textContent = vitalInfo.unit;
    
    valueContainer.appendChild(valueSpan);
    if (vitalInfo.unit) {
      valueContainer.appendChild(unitSpan);
    }
    
    card.appendChild(label);
    card.appendChild(valueContainer);
    grid.appendChild(card);
  });
  
  panel.appendChild(grid);
}

async function loadPatientSummary(appointment) {
  state.selected = appointment;
  try {
    const response = await fetchJSON(
      `/patient-health/${appointment.patientId}/latest?appointmentId=${appointment.appointmentId}`
    );
    const metrics = response.item?.metrics || response.item?.summary || null;
    renderMetrics(metrics);
  } catch (error) {
    console.error("Failed to load patient summary", error);
    showToast(error.message || "Unable to load vitals", "error");
    renderMetrics(null);
  }
}

async function loadDoctorData() {
  try {
    const pendingResp = await fetchJSON("/appointments/doctor?status=PENDING");
    const confirmedResp = await fetchJSON("/appointments/doctor?status=CONFIRMED");
    state.pending = pendingResp.items || [];
    state.confirmed = confirmedResp.items || [];
    renderAppointmentList("#pendingRequests", state.pending, true);
    renderAppointmentList("#confirmedSchedule", state.confirmed, false);
    updateLastUpdated();
  } catch (error) {
    console.error("Failed to load doctor data", error);
    showToast(error.message || "Unable to load appointments", "error");
  }
}

function startPolling() {
  if (state.pollHandle) {
    clearInterval(state.pollHandle);
  }
  state.pollHandle = setInterval(loadDoctorData, 10000);
}

function setupTabs() {
  const tabPending = document.querySelector("#tabPending");
  const tabSchedule = document.querySelector("#tabSchedule");
  const panelPending = document.querySelector("#pendingPanel");
  const panelSchedule = document.querySelector("#schedulePanel");

  function activate(tab) {
    const showPending = tab === "pending";
    tabPending.classList.toggle("active", showPending);
    tabSchedule.classList.toggle("active", !showPending);
    tabPending.setAttribute("aria-selected", showPending ? "true" : "false");
    tabSchedule.setAttribute("aria-selected", showPending ? "false" : "true");
    panelPending.hidden = !showPending;
    panelSchedule.hidden = showPending;
  }

  tabPending.addEventListener("click", () => activate("pending"));
  tabSchedule.addEventListener("click", () => activate("schedule"));
}

async function init() {
  await loadConfig();
  if (!requireRole(["DOCTOR"])) return;

  const session = getSession();
  const name = [session.given_name, session.family_name].filter(Boolean).join(" ") || "Doctor";
  document.querySelector("#userName").textContent = name;
  document.querySelector("#userEmail").textContent = session.email;
  bindSignOut(document.querySelector("#signOutBtn"));
  setupTabs();
  renderMetrics(null);

  await loadDoctorData();
  startPolling();
}

window.addEventListener("DOMContentLoaded", init);
