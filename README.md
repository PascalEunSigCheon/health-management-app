# Health Management Demo Portal

A Cognito-protected, Doctolib-style prototype that lets patients log their symptoms, capture vitals through guided dropdowns, discover doctors, and book appointments. Doctors manage incoming requests, confirm or decline, and view the latest patient vitals sourced from DynamoDB.

## At a glance

- **Patient experience**: problem-first triage flow with mandatory + problem-specific vitals, specialty recommendation, doctor discovery, booking, cancellations, and a live vitals snapshot.
- **Doctor workspace**: pending requests vs confirmed schedule, one-click confirm/decline, and protected vitals retrieval tied to appointment authorization.
- **Architecture**: static HTML/CSS/JS frontend, AWS Cognito for auth, API Gateway + Lambda microservices, and DynamoDB tables for users, appointments, and patient health metrics.

---

## 1. Prerequisites

| Requirement | Notes |
| --- | --- |
| AWS CLI v2 | Authenticated against the target account (region: `eu-west-3`). |
| Python 3.11 | Used for local static hosting and seed scripts. |
| Deployed SAM stack | The backend is already live. Refer to the CloudFormation outputs below. |

### CloudFormation outputs (current environment)

```json
{
  "apiBaseUrl": "https://jxwfu7p6jg.execute-api.eu-west-3.amazonaws.com/v1",
  "region": "eu-west-3",
  "userPoolId": "eu-west-3_qHf4LOBNa",
  "userPoolClientId": "3scslu2a91ae8en1v93r1225uv",
  "doctorMatchEndpoint": ""
}
```

Update [`config.json`](./config.json) if these values change.

---

## 2. Run the frontend locally

```bash
python -m http.server 8080
# Visit http://localhost:8080
```

The site is framework-free and can run from any static host as long as `config.json` is present alongside the HTML files.

---

## 3. Demo accounts & seeding

The repository bundles curated demo users covering multiple specialties, languages, and cities.

- **Default password for all demo accounts:** `HealthPass!1`
- Credentials are listed in [`demo/CREDS.md`](./demo/CREDS.md).
- Doctor metadata (specialty, languages, location, availability slots) is provisioned automatically during sign-up via Cognito custom attributes.

### Option A – self sign-up (recommended for UI demos)

1. Open [`signup.html`](./signup.html).
2. Complete the form:
   - Choose **Patient** or **Doctor**.
   - Doctors must pick specialty, languages, and location from dropdowns; availability slots are generated automatically (Mon–Fri, 09:00–17:00, 30 minute increments for the next 14 days).
3. Confirm the code emailed by Cognito.
4. Sign in from [`signin.html`](./signin.html).

### Option B – seed via CLI (no email required)

```bash
USER_POOL_ID=eu-west-3_qHf4LOBNa
DEFAULT_PASSWORD='HealthPass!1'

# Doctor example (Cardiology, Paris)
aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --username doc.cardio@example.com \
  --user-attributes \
    Name="given_name",Value="Alice" \
    Name="family_name",Value="Cardio" \
    Name="custom:role",Value="DOCTOR" \
    Name="custom:specialty",Value="Cardiology" \
    Name="custom:languages",Value="English,French" \
    Name="custom:location",Value="Paris" \
    Name="custom:availability",Value='[]' \
  --message-action SUPPRESS
aws cognito-idp admin-set-user-password \
  --user-pool-id "$USER_POOL_ID" \
  --username doc.cardio@example.com \
  --password "$DEFAULT_PASSWORD" \
  --permanent
aws cognito-idp admin-add-user-to-group \
  --user-pool-id "$USER_POOL_ID" \
  --username doc.cardio@example.com \
  --group-name DOCTOR

# Patient example
aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --username patient.one@example.com \
  --user-attributes \
    Name="given_name",Value="Pat" \
    Name="family_name",Value="One" \
    Name="custom:role",Value="PATIENT" \
  --message-action SUPPRESS
aws cognito-idp admin-set-user-password \
  --user-pool-id "$USER_POOL_ID" \
  --username patient.one@example.com \
  --password "$DEFAULT_PASSWORD" \
  --permanent
aws cognito-idp admin-add-user-to-group \
  --user-pool-id "$USER_POOL_ID" \
  --username patient.one@example.com \
  --group-name PATIENT
```

To backfill doctor profiles in DynamoDB for legacy users, run:

```bash
python healthcare-sam-starter/scripts/seed_doctors.py \
  --table health-users-dev \
  --input assets/demo-data/doctors.json
```

Patients can be loaded similarly:

```bash
python healthcare-sam-starter/scripts/seed_patients.py \
  --table health-users-dev \
  --input assets/demo-data/patients.json
```

> **Tip:** Append `?demo=1` to the patient workspace URL while signed in to reveal a “Load demo data” button. It attempts to call `/admin/seed/doctors` (available only in trusted dev environments) and falls back with CLI guidance when disabled.

---

## 4. Product walkthrough

### Sign up / Sign in

- Strong passwords enforced (≥8 chars, upper/lowercase, digit, symbol).
- Role selection drives the landing page (patient → `patient.html`, doctor → `doctor.html`).
- Sessions persist in `localStorage` with expiry checks; the **Sign out** button clears tokens client-side and calls Cognito’s logout.

