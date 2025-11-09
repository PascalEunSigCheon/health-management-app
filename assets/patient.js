import {
  bindSignOut,
  disableWhilePending,
  fetchJSON,
  formatDateTime,
  getSession,
  loadConfig,
  normalizeLanguages,
  requireRole,
  showToast,
  statusBadge,
} from "./app.js";
import {
  LANGUAGE_OPTIONS,
  LOCATION_OPTIONS,
  MANDATORY_VITALS,
  PROBLEM_LOOKUP,
  PROBLEM_OPTIONS,
  SPECIALTIES,
  generateDoctorSlots,
} from "./constants.js";

const state = {
  problem: null,
  doctors: [],
  appointments: [],
  latestMetrics: null,
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

function populateProblemOptions() {
  const select = document.querySelector("#problemSelect");
  PROBLEM_OPTIONS.forEach((option) => {
    select.appendChild(new Option(option.label, option.value));
  });
}

function populateSpecialties() {
  const select = document.querySelector("#specialtySelect");
  select.innerHTML = "";
  select.appendChild(new Option("Select specialty", ""));
  SPECIALTIES.forEach((value) => {
    select.appendChild(new Option(value, value));
  });
}

function populateFilters() {
  const language = document.querySelector("#languageFilter");
  LANGUAGE_OPTIONS.forEach((value) => language.appendChild(new Option(value, value)));
  const location = document.querySelector("#locationFilter");
  LOCATION_OPTIONS.forEach((value) => location.appendChild(new Option(value, value)));
}

function renderProblemFields(problemValue) {
  const container = document.querySelector("#problemVitals");
  container.innerHTML = "";
  const badge = document.querySelector("#recommendedSpecialty");
  const select = document.querySelector("#specialtySelect");
  const meta = PROBLEM_LOOKUP[problemValue] || null;
  state.problem = meta;
  if (!meta) {
    badge.textContent = "";
    select.value = "";
    return;
  }
  badge.textContent = `Suggested specialty: ${meta.recommendedSpecialty}`;
  if (meta.recommendedSpecialty) {
    select.value = meta.recommendedSpecialty;
  }
  (meta.extraVitals || []).forEach((field) => renderField(container, field));
}

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

  if (state.problem) {
    (state.problem.extraVitals || []).forEach((field) => {
      const input = document.querySelector(`[data-field="${field.name}"]`);
      if (field.type === "select") {
        const value = input?.value || "";
        if (!value) {
          setError(field.name, "Select an option");
          valid = false;
          return;
        }
        payload[field.name] = value;
      } else {
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
      }
    });
  }

  return valid ? payload : null;
}

function gatherSearchFilters() {
  return {
    language: document.querySelector("#languageFilter").value,
    location: document.querySelector("#locationFilter").value,
    slotWindow: Number(document.querySelector("#slotWindow").value || "7"),
  };
}

function describeDoctor(doctor) {
  const profile = doctor.doctorProfile || {};
  const parts = [profile.city || "Unknown city"];
  const languages = normalizeLanguages(profile.languages || []);
  if (languages.length) {
    parts.push(languages.join(", "));
  }
  return parts.join(" • ");
}

function futureSlots(slots, days) {
  if (!Array.isArray(slots)) {
    return [];
  }
  const now = Date.now();
  const limit = now + days * 24 * 60 * 60 * 1000;
  return slots
    .map((slot) => new Date(slot))
    .filter((date) => !Number.isNaN(date.getTime()) && date.getTime() > now && date.getTime() <= limit)
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
  clearErrors();
  const problemValue = document.querySelector("#problemSelect").value;
  if (!problemValue) {
    setError("problem", "Select a problem");
    return;
  }
  const formSpecialty = document.querySelector("#specialtySelect");
  const selectedSpecialty = formSpecialty.value;
  if (!selectedSpecialty) {
    setError("specialty", "Select a specialty");
    return;
  }
  const filters = gatherSearchFilters();
  const params = new URLSearchParams();
  params.set("specialty", selectedSpecialty);
  if (filters.language) params.set("language", filters.language);
  if (filters.location) params.set("location", filters.location);

  try {
    const { items = [] } = await fetchJSON(`/doctors?${params.toString()}`);
    state.doctors = items;
    renderDoctors(items);
    if (!items.length) {
      showToast("No doctors found for the selected filters", "info");
    }
  } catch (error) {
    console.error("Doctor search failed", error);
    showToast(error.message || "Unable to load doctors", "error");
  }
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
  if (!state.problem) {
    showToast("Select a problem before booking", "error");
    return;
  }

  const payload = {
    doctorId: doctor.userId,
    slotISO,
    reasonCode: state.problem.value,
    recommendedSpecialty: document.querySelector("#specialtySelect").value,
    vitals,
  };

  try {
    await disableWhilePending(
      button,
      fetchJSON("/appointments", {
        method: "POST",
        body: JSON.stringify(payload),
      })
    );
    showToast("Appointment requested", "success");
    await Promise.all([loadAppointments(), loadLatestVitals()]);
  } catch (error) {
    console.error("Appointment creation failed", error);
    showToast(error.message || "Unable to book appointment", "error");
  }
}

function renderAppointmentItem(appointment) {
  const item = document.createElement("article");
  item.className = "list-card";
  item.setAttribute("role", "listitem");
  const problemLabel = PROBLEM_LOOKUP[appointment.reasonCode]?.label || appointment.reasonCode;
  item.innerHTML = `
    <div class="list-card-header">
      <h3>${formatDateTime(appointment.slotISO)}</h3>
      ${statusBadge(appointment.status)}
    </div>
    <p class="helper-text">Reason: ${problemLabel}</p>
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
    const { items = [] } = await fetchJSON("/appointments/patient");
    state.appointments = items
      .slice()
      .sort((a, b) => new Date(b.createdAt || b.slotISO).getTime() - new Date(a.createdAt || a.slotISO).getTime());
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
  if (!session?.sub) return;
  try {
    const data = await fetchJSON(`/patient-health/${session.sub}/latest`);
    state.latestMetrics = data.item?.metrics || null;
    renderMetrics(state.latestMetrics);
  } catch (error) {
    console.error("Failed to load latest vitals", error);
    renderMetrics(null);
  }
}

function attachDemoSeeder() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") !== "1") {
    return;
  }
  const button = document.querySelector("#demoDataBtn");
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
  await loadConfig();
  if (!requireRole(["PATIENT"])) return;

  const session = getSession();
  document.querySelector("#userEmail").textContent = session.email;
  bindSignOut(document.querySelector("#signOutBtn"));

  populateMandatoryVitals();
  populateProblemOptions();
  populateSpecialties();
  populateFilters();
  renderProblemFields(null);

  document.querySelector("#problemSelect").addEventListener("change", (event) => {
    renderProblemFields(event.target.value);
  });
  document.querySelector("#findDoctorsBtn").addEventListener("click", searchDoctors);

  attachDemoSeeder();
  await Promise.all([loadAppointments(), loadLatestVitals()]);
}

window.addEventListener("DOMContentLoaded", init);
