#!/usr/bin/env python3
"""
Test the appointment creation Lambda locally to diagnose the 500 error.
This test will help identify what's failing without needing to deploy to AWS.
"""

import sys
import json
import os
from datetime import datetime, timezone
from typing import Any, Dict

# Simulate the environment
os.environ["USERS_TABLE_NAME"] = "health-users-dev"
os.environ["APPOINTMENTS_TABLE_NAME"] = "health-appointments-dev"
os.environ["PATIENT_HEALTH_INDEX_TABLE_NAME"] = "health-patient-index-dev"
os.environ["LOG_LEVEL"] = "DEBUG"

print("=" * 80)
print("APPOINTMENT CREATION LOGIC TEST (LOCAL)")
print("=" * 80)

# Test the critical functions without needing AWS/DynamoDB

def compute_bmi(height_cm: float, weight_kg: float) -> float | None:
    try:
        meters = float(height_cm) / 100
        weight = float(weight_kg)
        if meters <= 0:
            return None
        return round(weight / (meters * meters), 1)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def sanitize_vitals(vitals: Dict[str, Any]) -> Dict[str, Any]:
    """
    Same logic as the Lambda handler.
    """
    MANDATORY_VITAL_FIELDS = {
        "heightCm",
        "weightKg",
        "temperatureC",
    }
    
    if not isinstance(vitals, dict):
        raise ValueError("vitals must be an object")
    
    summary: Dict[str, Any] = {}
    
    # Check mandatory fields
    for field in MANDATORY_VITAL_FIELDS:
        value = vitals.get(field)
        if value is None:
            raise ValueError(f"Missing vital: {field}")
        try:
            summary[field] = float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid numeric value for {field}") from exc
    
    # Add extra fields
    for key, value in vitals.items():
        if key in summary:
            continue
        if isinstance(value, (int, float)):
            summary[key] = float(value)
        elif isinstance(value, str):
            summary[key] = value[:120]
    
    # Compute BMI if not present
    bmi = summary.get("bmi")
    if bmi is None:
        computed = compute_bmi(summary["heightCm"], summary["weightKg"])
        if computed is not None:
            summary["bmi"] = computed
    
    return summary


# Test 1: Vitals validation
print("\n📝 TEST 1: Vitals Sanitization")
print("-" * 80)

test_vitals = [
    {
        "name": "Valid vitals",
        "data": {
            "heightCm": 175,
            "weightKg": 70,
            "temperatureC": 36.5,
        },
        "expect_pass": True,
    },
    {
        "name": "Missing temperature",
        "data": {
            "heightCm": 175,
            "weightKg": 70,
        },
        "expect_pass": False,
    },
    {
        "name": "Invalid height (string)",
        "data": {
            "heightCm": "invalid",
            "weightKg": 70,
            "temperatureC": 36.5,
        },
        "expect_pass": False,
    },
    {
        "name": "With extra fields",
        "data": {
            "heightCm": 175,
            "weightKg": 70,
            "temperatureC": 36.5,
            "notes": "Patient reports feeling fine",
        },
        "expect_pass": True,
    },
]

for test in test_vitals:
    try:
        result = sanitize_vitals(test["data"])
        if test["expect_pass"]:
            print(f"✅ {test['name']}")
            print(f"   BMI computed: {result.get('bmi')}")
            print(f"   Fields: {list(result.keys())}")
        else:
            print(f"❌ {test['name']} - expected to fail but passed")
            print(f"   Result: {result}")
    except ValueError as exc:
        if not test["expect_pass"]:
            print(f"✅ {test['name']} - failed as expected: {exc}")
        else:
            print(f"❌ {test['name']} - unexpected error: {exc}")

# Test 2: Mock appointment payload structure
print("\n📝 TEST 2: Frontend Payload Structure")
print("-" * 80)

