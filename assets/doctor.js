import {
  bindSignOut,
  disableWhilePending,
  fetchJSON,
  formatDateTime,
  getUserEmail,
  loadConfig,
  requireRole,
  showToast,
  statusBadge,
} from "./app.js";

let pollHandle = null;
let currentAppointmentId = null;

function splitAppointments(items) {
  const pending = [];
  const confirmed = [];
  (items || []).forEach((item) => {
    if (item.status === "PENDING") pending.push(item);
    if (item.status === "CONFIRMED") confirmed.push(item);
  });
  return { pending, confirmed };
}

function renderAppointmentCard(appointment, actions = []) {
  const element = document.createElement("article");
  element.className = "list-item";
  element.innerHTML = `
    <div class="list-item-header">
      <div>
        <div>${formatDateTime(appointment.slotISO)}</div>
        <div class="helper-text">Patient: ${appointment.patientId}</div>
      </div>
      ${statusBadge(appointment.status)}
    </div>
    ${appointment.reason ? `<div class="helper-text">Reason: ${appointment.reason}</div>` : ""}
    <div class="list-item-actions"></div>
  `;
  const actionsContainer = element.querySelector(".list-item-actions");
  actions.forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = action.label;
    button.className = action.className || "secondary";
    button.addEventListener("click", () => action.handler(appointment, button));
    actionsContainer.appendChild(button);
  });
  element.addEventListener("click", (event) => {
    if (event.target.closest("button")) {
      return;
    }
    showHealthSummary(appointment);
  });
  return element;
}

function renderPending(list) {
  const container = document.querySelector("#pendingRequests");
  container.innerHTML = "";
  if (!list.length) {
    container.innerHTML = '<div class="empty-state">No pending requests.</div>';
    return;
  }
  list.forEach((appointment) => {
    const card = renderAppointmentCard(appointment, [
      {
        label: "Confirm",
        className: "",
        handler: confirmAppointment,
      },
      {
        label: "Decline",
        className: "danger",
        handler: declineAppointment,
      },
    ]);
    container.appendChild(card);
  });
}

function renderSchedule(list) {
  const container = document.querySelector("#confirmedSchedule");
  container.innerHTML = "";
  if (!list.length) {
    container.innerHTML = '<div class="empty-state">No confirmed appointments yet.</div>';
    return;
  }
  list.forEach((appointment) => {
    const card = renderAppointmentCard(appointment);
    container.appendChild(card);
  });
}

async function confirmAppointment(appointment, button) {
  try {
    await disableWhilePending(
      button,
      fetchJSON(`/appointments/${appointment.appointmentId}/confirm`, {
        method: "POST",
        body: JSON.stringify({}),
      })
    );
    showToast("Appointment confirmed", "success");
    await loadAppointments();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Unable to confirm", "error");
  }
}

async function declineAppointment(appointment, button) {
  try {
    await disableWhilePending(
      button,
      fetchJSON(`/appointments/${appointment.appointmentId}/decline`, {
        method: "POST",
        body: JSON.stringify({}),
      })
    );
    showToast("Appointment declined", "success");
    await loadAppointments();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Unable to decline", "error");
  }
}

async function showHealthSummary(appointment) {
  currentAppointmentId = appointment.appointmentId;
  const panel = document.querySelector("#healthSummary");
  panel.innerHTML = '<div class="helper-text">Loading health summary…</div>';
  try {
    const data = await fetchJSON(`/patient/${appointment.patientId}/health/summary?appointmentId=${appointment.appointmentId}`, {
      method: "GET",
    });
    renderHealthSummary(data.items || []);
  } catch (error) {
    console.error(error);
    panel.innerHTML = `<div class="error-text">${error.message || "Unable to load health summary"}</div>`;
  }
}

function renderHealthSummary(items) {
  const panel = document.querySelector("#healthSummary");
  panel.innerHTML = "";
  if (!items.length) {
    panel.innerHTML = '<div class="empty-state">No health data found for this patient.</div>';
    return;
  }
  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "list-item";
    card.innerHTML = `
      <div class="list-item-header">
        <div>Record ${item.recordId || ""}</div>
        <div class="helper-text">Updated ${item.updatedAt ? new Date(item.updatedAt).toLocaleString() : ""}</div>
      </div>
      <pre class="helper-text" style="white-space: pre-wrap;">${escapeHtml(JSON.stringify(item.payload || item, null, 2))}</pre>
    `;
    panel.appendChild(card);
  });
}

function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}

async function loadAppointments() {
  const pendingContainer = document.querySelector("#pendingRequests");
  pendingContainer.innerHTML = '<div class="helper-text">Refreshing…</div>';
  try {
    const { items = [] } = await fetchJSON("/appointments/doctor", { method: "GET" });
    const { pending, confirmed } = splitAppointments(items);
    renderPending(pending);
    renderSchedule(confirmed);
    if (currentAppointmentId) {
      const current = items.find((item) => item.appointmentId === currentAppointmentId);
      if (current) {
        await showHealthSummary(current);
      }
    }
  } catch (error) {
    console.error(error);
    pendingContainer.innerHTML = `<div class="error-text">${error.message || "Unable to load appointments"}</div>`;
  }
}

function startPolling() {
  if (pollHandle) {
    clearInterval(pollHandle);
  }
  pollHandle = setInterval(loadAppointments, 10000);
}

async function initDoctorPage() {
  await loadConfig();
  if (!requireRole(["DOCTOR"])) return;
  document.querySelector("#userEmail").textContent = getUserEmail();
  bindSignOut(document.querySelector("#signOutBtn"));
  await loadAppointments();
  startPolling();
}

window.addEventListener("DOMContentLoaded", initDoctorPage);
