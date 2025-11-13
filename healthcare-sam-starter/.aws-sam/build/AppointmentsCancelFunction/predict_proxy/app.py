from __future__ import annotations

import json
import logging
import os
import sys
from typing import Any, Dict

import urllib.request

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, os.pardir))
if PARENT_DIR not in sys.path:
    sys.path.append(PARENT_DIR)

from common import json_response  # noqa: E402

LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

# Default to the known model URL; override with environment variable if needed
MODEL_URL = os.environ.get("DIABETES_MODEL_URL", "https://kydqfodd48.execute-api.eu-west-3.amazonaws.com/default/test-model-endpoint")


def lambda_handler(event: Dict[str, Any], _context: Any):
    """Proxy POST requests to the external model endpoint and return the model response.

    This Lambda adds proper CORS headers via `json_response` and helps avoid browser CORS issues
    by having the frontend call the same origin API Gateway URL which can be configured with CORS.
    """
    try:
        body = event.get("body") or ""
        if event.get("isBase64Encoded"):
            # If API Gateway base64-encodes the body, decode it
            import base64

            body = base64.b64decode(body)
        # Forward the body exactly to the model endpoint
        req = urllib.request.Request(MODEL_URL, data=body.encode("utf-8") if isinstance(body, str) else body, method="POST")
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read()
            try:
                parsed = json.loads(raw)
            except Exception:
                parsed = {"raw": raw.decode("utf-8", errors="replace")}
            status = getattr(resp, "status", 200)
            return json_response(parsed, status)
    except urllib.error.HTTPError as he:
        try:
            payload = he.read()
            parsed = json.loads(payload)
        except Exception:
            parsed = {"error": str(he), "body": payload.decode("utf-8", errors="replace")}
        LOGGER.exception("Model proxy HTTP error")
        return json_response({"message": "model proxy error", "detail": parsed}, 502)
    except Exception as exc:  # broad except for robustness
        LOGGER.exception("Model proxy failed")
        return json_response({"message": "model proxy failed", "detail": str(exc)}, 502)
