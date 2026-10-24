import importlib.util
from pathlib import Path
import sys
import httpx
import pytest
from fastapi.testclient import TestClient
from services.workflows import main
from services.workflows import platform
from services.interoperability.fhir.client import transaction, deliver
from services.recommendation.engine import similar_profiles
from services.audit import store


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DB_PATH", tmp_path / "workflow.sqlite3")
    monkeypatch.setattr(store, "DB", tmp_path / "audit.sqlite3")
    return TestClient(main.app)


def test_stale_review_is_rejected(client):
    url = "/api/v1/workflows/patients/P001"
    state = client.get(url).json()
    entity = state["entities"][0]
    body = {
        "actor": "Test reviewer",
        "action": "accept",
        "expected_version": state["version"],
    }
    assert (
        client.post(url + f'/entities/{entity["id"]}/review', json=body).status_code
        == 200
    )
    assert (
        client.post(url + f'/entities/{entity["id"]}/review', json=body).status_code
        == 409
    )


def test_similar_profile_distances_and_isolation():
    result = similar_profiles("P001")
    assert len(result["cases"]) == 5
    distances = [c["distance"] for c in result["cases"]]
    assert distances == sorted(distances)
    assert all(
        c["patient_id"] != "P001" and not c["outcome_available"]
        for c in result["cases"]
    )


def test_transaction_refs_and_real_receipts(monkeypatch):
    monkeypatch.setenv("FHIR_BASE_URL", "http://localhost:8090/fhir")
    bundle = {
        "resourceType": "Bundle",
        "type": "collection",
        "entry": [
            {
                "fullUrl": "urn:patient:P001",
                "resource": {"resourceType": "Patient", "id": "P001"},
            },
            {
                "fullUrl": "urn:uuid:obs",
                "resource": {
                    "resourceType": "Observation",
                    "id": "obs",
                    "subject": {"reference": "urn:patient:P001"},
                },
            },
        ],
    }
    tx = transaction(bundle)
    assert tx["entry"][1]["resource"]["subject"]["reference"] == "Patient/P001"
    assert bundle["type"] == "collection"
    requests = []

    def server(request):
        requests.append(request)
        if request.url.path.endswith("$validate"):
            return httpx.Response(
                200, json={"resourceType": "OperationOutcome", "issue": []}
            )
        return httpx.Response(
            200,
            json={
                "resourceType": "Bundle",
                "type": "transaction-response",
                "entry": [
                    {
                        "response": {
                            "status": "200 OK",
                            "location": "Patient/P001/_history/2",
                        }
                    },
                    {
                        "response": {
                            "status": "201 Created",
                            "location": "Observation/obs/_history/1",
                        }
                    },
                ],
            },
        )

    with httpx.Client(transport=httpx.MockTransport(server)) as transport:
        receipt = deliver(bundle, transport)
    assert len(requests) == 2 and receipt["status"] == "delivered"
    assert receipt["resources"][0]["location"].endswith("_history/2")

    def bad(request):
        return httpx.Response(
            200,
            json={
                "resourceType": "OperationOutcome",
                "issue": [{"severity": "error", "diagnostics": "rejected"}],
            },
        )

    with httpx.Client(transport=httpx.MockTransport(bad)) as transport:
        with pytest.raises(ValueError):
            deliver(bundle, transport)


def test_alert_state_machine_and_version(client, monkeypatch):
    pid = "P001"
    url = "/api/v1/workflows/patients/" + pid
    key = "fixture-alert"
    item = {
        "id": key,
        "patient_id": pid,
        "status": "new",
        "version": 1,
        "escalated": False,
        "escalate_at": "2099-01-01T00:00:00+00:00",
        "created_at": "2026-10-24T00:00:00+00:00",
        "history": [],
    }
    import json

    with main.database() as db:
        platform.alert_table(db)
        db.execute("INSERT INTO alerts VALUES(?,?,?)", (key, pid, json.dumps(item)))
    body = {
        "actor": "Test reviewer",
        "expected_alert_version": 1,
        "action": "resolve",
        "note": "reviewed",
    }
    assert client.post(url + "/alerts/" + key + "/action", json=body).status_code == 409
    body["action"] = "acknowledge"
    assert client.post(url + "/alerts/" + key + "/action", json=body).status_code == 200
    assert client.post(url + "/alerts/" + key + "/action", json=body).status_code == 409
    body.update(action="resolve", expected_alert_version=2)
    assert (
        client.post(url + "/alerts/" + key + "/action", json=body).json()["status"]
        == "resolved"
    )
    assert client.get(url.replace(pid, "P002") + "/alerts").json() == []


def test_context_boundaries_and_nested_spans():
    folder = Path(__file__).resolve().parents[1] / "services/clinical-processing/nlp"
    sys.path.insert(0, str(folder))
    from extractor import ClinicalEntityExtractor
    from nlp_models import NLPInput

    result = ClinicalEntityExtractor().extract(
        NLPInput(
            document_id="context",
            text="No pneumonia. Type 2 diabetes mellitus. History of TB; no penicillin allergy. Possible hypertension but diabetes is confirmed.",
        )
    )
    spans = {e.span_text.lower(): e for e in result.entities}
    assert spans["pneumonia"].negation_status
    assert not spans["type 2 diabetes mellitus"].negation_status
    assert spans["tb"].temporal_status == "HISTORICAL"
    assert spans["penicillin allergy"].negation_status
    assert spans["hypertension"].certainty == "SUSPECTED"
    assert spans["diabetes"].certainty == "CONFIRMED"


def test_alert_evaluation_deduplicates_groups_and_suppresses_stale(client, monkeypatch):
    prediction = {
        "calibrated_spike_probability": 0.8,
        "optimal_decision_threshold": 0.22,
        "model_applicable": True,
        "model_provenance": {"sha256": "frozen-model"},
    }

    class ModelClient:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def get(self, *args, **kwargs):
            return httpx.Response(
                200,
                json=prediction,
                request=httpx.Request("GET", "http://localhost/predict"),
            )

    monkeypatch.setattr(platform.httpx, "Client", lambda **kwargs: ModelClient())
    url = "/api/v1/workflows/patients/P001/alerts/evaluate"
    body = {
        "actor": "Test reviewer",
        "decision_time": "2021-01-01T10:00:00",
        "replay": True,
    }
    assert client.post(url, json=body).json()["created"]
    assert "already" in client.post(url, json=body).json()["reason"]
    body["decision_time"] = "2021-01-01T10:10:00"
    assert "cooldown" in client.post(url, json=body).json()["reason"]
    body["replay"] = False
    assert "Stale" in client.post(url, json=body).json()["reason"]
    body.update(replay=True, decision_time="2021-01-02T10:10:00")
    prediction["calibrated_spike_probability"] = 0.01
    assert "below" in client.post(url, json=body).json()["reason"]
