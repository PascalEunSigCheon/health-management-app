from __future__ import annotations

import os
import sys
from datetime import datetime
from typing import Any, Dict, Optional

from boto3.dynamodb.conditions import Key

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, os.pardir))
if PARENT_DIR not in sys.path:
    sys.path.append(PARENT_DIR)

from common import appointments_table, get_claim, json_response, require_role, users_table  # noqa: E402


def parse_since(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).isoformat()
    except ValueError:
        return None


def lambda_handler(event: Dict[str, Any], _context: Any):
    forbidden = require_role(event, ["DOCTOR"])
    if forbidden:
        return forbidden

    doctor_id = get_claim(event, "sub")
    if not doctor_id:
        return json_response({"message": "unauthorized"}, 401)

    params = event.get("queryStringParameters") or {}
    since = parse_since(params.get("since"))
    status_filter = (params.get("status") or "").upper()

    key_condition = Key("doctorId").eq(doctor_id)
    if since:
        key_condition = key_condition & Key("slotISO").gte(since)

    result = appointments_table.query(
        IndexName="GSI1",
        KeyConditionExpression=key_condition,
        ScanIndexForward=True,
    )

    items = result.get("Items", [])
    if status_filter:
        items = [item for item in items if item.get("status", "").upper() == status_filter]

    items.sort(key=lambda record: record.get("slotISO", ""))

    # Populate patient email if missing (legacy records)
    missing_patient_ids = [item["patientId"] for item in items if not item.get("patientEmail")]
    unique_ids = list({pid for pid in missing_patient_ids})
    if unique_ids:
        for patient_id in unique_ids:
            try:
                patient = users_table.get_item(Key={"userId": patient_id}).get("Item")
            except Exception:  # pylint: disable=broad-except
                patient = None
            if not patient:
                continue
            for record in items:
                if record.get("patientId") == patient_id and not record.get("patientEmail"):
                    record["patientEmail"] = patient.get("email")

    return json_response({"items": items})
