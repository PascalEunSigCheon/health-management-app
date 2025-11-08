from __future__ import annotations

import json
import os
import sys
from typing import Any, Dict, List

from boto3.dynamodb.conditions import Attr

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, os.pardir))
if PARENT_DIR not in sys.path:
    sys.path.append(PARENT_DIR)

from common import json_response, require_role, users_table  # noqa: E402


FILTER_FIELDS = {
    "specialty": "specialty",
    "location": "location",
    "language": "languages",
}


def build_filter_expression(params: Dict[str, str]):
    expression = None
    for key, attr_name in FILTER_FIELDS.items():
        value = params.get(key)
        if not value:
            continue
        attr_condition = Attr(attr_name).contains(value)
        expression = attr_condition if expression is None else expression & attr_condition
    return expression


def lambda_handler(event: Dict[str, Any], _context: Any):
    forbidden = require_role(event, ["PATIENT", "DOCTOR"])
    if forbidden:
        return forbidden

    params = event.get("queryStringParameters") or {}
    filter_expression = build_filter_expression(params)

    scan_kwargs: Dict[str, Any] = {
        "FilterExpression": Attr("role").eq("DOCTOR"),
        "ProjectionExpression": "userId, firstName, lastName, email, specialty, languages, location, createdAt",
    }

    if filter_expression is not None:
        scan_kwargs["FilterExpression"] = Attr("role").eq("DOCTOR") & filter_expression

    response = users_table.scan(**scan_kwargs)
    items: List[Dict[str, Any]] = response.get("Items", [])

    items.sort(key=lambda item: item.get("lastName", ""))

    return json_response({"items": items})
