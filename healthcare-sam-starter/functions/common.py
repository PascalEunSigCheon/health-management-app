from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from typing import Any, Dict, Iterable, Optional, Set

import boto3


LOGGER = logging.getLogger("health-app")
LOGGER.setLevel(os.getenv("LOG_LEVEL", "INFO"))

dynamodb = boto3.resource("dynamodb")
users_table = dynamodb.Table(os.environ["USERS_TABLE_NAME"])
appointments_table = dynamodb.Table(os.environ["APPOINTMENTS_TABLE_NAME"])
health_index_table = dynamodb.Table(os.environ["PATIENT_HEALTH_INDEX_TABLE_NAME"])
events_client = boto3.client("events")


def json_response(body: Dict[str, Any], status_code: int = 200) -> Dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Authorization,Content-Type",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        "body": json.dumps(body),
    }


def get_claim(event: Dict[str, Any], key: str) -> Optional[str]:
    claims = event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}).get("claims", {})
    return claims.get(key)


def get_groups(event: Dict[str, Any]) -> Set[str]:
    raw = get_claim(event, "cognito:groups")
    if not raw:
        return set()
    if isinstance(raw, str):
        values: Iterable[str] = raw.split(",")
    elif isinstance(raw, Iterable):
        values = raw  # type: ignore[assignment]
    else:
        return set()
    return {str(value).strip() for value in values if str(value).strip()}


def require_role(event: Dict[str, Any], allowed_roles: list[str]) -> Optional[Dict[str, Any]]:
    group_set = get_groups(event)
    if not group_set:
        LOGGER.warning(
            "authorization failure", extra={"allowed": allowed_roles, "reason": "no-groups"}
        )
        return json_response({"message": "forbidden"}, 403)
    if not group_set.intersection(set(allowed_roles)):
        LOGGER.warning(
            "authorization failure",
            extra={"allowed": allowed_roles, "groups": list(group_set), "reason": "missing-role"},
        )
        return json_response({"message": "forbidden"}, 403)
    return None


def emit_event(event_type: str, appointment: Dict[str, Any]) -> None:
    bus_name = os.environ.get("APPOINTMENT_EVENT_BUS_NAME")
    if not bus_name:
        LOGGER.warning("APPOINTMENT_EVENT_BUS_NAME missing; skipping event emit")
        return
    detail = {
        "eventType": event_type,
        "appointmentId": appointment.get("appointmentId"),
        "patientId": appointment.get("patientId"),
        "doctorId": appointment.get("doctorId"),
        "slotISO": appointment.get("slotISO"),
        "status": appointment.get("status"),
        "reasonCode": appointment.get("reasonCode"),
        "recommendedSpecialty": appointment.get("recommendedSpecialty"),
        "ts": datetime.utcnow().isoformat(),
    }
    events_client.put_events(
        Entries=[
            {
                "Source": "health.appointments",
                "DetailType": event_type,
                "Detail": json.dumps(detail),
                "EventBusName": bus_name,
            }
        ]
    )


def normalize_languages(raw: Any) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, str):
        values = raw.split(",")
    elif isinstance(raw, Iterable):
        values = raw
    else:
        return []
    cleaned = []
    for value in values:
        value_str = str(value).strip()
        if value_str:
            cleaned.append(value_str)
    return cleaned
