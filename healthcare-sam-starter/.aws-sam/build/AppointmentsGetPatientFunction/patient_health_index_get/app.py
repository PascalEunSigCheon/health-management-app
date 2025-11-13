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

from common import get_claim, health_index_table, json_response, require_role  # noqa: E402


LOGGER = logging.getLogger(__name__)


def lambda_handler(event: Dict[str, Any], _context: Any):
    forbidden = require_role(event, ["PATIENT"])
    if forbidden:
        return forbidden

    patient_id = get_claim(event, "email")
    if not patient_id:
        # Demo mode: use default patient ID
        patient_id = "patient.demo@example.com"
    
    path_patient = (event.get("pathParameters") or {}).get("patientId")

    if not path_patient or path_patient != patient_id:
        return json_response({"message": "forbidden"}, 403)

    response = health_index_table.query(
        KeyConditionExpression=Key("patientId").eq(patient_id)
    )

    items = response.get("Items", [])
    for item in items:
        if "summary" in item and "metrics" not in item:
            item["metrics"] = item.pop("summary")

    LOGGER.info(
        "patient health index retrieved",
        extra={
            "requestId": event.get("requestContext", {}).get("requestId"),
            "patientId": patient_id,
            "count": len(items),
        },
    )

    return json_response({"items": items})
