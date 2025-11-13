import json
import logging
import os
from datetime import datetime, timedelta
from typing import Any, Dict

import boto3

LOGGER = logging.getLogger()
LOGGER.setLevel(os.getenv("LOG_LEVEL", "INFO"))

dynamodb = boto3.resource("dynamodb")
users_table = dynamodb.Table(os.environ["USERS_TABLE_NAME"])

# A Cognito client is used to assign newly confirmed users to the appropriate
# group based on their role.  The user pool ID is passed in via an
# environment variable and set in template.yaml.  Without this group
# assignment the HTTP API authorizer will treat new users as unauthorised and
# return 403 (forbidden) even if they successfully sign up.
cognito_idp = boto3.client("cognito-idp")

ALLOWED_SPECIALTIES = {
    "Cardiology",
    "Dermatology",
    "General Medicine",
    "Pulmonology",
    "Gastroenterology",
    "Orthopedics",
    "Neurology",
    "Pediatrics",
    "Ophthalmology",
    "ENT",
}

# Languages are no longer collected for doctors in the simplified application.
ALLOWED_LANGUAGES: set[str] = set()
ALLOWED_CITIES = {"Paris", "Lyon", "Marseille", "Toulouse", "Nice", "Virtual"}


def parse_doctor_profile(role: str, attributes: Dict[str, Any], metadata: Dict[str, Any]) -> Dict[str, Any]:
    """Parse a doctor's profile from Cognito attributes and client metadata.

    In the simplified application doctors only specify their specialty, primary
    city and a set of availability slots. Languages are no longer captured.

    To avoid hitting the Cognito custom attribute size limit, the default
    availability window is reduced to three business days (Mon–Fri) with
    30‑minute increments between 09:00 and 17:00.
    """
    if role != "DOCTOR":
        return {}

    specialty = attributes.get("custom:specialty") or metadata.get("doctorSpecialty")
    city = attributes.get("custom:location") or metadata.get("doctorCity")
    availability_raw = attributes.get("custom:availability") or metadata.get("doctorSlots")

    # Parse any slots that were passed in metadata or custom attributes.
    avail_slots: list[str] = []
    if availability_raw:
        try:
            decoded = json.loads(availability_raw)
            if isinstance(decoded, list):
                avail_slots = [slot for slot in decoded if isinstance(slot, str)]
        except json.JSONDecodeError:
            LOGGER.warning("Invalid slot payload in doctor availability metadata")

    # If no slots were provided, generate a default schedule. Use only the
    # next three business days to keep the custom attribute well under
    # Cognito's 2048 character limit.
    if not avail_slots:
        now = datetime.utcnow()
        days_generated = 0
        day_offset = 0
        while days_generated < 3:
            day = now + timedelta(days=day_offset)
            day_offset += 1
            if day.weekday() >= 5:
                continue
            for hour in range(9, 17):
                for minute in (0, 30):
                    slot = day.replace(hour=hour, minute=minute, second=0, microsecond=0)
                    avail_slots.append(slot.isoformat() + "Z")
            days_generated += 1

    profile: Dict[str, Any] = {}
    if specialty in ALLOWED_SPECIALTIES:
        profile["specialty"] = specialty
    if city in ALLOWED_CITIES:
        profile["city"] = city
    # Languages have been removed from the data model.
    if avail_slots:
        profile["availSlots"] = avail_slots

    return profile


def lambda_handler(event: Dict[str, Any], _context: Any) -> Dict[str, Any]:
    LOGGER.debug("Post confirmation event: %s", json.dumps(event))

    user_attributes = event.get("request", {}).get("userAttributes", {})
    client_metadata = event.get("request", {}).get("clientMetadata", {})
    sub = user_attributes.get("sub")
    email = user_attributes.get("email")
    role = user_attributes.get("custom:role") or user_attributes.get("role")
    first_name = user_attributes.get("given_name", "")
    last_name = user_attributes.get("family_name", "")

    if not sub or not email:
        LOGGER.error("Missing sub or email in post confirmation event")
        raise ValueError("Missing required user attributes")

    doctor_profile = parse_doctor_profile(role or "PATIENT", user_attributes, client_metadata or {})

    item = {
        "userId": sub,
        "email": email,
        "role": role or "PATIENT",
        "firstName": first_name,
        "lastName": last_name,
        "createdAt": datetime.utcnow().isoformat(),
    }

    if doctor_profile:
        item["doctorProfile"] = doctor_profile

    users_table.put_item(Item=item)

    # Add the new user to the appropriate Cognito group.  The API authorizer
    # relies on group membership (PATIENT/DOCTOR) rather than the role claim
    # alone.  If the group does not exist this call will raise an exception
    # which is logged but does not prevent the sign up flow from completing.
    try:
        # Derive the user pool ID from the event payload.  Cognito post‑confirmation
        # events include a `userPoolId` top‑level field.  Using this value avoids
        # having to reference the CognitoUserPool resource via an environment
        # variable, which can create circular dependencies in CloudFormation.
        pool_id = event.get("userPoolId")
        # Determine the group name from the custom role.  Default to PATIENT
        # if the attribute is missing.
        group_name = (role or "PATIENT").upper()
        if pool_id and group_name in {"PATIENT", "DOCTOR"}:
            cognito_idp.admin_add_user_to_group(
                UserPoolId=pool_id,
                Username=email,
                GroupName=group_name,
            )
            LOGGER.info(
                "Added user %s to Cognito group %s", email, group_name
            )
    except Exception as exc:
        # Log the failure but don't block the confirmation flow
        LOGGER.error(
            "Failed to add user %s to group %s: %s", email, role, exc
        )

    return event
