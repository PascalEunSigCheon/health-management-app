import logging
import os
import sys
from typing import Any, Dict, List

from boto3.dynamodb.conditions import Attr

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, os.pardir))
if PARENT_DIR not in sys.path:
    sys.path.append(PARENT_DIR)

from common import json_response, normalize_languages, require_role, users_table  # noqa: E402


LOGGER = logging.getLogger(__name__)


def normalise_doctor(item: Dict[str, Any]) -> Dict[str, Any]:
    profile = item.get("doctorProfile") or {}
    if not profile:
        legacy = {
            "specialty": item.get("specialty"),
            "languages": item.get("languages"),
            "city": item.get("location"),
        }
        profile = {k: v for k, v in legacy.items() if v}
    languages = normalize_languages(profile.get("languages"))
    profile["languages"] = languages
    profile.setdefault("availSlots", [])
    if profile.get("location") and not profile.get("city"):
        profile["city"] = profile["location"]
    result = {
        "userId": item.get("userId"),
        "firstName": item.get("firstName"),
        "lastName": item.get("lastName"),
        "email": item.get("email"),
        "doctorProfile": profile,
    }
    return result
def lambda_handler(event: Dict[str, Any], _context: Any):
    forbidden = require_role(event, ["PATIENT", "DOCTOR"])
    if forbidden:
        return forbidden

    params = event.get("queryStringParameters") or {}
    specialty_filter = (params.get("specialty") or "").strip()
    location_filter = (params.get("location") or params.get("city") or "").strip()
    language_filter = (params.get("language") or "").strip()

    LOGGER.info(
        "fetching doctors",
        extra={
            "requestId": event.get("requestContext", {}).get("requestId"),
            "principal": event.get("requestContext", {}).get("authorizer", {})
            .get("jwt", {})
            .get("claims", {})
            .get("sub"),
            "filters": {
                "specialty": specialty_filter,
                "location": location_filter,
                "language": language_filter,
            },
        },
    )

    try:
        response = users_table.scan(FilterExpression=Attr("role").eq("DOCTOR"))
    except Exception as exc:  # pylint: disable=broad-except
        LOGGER.exception("users table scan failed")
        return json_response({"message": "unable to load doctors"}, 500)
    items: List[Dict[str, Any]] = response.get("Items", [])

    normalised: List[Dict[str, Any]] = []
    for item in items:
        doctor = normalise_doctor(item)
        profile = doctor["doctorProfile"]
        if specialty_filter and profile.get("specialty") != specialty_filter:
            continue
        if location_filter and profile.get("city") != location_filter:
            continue
        if language_filter and language_filter not in profile.get("languages", []):
            continue
        normalised.append(doctor)
    normalised.sort(key=lambda item: (item["doctorProfile"].get("city", ""), item.get("lastName", "")))

    LOGGER.info("doctors loaded", extra={"count": len(normalised)})
    return json_response({"items": normalised})
