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

export const LANGUAGE_OPTIONS = ["English", "French", "German", "Spanish", "Italian"];

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

export const PROBLEM_OPTIONS = [
  {
    value: "CARDIAC",
    label: "Cardiac symptoms",
    recommendedSpecialty: "Cardiology",
    extraVitals: [
      {
        name: "restingHeartRate",
        label: "Resting heart rate (bpm)",
        type: "number",
        min: 40,
        max: 180,
        step: 1,
        required: true,
      },
      {
        name: "bloodPressureSystolic",
        label: "Blood pressure systolic",
        type: "number",
        min: 80,
        max: 220,
        step: 1,
        required: true,
      },
      {
        name: "bloodPressureDiastolic",
        label: "Blood pressure diastolic",
        type: "number",
        min: 40,
        max: 140,
        step: 1,
        required: true,
      },
      {
        name: "totalCholesterol",
        label: "Total cholesterol (mg/dL)",
        type: "number",
        min: 100,
        max: 400,
        step: 1,
        required: true,
      },
    ],
  },
  {
    value: "DERM",
    label: "Dermatological issue",
    recommendedSpecialty: "Dermatology",
    extraVitals: [
      {
        name: "rashArea",
        label: "Rash area",
        type: "select",
        options: RASH_AREAS,
        required: true,
      },
      {
        name: "itchSeverity",
        label: "Itch severity (0-10)",
        type: "select",
        options: PAIN_SCALE_OPTIONS,
        required: true,
      },
    ],
  },
  {
    value: "RESP",
    label: "Respiratory issue",
    recommendedSpecialty: "Pulmonology",
    extraVitals: [
      {
        name: "spo2",
        label: "O₂ saturation (%)",
        type: "number",
        min: 80,
        max: 100,
        step: 1,
        required: true,
      },
      {
        name: "respiratoryRate",
        label: "Respiratory rate (bpm)",
        type: "number",
        min: 8,
        max: 40,
        step: 1,
        required: true,
      },
    ],
  },
  {
    value: "GI",
    label: "Gastrointestinal issue",
    recommendedSpecialty: "Gastroenterology",
    extraVitals: [
      {
        name: "painSeverity",
        label: "Pain severity (0-10)",
        type: "select",
        options: PAIN_SCALE_OPTIONS,
        required: true,
      },
      {
        name: "nausea",
        label: "Nausea",
        type: "select",
        options: YES_NO_OPTIONS,
        required: true,
      },
    ],
  },
  {
    value: "MSK",
    label: "Musculoskeletal",
    recommendedSpecialty: "Orthopedics",
    extraVitals: [
      {
        name: "painSeverity",
        label: "Pain severity (0-10)",
        type: "select",
        options: PAIN_SCALE_OPTIONS,
        required: true,
      },
      {
        name: "affectedArea",
        label: "Affected area",
        type: "select",
        options: AFFECTED_AREAS,
        required: true,
      },
    ],
  },
  {
    value: "NEURO",
    label: "Neurological",
    recommendedSpecialty: "Neurology",
    extraVitals: [
      {
        name: "headacheSeverity",
        label: "Headache severity (0-10)",
        type: "select",
        options: PAIN_SCALE_OPTIONS,
        required: true,
      },
      {
        name: "dizziness",
        label: "Dizziness",
        type: "select",
        options: YES_NO_OPTIONS,
        required: true,
      },
    ],
  },
  {
    value: "GENERAL",
    label: "General checkup",
    recommendedSpecialty: "General Medicine",
    extraVitals: [],
  },
];

export const PROBLEM_LOOKUP = PROBLEM_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option;
  return acc;
}, {});

export const DEFAULT_SLOT_INTERVAL_MINUTES = 30;

export function generateDoctorSlots(days = 14, intervalMinutes = DEFAULT_SLOT_INTERVAL_MINUTES) {
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

export const ALLOWED_REASON_CODES = PROBLEM_OPTIONS.map((option) => option.value);
