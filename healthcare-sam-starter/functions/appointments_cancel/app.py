from __future__ import annotations

import os
import sys
from datetime import datetime
from typing import Any, Dict

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, os.pardir))
if PARENT_DIR not in sys.path:
    sys.path.append(PARENT_DIR)

from common import appointments_table, emit_event, get_claim, json_response, require_role  # noqa: E402

ALLOWED_STATUSES = {"PENDING", "CONFIRMED"}


def lambda_handler(event: Dict[str, Any], _context: Any):
    forbidden = require_role(event, ["PATIENT"])
    if forbidden:
        return forbidden

    patient_id = get_claim(event, "sub")
    appointment_id = (event.get("pathParameters") or {}).get("appointmentId")

    if not appointment_id or not patient_id:
        return json_response({"message": "appointmentId required"}, 400)

    record = appointments_table.get_item(Key={"appointmentId": appointment_id}).get("Item")
    if not record:
        return json_response({"message": "appointment not found"}, 404)

    if record.get("patientId") != patient_id:
        return json_response({"message": "forbidden"}, 403)

    if record.get("status") not in ALLOWED_STATUSES:
        return json_response({"message": "cannot cancel appointment in current state"}, 409)

    record["status"] = "CANCELLED"
    record["updatedAt"] = datetime.utcnow().isoformat()

    appointments_table.put_item(Item=record)
    emit_event("CANCELLED", record)

    return json_response({"status": "CANCELLED"})
