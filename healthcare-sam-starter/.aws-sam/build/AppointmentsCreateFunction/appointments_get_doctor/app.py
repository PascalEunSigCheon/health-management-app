from __future__ import annotations

import logging
import os
import sys
from datetime import datetime
from typing import Any, Dict, Optional

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

    # Use email as doctor ID (not sub UUID) - appointments are keyed by email
    doctor_id = get_claim(event, "email")
    if not doctor_id and is_demo_mode():
        # Demo mode: use doctor ID from query parameter or default to a configured demo doctor
        params = event.get("queryStringParameters") or {}
        doctor_id = params.get("doctorId") or os.getenv("DEFAULT_DEMO_DOCTOR_ID")
        if not doctor_id:
            return json_response({"message": "doctorId query parameter required in demo mode"}, 400)

    params = event.get("queryStringParameters") or {}
    since = parse_since(params.get("since"))
    status_filter = (params.get("status") or "").upper()

    LOGGER.info(
        "list doctor appointments",
        extra={
            "requestId": event.get("requestContext", {}).get("requestId"),
            "doctorId": doctor_id,
            "status": status_filter,
            "since": since,
        },
    )

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
        LOGGER.info("enriched patient emails", extra={"count": len(unique_ids)})

    for record in items:
        profile = record.get("doctorProfile")
        if isinstance(profile, dict):
            profile["languages"] = normalize_languages(profile.get("languages"))

    LOGGER.info("doctor appointments loaded", extra={"count": len(items)})
    return json_response({"items": items})
