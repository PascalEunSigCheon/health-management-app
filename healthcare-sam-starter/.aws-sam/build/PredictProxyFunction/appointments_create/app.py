from __future__ import annotations

import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict

from boto3.dynamodb.conditions import Key

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, os.pardir))
if PARENT_DIR not in sys.path:
    sys.path.append(PARENT_DIR)

from common import (  # noqa: E402
    appointments_table,
    emit_event,
    get_claim,
    health_index_table,
    json_response,
    require_role,
    users_table,
    is_demo_mode,
)


LOGGER = logging.getLogger(__name__)

ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
MANDATORY_VITAL_FIELDS = {
    "heightCm",
    "weightKg",
    "temperatureC",
}
# The simplified application always stores appointments with the "GENERAL"
# reason code. Patients no longer specify problem codes in the UI.


def generate_ulid() -> str:
    millis = int(time.time() * 1000)
    time_bytes = millis.to_bytes(6, byteorder="big", signed=False)
    random_bytes = os.urandom(10)
    value = int.from_bytes(time_bytes + random_bytes, "big")
    chars = []
    for _ in range(26):
        value, idx = divmod(value, 32)
        chars.append(ULID_ALPHABET[idx])
    return "".join(reversed(chars))


def parse_slot_iso(slot: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(slot.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("slotISO must be ISO-8601 timestamp") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def compute_bmi(height_cm: float, weight_kg: float) -> float | None:
    try:
        meters = float(height_cm) / 100
        weight = float(weight_kg)
        if meters <= 0:
            return None
        return round(weight / (meters * meters), 1)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def sanitize_vitals(vitals: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(vitals, dict):
        raise ValueError("vitals must be an object")
    summary: Dict[str, Any] = {}
    for field in MANDATORY_VITAL_FIELDS:
        value = vitals.get(field)
        if value is None:
            raise ValueError(f"Missing vital: {field}")
        try:
            summary[field] = float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid numeric value for {field}") from exc

    for key, value in vitals.items():
        if key in summary:
            continue
        if isinstance(value, (int, float)):
            summary[key] = float(value)
        elif isinstance(value, str):
            summary[key] = value[:120]

    bmi = summary.get("bmi")
    if bmi is None:
        computed = compute_bmi(summary["heightCm"], summary["weightKg"])
        if computed is not None:
            summary["bmi"] = computed

    return summary


def lambda_handler(event: Dict[str, Any], _context: Any):
    forbidden = require_role(event, ["PATIENT"])
    if forbidden:
        return forbidden

    # Use email as patient ID - appointments are keyed by patient email
    patient_id = get_claim(event, "email")
    if not patient_id and is_demo_mode():
        # Demo mode fallback to a default patient ID
        patient_id = "patient.demo@example.com"

    body = json.loads(event.get("body") or "{}")
    doctor_id = body.get("doctorId")
    slot_iso = body.get("slotISO")
    # In the simplified flow, we ignore any reason code sent by the front‑end and
    # default to "GENERAL". The recommendedSpecialty field is no longer used.
    reason_code = body.get("reasonCode") or "GENERAL"
    recommended_specialty = None
    vitals = body.get("vitals")

    LOGGER.info(
        "create appointment request",
        extra={
            "requestId": event.get("requestContext", {}).get("requestId"),
            "patientId": patient_id,
            "doctorId": doctor_id,
            "reasonCode": reason_code,
        },
    )

    if not doctor_id or not slot_iso:
        return json_response({"message": "doctorId and slotISO are required"}, 400)
    # If reason_code is falsy, use the default. We no longer enforce a
    # particular reason code.

    try:
        summary_vitals = sanitize_vitals(vitals or {})
        # Convert floats to Decimal for DynamoDB
        summary_vitals_decimal = {k: Decimal(str(v)) if isinstance(v, (int, float)) else v 
                                  for k, v in summary_vitals.items()}
    except ValueError as exc:
        return json_response({"message": str(exc)}, 400)

    try:
        slot_dt = parse_slot_iso(slot_iso)
    except ValueError as exc:
        return json_response({"message": str(exc)}, 400)
    now = datetime.now(timezone.utc)
    if slot_dt <= now:
        return json_response({"message": "slot must be in the future"}, 400)

    doctor = users_table.get_item(Key={"userId": doctor_id}).get("Item")
    if not doctor or doctor.get("role") != "DOCTOR":
        return json_response({"message": "doctor not found"}, 404)

    profile = doctor.get("doctorProfile") or {}
    avail_slots = profile.get("availSlots") or []
    normalized_slot = slot_dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")
    if avail_slots and normalized_slot not in avail_slots:
        return json_response({"message": "slot not published by doctor"}, 400)

    try:
        clashes = appointments_table.query(
            IndexName="GSI1",
            KeyConditionExpression=Key("doctorId").eq(doctor_id) & Key("slotISO").eq(normalized_slot),
            Limit=1,
        )
    except Exception:  # pylint: disable=broad-except
        LOGGER.exception("doctor availability lookup failed")
        return json_response({"message": "unable to check availability"}, 500)
    if clashes.get("Count", 0) > 0:
        return json_response({"message": "slot not available"}, 409)

    appointment_id = generate_ulid()
    created_at = datetime.utcnow().isoformat()
    patient_email = get_claim(event, "email")
    if not patient_email:
        user_record = users_table.get_item(Key={"userId": patient_id}).get("Item")
        patient_email = user_record.get("email") if user_record else None

    item = {
        "appointmentId": appointment_id,
        "doctorId": doctor_id,
        "patientId": patient_id,
        "patientEmail": patient_email,
        "slotISO": normalized_slot,
        "status": "PENDING",
        "createdAt": created_at,
        "updatedAt": created_at,
        # Always store the generic reason code. The front‑end no longer sends specific problem codes.
        "reasonCode": reason_code or "GENERAL",
        # recommendedSpecialty is unused in the simplified model
        "vitalsSummary": summary_vitals_decimal,
        "vitals": summary_vitals_decimal,
    }

    try:
        appointments_table.put_item(Item=item)
    except Exception:  # pylint: disable=broad-except
        LOGGER.exception("failed to persist appointment")
        return json_response({"message": "unable to create appointment"}, 500)

    health_record = {
        "patientId": patient_id,
        "recordId": appointment_id,
        "updatedAt": created_at,
        # Use the same default reason code for the health index record.
        "reasonCode": reason_code or "GENERAL",
        "metrics": summary_vitals_decimal,
    }
    try:
        health_index_table.put_item(Item=health_record)
        health_index_table.put_item(
            Item={
                "patientId": patient_id,
                "recordId": "latest",
                "updatedAt": created_at,
                "reasonCode": reason_code,
                "metrics": summary_vitals_decimal,
            }
        )
    except Exception:  # pylint: disable=broad-except
        LOGGER.exception("failed to persist health index")
        return json_response({"message": "unable to store vitals"}, 500)

    # Attach a minimal doctor profile to the event. Languages are no longer included.
    item["doctorProfile"] = {
        "specialty": profile.get("specialty"),
        "city": profile.get("city") or profile.get("location"),
    }

    emit_event("BOOKED", item)
    LOGGER.info("appointment created", extra={"appointmentId": appointment_id})
    # Post-create cleanup: keep max 3 most recent appointments per patient (includes PENDING)
    try:
        existing = appointments_table.query(
            IndexName="GSI2",
            KeyConditionExpression=Key("patientId").eq(patient_id),
            ProjectionExpression="#aid, createdAt",
            ExpressionAttributeNames={"#aid": "appointmentId"},
        ).get("Items", [])
        # Sort by createdAt ascending; fall back to slotISO if missing
        existing.sort(key=lambda r: (r.get("createdAt") or "", r.get("slotISO") or ""))
        to_delete = max(0, len(existing) - 3)
        for old in existing[:to_delete]:
            try:
                appointments_table.delete_item(Key={"appointmentId": old["appointmentId"]})
            except Exception:
                LOGGER.warning("failed to delete old appointment %s", old.get("appointmentId"))
    except Exception:
        LOGGER.exception("cleanup old appointments failed")

    return json_response({"appointmentId": appointment_id, "status": "PENDING"}, 201)
