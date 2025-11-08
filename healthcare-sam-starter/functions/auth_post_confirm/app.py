from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from typing import Any, Dict

import boto3

LOGGER = logging.getLogger()
LOGGER.setLevel(os.getenv("LOG_LEVEL", "INFO"))

dynamodb = boto3.resource("dynamodb")
users_table = dynamodb.Table(os.environ["USERS_TABLE_NAME"])


def lambda_handler(event: Dict[str, Any], _context: Any) -> Dict[str, Any]:
    LOGGER.debug("Post confirmation event: %s", json.dumps(event))

    user_attributes = event.get("request", {}).get("userAttributes", {})
    sub = user_attributes.get("sub")
    email = user_attributes.get("email")
    role = user_attributes.get("custom:role") or user_attributes.get("role")
    first_name = user_attributes.get("given_name", "")
    last_name = user_attributes.get("family_name", "")

    if not sub or not email:
        LOGGER.error("Missing sub or email in post confirmation event")
        raise ValueError("Missing required user attributes")

    doctor_profile = {}
    if role == "DOCTOR":
        doctor_profile = {
            "specialty": user_attributes.get("custom:specialty") or user_attributes.get("specialty"),
            "languages": (user_attributes.get("custom:languages") or user_attributes.get("languages") or ""),
            "location": user_attributes.get("custom:location") or user_attributes.get("location"),
        }

    item = {
        "userId": sub,
        "email": email,
        "role": role or "PATIENT",
        "firstName": first_name,
        "lastName": last_name,
        "createdAt": datetime.utcnow().isoformat(),
    }
    item.update({k: v for k, v in doctor_profile.items() if v})

    users_table.put_item(Item=item)

    return event
