"""Seed doctor profiles into the Users DynamoDB table."""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta
from typing import List

import boto3


def generate_slots(days: int = 14, interval_minutes: int = 30) -> List[str]:
    start = datetime.utcnow()
    slots: List[str] = []
    for offset in range(days):
        current = start + timedelta(days=offset)
        if current.weekday() >= 5:
            continue
        for hour in range(9, 17):
            for minute in range(0, 60, interval_minutes):
                slot = current.replace(hour=hour, minute=minute, second=0, microsecond=0)
                slots.append(slot.isoformat() + "Z")
    return slots


def seed_doctors(table_name: str, doctors: List[dict]) -> None:
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(table_name)
    with table.batch_writer() as batch:
        for doctor in doctors:
            user_id = doctor.get("userId") or doctor["email"]
            profile = doctor.get("doctorProfile") or {
                "specialty": doctor.get("specialty"),
                "languages": doctor.get("languages", []),
                "city": doctor.get("city"),
            }
            if "availSlots" not in profile:
                profile["availSlots"] = generate_slots()
            record = {
                "userId": user_id,
                "email": doctor["email"],
                "role": "DOCTOR",
                "firstName": doctor.get("firstName", ""),
                "lastName": doctor.get("lastName", ""),
                "createdAt": datetime.utcnow().isoformat(),
                "doctorProfile": profile,
            }
            batch.put_item(Item=record)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--table", required=True, help="Users table name")
    parser.add_argument(
        "--input",
        required=False,
        help="Path to a JSON file with doctor entries",
    )
    args = parser.parse_args()

    if args.input:
        with open(args.input, "r", encoding="utf-8") as handle:
            doctors = json.load(handle)
    else:
        doctors = [
            {
                "userId": "doctor-001",
                "email": "demo-doctor@example.com",
                "firstName": "Demo",
                "lastName": "Doctor",
                "specialty": "General Medicine",
                "languages": ["English"],
                "location": "Virtual",
            }
        ]

    seed_doctors(args.table, doctors)
    print(f"Seeded {len(doctors)} doctor profiles into {args.table}")
