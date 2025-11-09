from __future__ import annotations

import argparse
import json
from datetime import datetime
from typing import List

import boto3


def seed_patients(table_name: str, patients: List[dict]) -> None:
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(table_name)
    with table.batch_writer() as batch:
        for patient in patients:
            record = {
                "userId": patient["userId"],
                "email": patient["email"],
                "role": "PATIENT",
                "firstName": patient.get("firstName", ""),
                "lastName": patient.get("lastName", ""),
                "createdAt": datetime.utcnow().isoformat(),
            }
            if "metrics" in patient:
                record["latestMetrics"] = patient["metrics"]
            batch.put_item(Item=record)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--table", required=True, help="Users table name")
    parser.add_argument("--input", help="Path to JSON file with patient entries")
    args = parser.parse_args()

    if args.input:
        with open(args.input, "r", encoding="utf-8") as handle:
            patients = json.load(handle)
    else:
        patients = [
            {
                "userId": "patient-demo-1",
                "email": "patient.one@example.com",
                "firstName": "Patient",
                "lastName": "One",
            },
            {
                "userId": "patient-demo-2",
                "email": "patient.two@example.com",
                "firstName": "Patient",
                "lastName": "Two",
            },
        ]

    seed_patients(args.table, patients)
    print(f"Seeded {len(patients)} patient profiles into {args.table}")
