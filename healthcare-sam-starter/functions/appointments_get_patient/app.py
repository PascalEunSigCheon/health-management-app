from __future__ import annotations

import os
import sys
from typing import Any, Dict

from boto3.dynamodb.conditions import Key

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, os.pardir))
if PARENT_DIR not in sys.path:
    sys.path.append(PARENT_DIR)

from common import appointments_table, get_claim, json_response, require_role, users_table  # noqa: E402


def lambda_handler(event: Dict[str, Any], _context: Any):
    forbidden = require_role(event, ["PATIENT"])
    if forbidden:
        return forbidden

    patient_id = get_claim(event, "sub")
    if not patient_id:
        return json_response({"message": "unauthorized"}, 401)

    result = appointments_table.query(
        IndexName="GSI2",
        KeyConditionExpression=Key("patientId").eq(patient_id),
        ScanIndexForward=True,
    )

    items = result.get("Items", [])
    items.sort(key=lambda record: record.get("createdAt", record.get("slotISO", "")), reverse=True)

    # Attach doctor metadata when available for UI display
    doctor_ids = {item.get("doctorId") for item in items if item.get("doctorId")}
    for doctor_id in doctor_ids:
        doctor = users_table.get_item(Key={"userId": doctor_id}).get("Item")
        if not doctor:
            continue
        for appointment in items:
            if appointment.get("doctorId") == doctor_id:
                appointment.setdefault("doctorProfile", doctor.get("doctorProfile") or {})
                appointment.setdefault("doctorName", f"{doctor.get('firstName', '')} {doctor.get('lastName', '')}".strip())

    return json_response({"items": items})
