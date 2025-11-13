from __future__ import annotations

import logging
import os
import sys
from typing import Any, Dict

from boto3.dynamodb.conditions import Key

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, os.pardir))
if PARENT_DIR not in sys.path:
    sys.path.append(PARENT_DIR)

from common import (  # noqa: E402
    appointments_table,
    get_claim,
    json_response,
    normalize_languages,
    require_role,
    users_table,
    is_demo_mode,
)


LOGGER = logging.getLogger(__name__)


def lambda_handler(event: Dict[str, Any], _context: Any):
    forbidden = require_role(event, ["PATIENT"])
    if forbidden:
        return forbidden

    # Use email as patient ID - appointments are keyed by patient email
    patient_id = get_claim(event, "email")
    if not patient_id and is_demo_mode():
        # Demo mode: use default patient ID
        patient_id = "patient.demo@example.com"

    LOGGER.info(
        "list patient appointments",
        extra={
            "requestId": event.get("requestContext", {}).get("requestId"),
            "patientId": patient_id,
        },
    )

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
                profile = appointment["doctorProfile"]
                if isinstance(profile, dict):
                    profile["languages"] = normalize_languages(profile.get("languages"))
                    if profile.get("location") and not profile.get("city"):
                        profile["city"] = profile["location"]
                appointment.setdefault("doctorName", f"{doctor.get('firstName', '')} {doctor.get('lastName', '')}".strip())

    LOGGER.info("patient appointments loaded", extra={"count": len(items)})
    return json_response({"items": items})
