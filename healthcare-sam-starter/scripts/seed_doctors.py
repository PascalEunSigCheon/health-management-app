"""Seed doctor profiles into the Users DynamoDB table."""
from __future__ import annotations

import argparse
import json
from datetime import datetime
from typing import List

import boto3


def seed_doctors(table_name: str, doctors: List[dict]) -> None:
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(table_name)
    with table.batch_writer() as batch:
        for doctor in doctors:
            record = {
                "userId": doctor["userId"],
                "email": doctor["email"],
                "role": "DOCTOR",
                "firstName": doctor.get("firstName", ""),
                "lastName": doctor.get("lastName", ""),
                "specialty": doctor.get("specialty"),
                "languages": ",".join(doctor.get("languages", [])),
                "location": doctor.get("location"),
                "createdAt": datetime.utcnow().isoformat(),
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
