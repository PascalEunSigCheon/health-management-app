from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict

import boto3

s3_client = boto3.client("s3")
BUCKET_NAME = os.environ["CURATED_BUCKET_NAME"]


def lambda_handler(event: Dict[str, Any], _context: Any):
    records = event.get("Records") or [event]
    for record in records:
        detail = record.get("detail") or {}
        timestamp = datetime.now(timezone.utc)
        date_partition = timestamp.strftime("%Y-%m-%d")
        key = (
            f"domain=appointments/dt={date_partition}/"
            f"part=event-{timestamp.strftime('%H%M%S')}-{uuid.uuid4().hex}.json"
        )
        body = json.dumps(detail).encode("utf-8")
        s3_client.put_object(Bucket=BUCKET_NAME, Key=key, Body=body)

    return {"written": len(records)}
