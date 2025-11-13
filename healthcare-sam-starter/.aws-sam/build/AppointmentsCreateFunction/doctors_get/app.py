import logging
import os
import sys
from typing import Any, Dict, List

from boto3.dynamodb.conditions import Attr

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, os.pardir))
if PARENT_DIR not in sys.path:
    sys.path.append(PARENT_DIR)

from common import json_response, require_role, users_table  # noqa: E402


LOGGER = logging.getLogger(__name__)


def normalise_doctor(item: Dict[str, Any]) -> Dict[str, Any]:
    """Convert the raw DynamoDB item into a doctor dictionary.

    In the simplified model, languages are no longer stored or returned. The
    function ensures a doctorProfile exists with at least `specialty`, `city`
    and `availSlots` keys.
    """
    profile: Dict[str, Any] = item.get("doctorProfile") or {}
    # Fallback to legacy flat attributes if doctorProfile is absent.
    if not profile:
        legacy = {
            "specialty": item.get("specialty"),
            # languages removed
            "city": item.get("location"),
        }
        profile = {k: v for k, v in legacy.items() if v}
    
    # Normalize city/location: ensure city is always populated from either source
    city = profile.get("city") or profile.get("location") or item.get("location") or ""
    if city:
        profile["city"] = city
    
    # Ensure availSlots is a list
    avail_slots = profile.get("availSlots", [])
    if not isinstance(avail_slots, list):
        avail_slots = []
    profile["availSlots"] = avail_slots
    
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
    # languages are no longer used in queries
    language_filter = ""

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
            },
        },
    )

    try:
        response = users_table.scan(FilterExpression=Attr("role").eq("DOCTOR"))
    except Exception as exc:  # pylint: disable=broad-except
        LOGGER.exception("users table scan failed")
        return json_response({"message": "unable to load doctors"}, 500)

    normalised: List[Dict[str, Any]] = []
    for item in response.get("Items", []):
        doctor = normalise_doctor(item)
        profile = doctor["doctorProfile"]
        if specialty_filter and (profile.get("specialty") or "").strip().casefold() != specialty_filter.strip().casefold():
            continue
        if location_filter and (profile.get("city") or "").strip().casefold() != location_filter.strip().casefold():
            continue
        # language_filter is always empty because languages have been removed
        normalised.append(doctor)
    normalised.sort(key=lambda item: (item["doctorProfile"].get("city") or "", item.get("lastName") or ""))

    LOGGER.info("doctors loaded", extra={"count": len(normalised)})
    return json_response({"items": normalised}, 200)
