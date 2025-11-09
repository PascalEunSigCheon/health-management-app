import os
import sys
from typing import Any, Dict, List

from boto3.dynamodb.conditions import Attr

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, os.pardir))
if PARENT_DIR not in sys.path:
    sys.path.append(PARENT_DIR)

from common import json_response, require_role, users_table  # noqa: E402


def normalise_doctor(item: Dict[str, Any]) -> Dict[str, Any]:
    profile = item.get("doctorProfile") or {}
    if not profile:
        legacy = {
            "specialty": item.get("specialty"),
            "languages": item.get("languages"),
            "city": item.get("location"),
        }
        profile = {k: v for k, v in legacy.items() if v}
    languages = profile.get("languages")
    if isinstance(languages, str):
        profile["languages"] = [lang.strip() for lang in languages.split(",") if lang.strip()]
    profile.setdefault("languages", [])
    profile.setdefault("availSlots", [])
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
    response = users_table.scan(FilterExpression=Attr("role").eq("DOCTOR"))
    items: List[Dict[str, Any]] = response.get("Items", [])

    normalised: List[Dict[str, Any]] = []
    for item in items:
        doctor = normalise_doctor(item)
        profile = doctor["doctorProfile"]
        specialty = params.get("specialty")
        city = params.get("city")
        language = params.get("language")
        if specialty and profile.get("specialty") != specialty:
            continue
        if city and profile.get("city") != city:
            continue
        if language and language not in profile.get("languages", []):
            continue
        normalised.append(doctor)
    normalised.sort(key=lambda item: (item["doctorProfile"].get("city", ""), item.get("lastName", "")))

    return json_response({"items": normalised})