### Patient workspace (`patient.html`)

1. **Problem selection & vitals**
   - Problems are limited to curated options: Cardiac symptoms, Dermatological issue, Respiratory issue, Gastrointestinal issue, Musculoskeletal, Neurological, General checkup.
   - Mandatory vitals for everyone: Height (cm), Weight (kg), Temperature (°C).
   - Each problem dynamically reveals additional required vitals (e.g. blood pressure + cholesterol for Cardiac, SpO₂ + respiratory rate for Respiratory).
   - Specialty recommendation auto-selects the matching specialty but can be overridden via dropdown.
2. **Doctor discovery**
   - Filters cover specialty (pre-selected), city (Paris, Lyon, Marseille, Toulouse, Nice, Virtual), and language (English, French, German, Spanish, Italian).
   - Doctor cards list specialty, location, languages, and a slot dropdown (future slots only; seeded availability is 30-minute blocks across the next 14 weekdays).
3. **Booking & management**
   - Booking payloads are validated client-side to ensure vitals completeness and future slots.
   - Appointments start as `PENDING`; status badges update when the doctor responds.
   - Patients can cancel `PENDING` or `CONFIRMED` bookings.
4. **Vitals snapshot**
   - The “Latest submitted vitals” card pulls the `latest` record from the PatientHealthIndex table and renders key-value pairs.

### Doctor workspace (`doctor.html`)

- Tabs segment **Pending requests** (default) and **My schedule** (confirmed appointments).
- Each card shows patient email (or anonymized ID), requested slot, and reason label. Confirm/Decline buttons update DynamoDB and emit analytics events.
- “View vitals” (or selecting the card) calls `GET /patient-health/{patientId}/latest?appointmentId=...`. Doctors only receive data for appointments they own with status `PENDING` or `CONFIRMED`.
- Auto-refresh every 10 seconds keeps the dashboard current; the badge reflects the last update time in 24-hour format.

---

## 5. API quick reference

| Endpoint | Method | Role | Notes |
| --- | --- | --- | --- |
| `/doctors?specialty=&city=&language=` | GET | Patient / Doctor | Returns doctor profiles with languages as arrays. |
| `/appointments` | POST | Patient | Books a pending appointment (`reasonCode`, `vitals`, `recommendedSpecialty`, `slotISO`). |
| `/appointments/patient` | GET | Patient | Lists patient appointments (sorted by creation time desc). |
| `/appointments/{id}/cancel` | POST | Patient | Cancels a pending/confirmed appointment. |
| `/appointments/doctor?status=PENDING|CONFIRMED` | GET | Doctor | Doctor’s requests or schedule. Accepts optional `since` ISO filter. |
| `/appointments/{id}/confirm` | POST | Doctor | Confirms a pending appointment. |
| `/appointments/{id}/decline` | POST | Doctor | Declines a pending appointment. |
| `/patient-health/{patientId}/latest?appointmentId=` | GET | Patient / Doctor | Patients fetch their own latest metrics; doctors must supply `appointmentId`. |

All responses are JSON with CORS headers (`Access-Control-Allow-Origin: *`). Errors return `{ "message": "..." }` with appropriate HTTP status codes for toast display.

---

## 6. Deploy to S3 (static hosting)

```bash
aws s3 sync . s3://hm-static-site-dev-810278669680 \
  --exclude ".git/*" \
  --exclude "healthcare-sam-starter/*" \
  --delete
aws s3 website s3://hm-static-site-dev-810278669680 --index-document index.html
```

Ensure the bucket policy allows public `GET` access (or front the bucket with CloudFront + OAC in production). Upload `config.json` alongside the HTML files.

---

## 7. Troubleshooting checklist

| Symptom | Likely fix |
| --- | --- |
| `401 Unauthorized` responses | Session expired. Sign out and back in (clears `localStorage`). |
| `403 Forbidden` on doctor endpoints | User not in `DOCTOR` group or appointment does not belong to them. Re-check Cognito groups or book a new appointment. |
| Doctor search empty | Doctor profile missing specialty/city/languages or no future availability. Seed via scripts/CLI and retry. |
| Booking rejected with “slot not published” | Slot not in doctor’s availability window or already booked. Pick another slot. |
| Health summary returns empty metrics | Patient has not submitted an intake yet. Book an appointment to create a snapshot. |
| Time validation failures | Ensure the client machine clock is correct; slots must be in the future in ISO 8601 format. |

---

## 8. Definition of done (self-check)

- [x] Patient can sign up, sign in, choose a problem, enter required vitals, discover doctors, and book a `PENDING` appointment.
- [x] Doctor sees the pending request, confirms/declines, and the patient list updates accordingly.
- [x] Doctor accesses patient vitals only for owned appointments with allowed statuses.
- [x] All structured inputs are dropdowns or numeric controls; no free-text fields for specialties, problems, languages, or locations.
- [x] README + demo data enable a new contributor to run locally and deploy the static site to S3 without additional guidance.

---

Happy shipping! :rocket:
