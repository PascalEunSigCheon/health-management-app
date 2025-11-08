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

from common import appointments_table, get_claim, json_response, require_role  # noqa: E402


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

    key_condition = Key("doctorId").eq(doctor_id)
    if since:
        key_condition = key_condition & Key("slotISO").gte(since)

    result = appointments_table.query(
        IndexName="GSI1",
        KeyConditionExpression=key_condition,
        ScanIndexForward=True,
    )

    return json_response({"items": result.get("Items", [])})
