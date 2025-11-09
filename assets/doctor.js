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

const PROBLEM_LABELS = {
  CARDIAC: "Cardiac symptoms",
  DERM: "Dermatological issue",
  RESP: "Respiratory issue",
  GI: "Gastrointestinal issue",
  MSK: "Musculoskeletal",
  NEURO: "Neurological",
  GENERAL: "General checkup",
};

function reasonLabel(reasonCode) {
  return PROBLEM_LABELS[reasonCode] || reasonCode;
}

function updateLastUpdated() {
  const label = document.querySelector("#lastUpdated");
  label.textContent = `Updated ${new Date().toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;
}

function describeAppointment(appointment) {
  const parts = [
    formatDateTime(appointment.slotISO),
    reasonLabel(appointment.reasonCode),
  ];
  return parts.join(" • ");
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
    const empty = document.createElement("p");
    empty.className = "helper-text";
    empty.textContent = "Select an appointment to view vitals.";
    panel.appendChild(empty);
    return;
  }
  Object.entries(metrics).forEach(([key, value]) => {
    const row = document.createElement("div");
    row.className = "metric";
    row.innerHTML = `<span class="metric-label">${key}</span><span class="metric-value">${value}</span>`;
    panel.appendChild(row);
  });
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
  document.querySelector("#userEmail").textContent = session.email;
  bindSignOut(document.querySelector("#signOutBtn"));
  setupTabs();
  renderMetrics(null);

  await loadDoctorData();
  startPolling();
}

window.addEventListener("DOMContentLoaded", init);
