import json
import logging
import os
from datetime import datetime
import json
import logging
import os
from typing import Any, Dict, Optional

import boto3

LOGGER = logging.getLogger()
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
        },
        "body": json.dumps(body),
    }


def get_claim(event: Dict[str, Any], key: str) -> Optional[str]:
    claims = event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}).get("claims", {})
    return claims.get(key)


def require_role(event: Dict[str, Any], allowed_roles: list[str]) -> Optional[Dict[str, Any]]:
    groups = get_claim(event, "cognito:groups")
    if not groups:
        return json_response({"message": "forbidden"}, 403)
    group_set = {g.strip() for g in groups.split(",")}
    if not group_set.intersection(set(allowed_roles)):
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
        "reason": appointment.get("reason"),
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
