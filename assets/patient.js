import {
  bindSignOut,
  disableWhilePending,
  fetchJSON,
  formatDateTime,
  getConfig,
  getUserEmail,
  loadConfig,
  requireRole,
  showToast,
  statusBadge,
} from "./app.js";

let currentDoctor = null;

function toFilterObject(form) {
  const params = new URLSearchParams(new FormData(form));
  const filters = {};
  params.forEach((value, key) => {
    if (value) filters[key] = value;
  });
  return { filters, queryString: params.toString() };
}

function combineDateTime(dateValue, timeValue) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return date.toISOString();
}

function renderDoctors(doctors, suggested = new Set()) {
  const list = document.querySelector("#doctorResults");
  list.innerHTML = "";
  if (!doctors.length) {
    list.innerHTML = '<div class="empty-state">No doctors found. Adjust your filters.</div>';
    return;
  }
  doctors.forEach((doctor) => {
    const languages = Array.isArray(doctor.languages)
      ? doctor.languages.join(", ")
      : doctor.languages || "N/A";
    const item = document.createElement("article");
    item.className = "list-item";
    item.innerHTML = `
      <div class="list-item-header">
        <h3>${doctor.firstName || ""} ${doctor.lastName || ""}</h3>
        <div class="badge-row">
          <span class="badge">${doctor.specialty || "General"}</span>
          ${suggested.has(doctor.userId) ? '<span class="badge success">Suggested</span>' : ""}
        </div>
      </div>
      <div class="text-muted">${doctor.location || "Remote"}</div>
      <div class="helper-text">Languages: ${languages}</div>
      <div>
        <button type="button" class="book-btn">Book appointment</button>
      </div>
    `;
    item.querySelector(".book-btn").addEventListener("click", () => openBookingModal(doctor));
    list.appendChild(item);
  });
}

function renderAppointments(appointments) {
  const list = document.querySelector("#appointmentsList");
  list.innerHTML = "";
  if (!appointments.length) {
    list.innerHTML = '<div class="empty-state">No appointments yet.</div>';
    return;
  }
  appointments.forEach((appointment) => {
    const item = document.createElement("article");
    item.className = "list-item";
    item.innerHTML = `
      <div class="list-item-header">
        <div>
          <div>${formatDateTime(appointment.slotISO)}</div>
          <div class="helper-text">Doctor: ${appointment.doctorId}</div>
        </div>
        ${statusBadge(appointment.status)}
      </div>
      ${appointment.reason ? `<div class="helper-text">Reason: ${appointment.reason}</div>` : ""}
      <div class="list-item-actions"></div>
    `;
    const actions = item.querySelector(".list-item-actions");
    if (["PENDING", "CONFIRMED"].includes(appointment.status)) {
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "secondary";
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("click", () => cancelAppointment(appointment.appointmentId, cancelBtn));
      actions.appendChild(cancelBtn);
    }
    list.appendChild(item);
  });
}

async function cancelAppointment(appointmentId, button) {
  try {
    await disableWhilePending(
      button,
      fetchJSON(`/appointments/${appointmentId}/cancel`, { method: "POST", body: JSON.stringify({}) })
    );
    showToast("Appointment cancelled", "success");
    await loadAppointments();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Unable to cancel", "error");
  }
}

async function loadAppointments() {
  const container = document.querySelector("#appointmentsList");
  container.innerHTML = '<div class="helper-text">Loading appointments…</div>';
  try {
    const { items } = await fetchJSON("/appointments/patient", { method: "GET" });
    renderAppointments(items || []);
  } catch (error) {
    console.error(error);
    container.innerHTML = `<div class="error-text">${error.message || "Unable to load appointments"}</div>`;
  }
}

async function fetchRecommendations(filters) {
  try {
    const config = getConfig();
    if (!config.doctorMatchEndpoint) {
      return [];
    }
    const response = await fetch(config.doctorMatchEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(filters),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    return payload.recommendations || [];
  } catch (error) {
    console.warn("Doctor recommendations unavailable", error);
    return [];
  }
}

async function loadDoctors(form) {
  const { filters, queryString } = toFilterObject(form);
  const container = document.querySelector("#doctorResults");
  container.innerHTML = '<div class="helper-text">Searching…</div>';
  try {
    const { items = [] } = await fetchJSON(`/doctors${queryString ? `?${queryString}` : ""}`, { method: "GET" });
    const recommended = await fetchRecommendations(filters);
    const suggestedSet = new Set((recommended || []).map((item) => item.userId));
    const merged = [...items];
    (recommended || []).forEach((rec) => {
      if (!merged.some((doc) => doc.userId === rec.userId)) {
        merged.unshift(rec);
      }
    });
    renderDoctors(merged, suggestedSet);
  } catch (error) {
    console.error(error);
    container.innerHTML = `<div class="error-text">${error.message || "Unable to load doctors"}</div>`;
  }
}

function openBookingModal(doctor) {
  currentDoctor = doctor;
  const modal = document.querySelector("#bookingModal");
  const overlay = document.querySelector("#modalOverlay");
  modal.querySelector("#selectedDoctor").textContent = `${doctor.firstName || ""} ${doctor.lastName || ""}`;
  overlay.classList.add("active");
  modal.querySelector("input[name='appointmentDate']").focus();
}

function closeModal() {
  const overlay = document.querySelector("#modalOverlay");
  overlay.classList.remove("active");
  currentDoctor = null;
}

async function handleBookSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitBtn = form.querySelector("button[type='submit']");
  if (!currentDoctor) {
    showToast("Select a doctor first", "error");
    return;
  }
  const date = form.appointmentDate.value;
  const time = form.appointmentTime.value;
  if (!date || !time) {
    showToast("Choose date and time", "error");
    return;
  }
  const reason = form.reason.value.trim();
  const slotISO = combineDateTime(date, time);

  try {
    await disableWhilePending(
      submitBtn,
      fetchJSON("/appointments", {
        method: "POST",
        body: JSON.stringify({
          doctorId: currentDoctor.userId,
          slotISO,
          reason: reason || undefined,
        }),
      })
    );
    showToast("Appointment requested", "success");
    closeModal();
    form.reset();
    await loadAppointments();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Booking failed", "error");
  }
}

function initModal() {
  const overlay = document.querySelector("#modalOverlay");
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeModal();
    }
  });
  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", closeModal);
  });
  document.querySelector("#bookingForm").addEventListener("submit", handleBookSubmit);
}

function initFilters() {
  const form = document.querySelector("#doctorSearchForm");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    loadDoctors(form);
  });
}

async function initPatientPage() {
  await loadConfig();
  if (!requireRole(["PATIENT"])) return;

  document.querySelector("#userEmail").textContent = getUserEmail();
  bindSignOut(document.querySelector("#signOutBtn"));
  initFilters();
  initModal();
  loadDoctors(document.querySelector("#doctorSearchForm"));
  loadAppointments();
}

window.addEventListener("DOMContentLoaded", initPatientPage);
