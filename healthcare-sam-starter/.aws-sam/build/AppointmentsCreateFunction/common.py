from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, Iterable, Optional, Set
import base64

import boto3


LOGGER = logging.getLogger("health-app")
LOGGER.setLevel(os.getenv("LOG_LEVEL", "INFO"))

dynamodb = boto3.resource("dynamodb")
users_table = dynamodb.Table(os.environ["USERS_TABLE_NAME"])
appointments_table = dynamodb.Table(os.environ["APPOINTMENTS_TABLE_NAME"])
health_index_table = dynamodb.Table(os.environ["PATIENT_HEALTH_INDEX_TABLE_NAME"])
events_client = boto3.client("events")


class DecimalEncoder(json.JSONEncoder):
    """Custom JSON encoder to handle Decimal types from DynamoDB"""
    def default(self, obj):
        if isinstance(obj, Decimal):
            # Convert Decimal to int if it's a whole number, otherwise to float
            if obj % 1 == 0:
                return int(obj)
            return float(obj)
        return super(DecimalEncoder, self).default(obj)


def json_response(body: Dict[str, Any], status_code: int = 200) -> Dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Authorization,Content-Type",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        "body": json.dumps(body, cls=DecimalEncoder),
    }


def _decode_jwt_payload(token: str) -> Dict[str, Any]:
    try:
        parts = token.split(".")
        if len(parts) < 2:
            return {}
        payload_b64 = parts[1]
        # base64url decode with padding
        padding = '=' * (-len(payload_b64) % 4)
        data = base64.urlsafe_b64decode(payload_b64 + padding)
        return json.loads(data.decode("utf-8"))
    except Exception:  # noqa: B902
        return {}


def _get_header(event: Dict[str, Any], name: str) -> Optional[str]:
    headers = event.get("headers") or {}
    if not isinstance(headers, dict):
        return None
    for k, v in headers.items():
        if k.lower() == name.lower():
            return v
    return None


def get_claim(event: Dict[str, Any], key: str) -> Optional[str]:
    # API Gateway / Lambda payloads can place JWT claims in different locations
    # depending on API type and runtime. Check common locations and merge.
    rc = event.get("requestContext", {})
    authorizer = rc.get("authorizer") or {}
    claims = {}
    # v2 HTTP API with JWT authorizer: authorizer.jwt.claims
    jwt = authorizer.get("jwt") or {}
    if isinstance(jwt, dict):
        claims.update(jwt.get("claims") or {})
    # Some setups place claims directly under authorizer.claims
    claims.update(authorizer.get("claims") or {})
    # older or custom mappings might also include top-level keys
    # fallback: look for a 'claims' key at the event root
    claims.update(event.get("claims") or {})
    if key in claims:
        return claims.get(key)
    # Fallback: decode Authorization header without verification (demo-friendly)
    auth = _get_header(event, "Authorization") or _get_header(event, "authorization")
    if auth and isinstance(auth, str) and auth.lower().startswith("bearer "):
        token = auth.split(" ", 1)[1].strip()
        decoded = _decode_jwt_payload(token)
        return decoded.get(key)
    return claims.get(key)


def get_groups(event: Dict[str, Any]) -> Set[str]:
    # Try well-known claim keys: 'cognito:groups' is standard, but some
    # deployments may map groups to 'groups' or other keys.
    raw = get_claim(event, "cognito:groups") or get_claim(event, "groups")
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
    if os.getenv("DEMO_MODE", "false").lower() == "true":
        return None
    groups = get_groups(event)
    if not groups:
        return json_response({"message": "unauthorized"}, 401)
    if not set(allowed_roles).intersection(groups):
        return json_response({"message": "forbidden"}, 403)
    return None


def is_demo_mode() -> bool:
    return os.getenv("DEMO_MODE", "false").lower() == "true"


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
