"""FHIR R4 transaction delivery. Returned resource locations are required for success."""

import copy
import os
from urllib.parse import urlparse
import httpx


def transaction(bundle):
    result = copy.deepcopy(bundle)
    result["type"] = "transaction"
    mapping = {
        e["fullUrl"]: f"{e['resource']['resourceType']}/{e['resource']['id']}"
        for e in result["entry"]
    }

    def rewrite(node):
        if isinstance(node, dict):
            for key, value in node.items():
                if key == "reference" and value in mapping:
                    node[key] = mapping[value]
                else:
                    rewrite(value)
        elif isinstance(node, list):
            for item in node:
                rewrite(item)

    rewrite(result)
    for entry in result["entry"]:
        entry["request"] = {
            "method": "PUT",
            "url": f"{entry['resource']['resourceType']}/{entry['resource']['id']}",
        }
    return result


def deliver(bundle, client=None):
    endpoint = os.environ.get("FHIR_BASE_URL", "").rstrip("/")
    if not endpoint:
        raise ValueError(
            "FHIR_BASE_URL is not configured; nothing has been sent to a hospital"
        )
    parsed = urlparse(endpoint)
    if parsed.scheme != "https" and not (
        parsed.scheme == "http"
        and parsed.hostname in ("localhost", "127.0.0.1", "hapi-fhir")
    ):
        raise ValueError(
            "FHIR destination must use HTTPS, except an explicitly configured local HAPI server"
        )
    headers = {
        "Content-Type": "application/fhir+json",
        "Accept": "application/fhir+json",
    }
    if os.environ.get("FHIR_BEARER_TOKEN"):
        headers["Authorization"] = "Bearer " + os.environ["FHIR_BEARER_TOKEN"]
    tx = transaction(bundle)
    with httpx.Client(timeout=20) if client is None else _existing(client) as transport:
        # Validate the exact transaction before persistence. No claim of ABDM conformance.
        checked = transport.post(endpoint + "/$validate", json=tx, headers=headers)
        checked.raise_for_status()
        outcome = checked.json()
        if outcome.get("resourceType") != "OperationOutcome":
            raise ValueError("Validator did not return an OperationOutcome")
        if any(
            i.get("severity") in ("fatal", "error") for i in outcome.get("issue", [])
        ):
            raise ValueError(
                "FHIR server validation rejected the transaction: "
                + str(outcome.get("issue"))[:2000]
            )
        response = transport.post(endpoint, json=tx, headers=headers)
        response.raise_for_status()
        body = response.json()
    if body.get("type") != "transaction-response" or len(body.get("entry", [])) != len(
        tx["entry"]
    ):
        raise ValueError("FHIR server did not confirm a complete transaction")
    receipts = []
    for entry in body["entry"]:
        received = entry.get("response", {})
        status = received.get("status", "")
        if not status.startswith(("200", "201", "204")) or not received.get("location"):
            raise ValueError("FHIR transaction contains a failed or unconfirmed entry")
        receipts.append(
            {
                "status": status,
                "location": received["location"],
                "etag": received.get("etag"),
            }
        )
    return {
        "status": "delivered",
        "destination": endpoint,
        "resources": receipts,
        "validation": "Configured server $validate accepted this R4 transaction; ABDM profile certification is not asserted",
        "idempotency": "PUT stable resource IDs; retries replace the same approved resource versions",
    }


class _existing:
    def __init__(self, client):
        self.client = client

    def __enter__(self):
        return self.client

    def __exit__(self, *args):
        return False
