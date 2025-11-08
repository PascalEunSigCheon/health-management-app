from __future__ import annotations

import json
import os
import sys
from typing import Any, Dict, List

import boto3

from boto3.dynamodb.conditions import Key

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, os.pardir))
if PARENT_DIR not in sys.path:
    sys.path.append(PARENT_DIR)

from common import (  # noqa: E402
    appointments_table,
    get_claim,
    health_index_table,
    json_response,
    require_role,
)

s3_client = boto3.client("s3")

ALLOWED_STATUSES = {"PENDING", "CONFIRMED"}


def parse_s3_uri(uri: str) -> Dict[str, str]:
    if not uri.startswith("s3://"):
        raise ValueError("Invalid S3 URI")
    without_scheme = uri[len("s3://") :]
    bucket, _, key = without_scheme.partition("/")
    if not bucket or not key:
        raise ValueError("Invalid S3 URI")
    return {"bucket": bucket, "key": key}


def fetch_pointer_content(pointer: Dict[str, Any]) -> Dict[str, Any]:
    uri = pointer.get("s3Uri")
    if not uri:
        return pointer
    try:
        parts = parse_s3_uri(uri)
        obj = s3_client.get_object(Bucket=parts["bucket"], Key=parts["key"])
        content = obj["Body"].read()
        try:
            payload = json.loads(content)
        except json.JSONDecodeError:
            payload = {"raw": content.decode("utf-8", errors="ignore")}
        pointer = dict(pointer)
        pointer["payload"] = payload
        return pointer
    except Exception as exc:  # pylint: disable=broad-except
        pointer = dict(pointer)
        pointer["payloadError"] = str(exc)
        return pointer


def lambda_handler(event: Dict[str, Any], _context: Any):
    forbidden = require_role(event, ["DOCTOR"])
    if forbidden:
        return forbidden

    doctor_id = get_claim(event, "sub")
    patient_id = (event.get("pathParameters") or {}).get("patientId")
    appointment_id = (event.get("queryStringParameters") or {}).get("appointmentId")

    if not doctor_id or not patient_id or not appointment_id:
        return json_response({"message": "missing identifiers"}, 400)

    appointment = appointments_table.get_item(Key={"appointmentId": appointment_id}).get("Item")
    if (
        not appointment
        or appointment.get("doctorId") != doctor_id
        or appointment.get("patientId") != patient_id
        or appointment.get("status") not in ALLOWED_STATUSES
    ):
        return json_response({"message": "forbidden"}, 403)

    records_resp = health_index_table.query(
        KeyConditionExpression=Key("patientId").eq(patient_id)
    )
    records: List[Dict[str, Any]] = records_resp.get("Items", [])

    enriched = [fetch_pointer_content(record) for record in records]

    return json_response({"items": enriched})
