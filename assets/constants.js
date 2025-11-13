export const SPECIALTIES = [
  "Cardiology",
  "Dermatology",
  "General Medicine",
  "Pulmonology",
  "Gastroenterology",
  "Orthopedics",
  "Neurology",
  "Pediatrics",
  "Ophthalmology",
  "ENT",
];

// Language options are disabled in the simplified application.
export const LANGUAGE_OPTIONS = [];

export const LOCATION_OPTIONS = ["Paris", "Lyon", "Marseille", "Toulouse", "Nice", "Virtual"];

export const MANDATORY_VITALS = [
  {
    name: "heightCm",
    label: "Height (cm)",
    type: "number",
    min: 100,
    max: 220,
    step: 1,
    required: true,
  },
  {
    name: "weightKg",
    label: "Weight (kg)",
    type: "number",
    min: 30,
    max: 250,
    step: 0.1,
    required: true,
  },
  {
    name: "temperatureC",
    label: "Temperature (°C)",
    type: "number",
    min: 34,
    max: 42,
    step: 0.1,
    required: true,
  },
];

const YES_NO_OPTIONS = [
  { value: "YES", label: "Yes" },
  { value: "NO", label: "No" },
];

const PAIN_SCALE_OPTIONS = Array.from({ length: 11 }).map((_, index) => ({
  value: String(index),
  label: String(index),
}));

const AFFECTED_AREAS = [
  { value: "KNEE", label: "Knee" },
  { value: "SHOULDER", label: "Shoulder" },
  { value: "BACK", label: "Back" },
  { value: "HIP", label: "Hip" },
  { value: "NECK", label: "Neck" },
];

const RASH_AREAS = [
  { value: "FACE", label: "Face" },
  { value: "TORSO", label: "Torso" },
  { value: "ARMS", label: "Arms" },
  { value: "LEGS", label: "Legs" },
];

// Problem options have been removed from the simplified application. Use an empty array to
// preserve API compatibility without exposing problem-based flows.
export const PROBLEM_OPTIONS = [];

// Since no problem options exist, the lookup is an empty object.
export const PROBLEM_LOOKUP = {};

export const DEFAULT_SLOT_INTERVAL_MINUTES = 30;

export function generateDoctorSlots(days = 3, intervalMinutes = DEFAULT_SLOT_INTERVAL_MINUTES) {
  const start = new Date();
  const slots = [];
  const msPerMinute = 60 * 1000;
  for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
    const current = new Date(start.getTime());
    current.setDate(start.getDate() + dayOffset);
    const weekday = current.getDay();
    if (weekday === 0 || weekday === 6) {
      continue;
    }
    for (let hour = 9; hour < 17; hour += 1) {
      for (let minute = 0; minute < 60; minute += intervalMinutes) {
        const slot = new Date(Date.UTC(
          current.getUTCFullYear(),
          current.getUTCMonth(),
          current.getUTCDate(),
          hour,
          minute,
          0,
          0,
        ));
        slots.push(slot.toISOString());
      }
    }
  }
  return slots;
}

// Only a single generic reason code is required for the simplified booking flow.
export const ALLOWED_REASON_CODES = ["GENERAL"];
