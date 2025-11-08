from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime
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
    json_response,
    require_role,
    users_table,
)

ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


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
    return parsed


def lambda_handler(event: Dict[str, Any], _context: Any):
    forbidden = require_role(event, ["PATIENT"])
    if forbidden:
        return forbidden

    patient_id = get_claim(event, "sub")
    if not patient_id:
        return json_response({"message": "unauthorized"}, 401)

    body = json.loads(event.get("body") or "{}")
    doctor_id = body.get("doctorId")
    slot_iso = body.get("slotISO")
    reason = body.get("reason")

    if not doctor_id or not slot_iso:
        return json_response({"message": "doctorId and slotISO are required"}, 400)

    try:
        slot_dt = parse_slot_iso(slot_iso)
    except ValueError as exc:
        return json_response({"message": str(exc)}, 400)

    doctor = users_table.get_item(Key={"userId": doctor_id}).get("Item")
    if not doctor or doctor.get("role") != "DOCTOR":
        return json_response({"message": "doctor not found"}, 404)

    # Clash check for doctor schedule
    clashes = appointments_table.query(
        IndexName="GSI1",
        KeyConditionExpression=Key("doctorId").eq(doctor_id) & Key("slotISO").eq(slot_dt.isoformat()),
        Limit=1,
    )
    if clashes.get("Count", 0) > 0:
        return json_response({"message": "slot not available"}, 409)

    appointment_id = generate_ulid()
    item = {
        "appointmentId": appointment_id,
        "doctorId": doctor_id,
        "patientId": patient_id,
        "slotISO": slot_dt.isoformat(),
        "status": "PENDING",
        "reason": reason,
        "createdAt": datetime.utcnow().isoformat(),
    }

    appointments_table.put_item(Item=item)

    emit_event("BOOKED", item)

    return json_response({"appointmentId": appointment_id, "status": "PENDING"}, 201)
