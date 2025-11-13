from __future__ import annotations

import logging
import os
import sys
from datetime import datetime
from typing import Any, Dict

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, os.pardir))
if PARENT_DIR not in sys.path:
    sys.path.append(PARENT_DIR)

from common import appointments_table, emit_event, get_claim, json_response, require_role, health_index_table  # noqa: E402


LOGGER = logging.getLogger(__name__)

ALLOWED_STATUSES = {"PENDING", "CONFIRMED"}


def lambda_handler(event: Dict[str, Any], _context: Any):
    forbidden = require_role(event, ["PATIENT"])
    if forbidden:
        return forbidden

    patient_id = get_claim(event, "email")
    if not patient_id:
        # Demo mode: use default patient ID
        patient_id = "patient.demo@example.com"
    
    appointment_id = (event.get("pathParameters") or {}).get("appointmentId")

    if not appointment_id:
        return json_response({"message": "appointmentId required"}, 400)

    record = appointments_table.get_item(Key={"appointmentId": appointment_id}).get("Item")
    if not record:
        return json_response({"message": "appointment not found"}, 404)

    if record.get("patientId") != patient_id:
        return json_response({"message": "forbidden"}, 403)

    if record.get("status") not in ALLOWED_STATUSES:
        return json_response({"message": "cannot cancel appointment in current state"}, 409)

    # Delete the appointment to free up the slot completely
    appointments_table.delete_item(Key={"appointmentId": appointment_id})
    emit_event("CANCELLED", record)

    # Best-effort cleanup of patient health index: remove the per-appointment record
    try:
        health_index_table.delete_item(Key={"patientId": patient_id, "recordId": appointment_id})
        # If "latest" pointed to this appointment, recompute it from remaining records
        latest = health_index_table.get_item(Key={"patientId": patient_id, "recordId": "latest"}).get("Item")
        if latest and latest.get("updatedAt") == record.get("createdAt"):
            # Load all records for this patient (excluding 'latest') and find most recent by updatedAt
            from boto3.dynamodb.conditions import Key as DdbKey  # local import to avoid global dependency

            resp = health_index_table.query(KeyConditionExpression=DdbKey("patientId").eq(patient_id))
            candidates = [it for it in resp.get("Items", []) if it.get("recordId") not in ("latest", appointment_id)]
            if candidates:
                candidates.sort(key=lambda r: r.get("updatedAt") or "")
                newest = candidates[-1]
                health_index_table.put_item(
                    Item={
                        "patientId": patient_id,
                        "recordId": "latest",
                        "updatedAt": newest.get("updatedAt"),
                        "reasonCode": newest.get("reasonCode"),
                        "metrics": newest.get("metrics") or newest.get("summary") or {},
                    }
                )
            else:
                # No remaining records: clear the 'latest' pointer
                health_index_table.delete_item(Key={"patientId": patient_id, "recordId": "latest"})
    except Exception:
        LOGGER.exception("health index cleanup failed for cancellation")

    LOGGER.info(
        "appointment cancelled and deleted",
        extra={"patientId": patient_id, "appointmentId": appointment_id},
    )

    return json_response({"status": "DELETED"})
