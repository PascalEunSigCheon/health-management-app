"""Seed doctor profiles into the Users DynamoDB table."""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta
from typing import List, Dict, Any
import random
from collections import defaultdict
import boto3


def generate_slots(days: int = 3, interval_minutes: int = 30) -> List[str]:
    start = datetime.utcnow()
    slots: List[str] = []
    days_generated = 0
    day_offset = 0
    while days_generated < days:
        current = start + timedelta(days=day_offset)
        day_offset += 1
        # skip weekends
        if current.weekday() >= 5:
            continue
        for hour in range(9, 17):
            for minute in range(0, 60, interval_minutes):
                slot = current.replace(hour=hour, minute=minute, second=0, microsecond=0)
                # Match the format that appointments_create expects: ISO + Z
                slots.append(slot.isoformat() + "Z")
        days_generated += 1
    return slots


def ensure_min_per_specialty(doctors: List[Dict[str, Any]], min_count: int = 2) -> List[Dict[str, Any]]:
    by_spec = defaultdict(list)
    for d in doctors:
        by_spec[d.get("specialty", "General")].append(d)

    augmented = list(doctors)
    for spec, docs in by_spec.items():
        needed = max(0, min_count - len(docs))
        for i in range(needed):
            base = random.choice(docs)
            clone = dict(base)
            suffix = f"-auto-{i+1}"
            clone["userId"] = (clone.get("userId") or clone["email"]) + suffix
            local = clone["email"].split("@")
            clone["email"] = f"{local[0]}{suffix}@{local[1]}"
            clone["firstName"] = base.get("firstName", "Doc")
            clone["lastName"] = (base.get("lastName") or "Clone") + f"{i+1}"
            augmented.append(clone)
    return augmented


def seed_doctors(table_name: str, doctors: List[Dict[str, Any]]) -> None:
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(table_name)
    with table.batch_writer() as batch:
        for doctor in doctors:
            user_id = doctor.get("userId") or doctor["email"]
            profile = doctor.get("doctorProfile") or {
                "specialty": doctor.get("specialty"),
                # languages are no longer part of the simplified doctor profile
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
                "createdAt": datetime.utcnow().isoformat() + "Z",
                "doctorProfile": profile,
            }
            batch.put_item(Item=record)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--table", required=True, help="Users table name")
    parser.add_argument("--min-per-specialty", type=int, default=0,
                        help="Ensure at least N doctors per specialty by cloning examples")
    parser.add_argument("--input", required=False, help="Path to a JSON file with doctor entries")
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
                "city": "Virtual",  # was 'location'
            }
        ]

    if args.min_per_specialty and args.min_per_specialty > 0:
        doctors = ensure_min_per_specialty(doctors, args.min_per_specialty)

    seed_doctors(args.table, doctors)
    print(f"Seeded {len(doctors)} doctor profiles into {args.table}")
