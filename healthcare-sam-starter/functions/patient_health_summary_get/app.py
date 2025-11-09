from __future__ import annotations

import os
import sys
from typing import Any, Dict, Optional

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, os.pardir))
if PARENT_DIR not in sys.path:
    sys.path.append(PARENT_DIR)

from common import (  # noqa: E402
    appointments_table,
    get_claim,
    get_groups,
    health_index_table,
    json_response,
    require_role,
)

ALLOWED_STATUSES = {"PENDING", "CONFIRMED"}


def fetch_record(patient_id: str, record_id: str) -> Optional[Dict[str, Any]]:
    if not record_id:
        return None
    response = health_index_table.get_item(Key={"patientId": patient_id, "recordId": record_id})
    return response.get("Item")


def lambda_handler(event: Dict[str, Any], _context: Any):
    forbidden = require_role(event, ["PATIENT", "DOCTOR"])
    if forbidden:
        return forbidden

    requester = get_claim(event, "sub")
    groups = get_groups(event)
    path_patient = (event.get("pathParameters") or {}).get("patientId")
    appointment_id = (event.get("queryStringParameters") or {}).get("appointmentId")

    if not requester or not path_patient:
        return json_response({"message": "missing identifiers"}, 400)

    record: Optional[Dict[str, Any]] = None

    if "PATIENT" in groups:
        if path_patient != requester:
            return json_response({"message": "forbidden"}, 403)
        record = fetch_record(path_patient, "latest")
    elif "DOCTOR" in groups:
        if not appointment_id:
            return json_response({"message": "appointmentId required"}, 400)
        appointment = appointments_table.get_item(Key={"appointmentId": appointment_id}).get("Item")
        if (
            not appointment
            or appointment.get("doctorId") != requester
            or appointment.get("patientId") != path_patient
            or appointment.get("status") not in ALLOWED_STATUSES
        ):
            return json_response({"message": "forbidden"}, 403)
        record = fetch_record(path_patient, appointment_id) or fetch_record(path_patient, "latest")
    else:
        return json_response({"message": "forbidden"}, 403)

    if not record:
        return json_response({"item": {"metrics": {}, "updatedAt": None}})

    return json_response({"item": record})