mock_payload = {
    "doctorId": "cardio.demo1",
    "slotISO": "2025-11-14T09:00:00Z",
    "vitals": {
        "heightCm": 175,
        "weightKg": 70,
        "temperatureC": 36.5,
    },
    "reasonCode": "GENERAL",
}

print("Frontend sends:")
print(json.dumps(mock_payload, indent=2))

print("\nValidating payload...")
try:
    if not mock_payload.get("doctorId"):
        raise ValueError("doctorId required")
    if not mock_payload.get("slotISO"):
        raise ValueError("slotISO required")
    
    summary = sanitize_vitals(mock_payload.get("vitals") or {})
    print(f"✅ Vitals sanitized successfully")
    print(f"   Summary: {json.dumps(summary, indent=2)}")
except ValueError as exc:
    print(f"❌ Validation failed: {exc}")

# Test 3: Common failure scenarios
print("\n📝 TEST 3: Common Failure Scenarios")
print("-" * 80)

failures = [
    {
        "name": "Missing vitals object",
        "payload": {
            "doctorId": "cardio.demo1",
            "slotISO": "2025-11-14T09:00:00Z",
            "vitals": None,
            "reasonCode": "GENERAL",
        },
        "expected_error": "Missing vital",
    },
    {
        "name": "Empty vitals",
        "payload": {
            "doctorId": "cardio.demo1",
            "slotISO": "2025-11-14T09:00:00Z",
            "vitals": {},
            "reasonCode": "GENERAL",
        },
        "expected_error": "Missing vital",
    },
    {
        "name": "Malformed ISO slot",
        "payload": {
            "doctorId": "cardio.demo1",
            "slotISO": "2025-13-32T09:00:00Z",  # Invalid date
            "vitals": {
                "heightCm": 175,
                "weightKg": 70,
                "temperatureC": 36.5,
            },
            "reasonCode": "GENERAL",
        },
        "expected_error": "slot",
    },
]

for fail_test in failures:
    print(f"\n{fail_test['name']}:")
    payload = fail_test["payload"]
    try:
        if not payload.get("doctorId") or not payload.get("slotISO"):
            raise ValueError("doctorId and slotISO required")
        sanitize_vitals(payload.get("vitals") or {})
        print(f"  ⚠️  No validation error (might be caught by AWS)")
    except ValueError as exc:
        error_msg = str(exc)
        if fail_test["expected_error"].lower() in error_msg.lower():
            print(f"  ✅ Expected error caught: {error_msg}")
        else:
            print(f"  ❌ Wrong error: {error_msg}")

# Test 4: JSON serialization
print("\n📝 TEST 4: JSON Serialization")
print("-" * 80)

vitals_result = sanitize_vitals({
    "heightCm": 175,
    "weightKg": 70,
    "temperatureC": 36.5,
})

try:
    serialized = json.dumps(vitals_result)
    deserialized = json.loads(serialized)
    print(f"✅ JSON serialization works")
    print(f"   Original type: {type(vitals_result)}")
    print(f"   Serialized length: {len(serialized)} bytes")
    print(f"   Deserialized: {deserialized}")
except Exception as exc:
    print(f"❌ JSON serialization failed: {exc}")

print("\n" + "=" * 80)
print("SUMMARY")
print("=" * 80)
print("""
If all tests pass, the Lambda logic is sound and the 500 error is likely due to:

1. **DynamoDB access / IAM permissions** - Lambda cannot read/write to tables
2. **User not found** - The doctor_id doesn't exist in DynamoDB
3. **Network / AWS SDK issue** - boto3 not installed or AWS credentials missing
4. **Unhandled exception** - Check CloudWatch logs for the full stack trace

NEXT STEPS:
- Check AWS CloudWatch logs for the health-appointments-dev Lambda execution
- Verify IAM role has DynamoDB permissions (GetItem, Query, PutItem, etc.)
- Ensure test/demo doctors are seeded in the DynamoDB Users table
- If running locally with sam local, ensure Docker is running and tables are configured
""")

print("\n" + "=" * 80)
