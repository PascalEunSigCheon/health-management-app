from __future__ import annotations

import os
import sys
from typing import Any, Dict

from boto3.dynamodb.conditions import Key

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, os.pardir))
if PARENT_DIR not in sys.path:
    sys.path.append(PARENT_DIR)

from common import appointments_table, get_claim, json_response, require_role  # noqa: E402


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

    return json_response({"items": items})
