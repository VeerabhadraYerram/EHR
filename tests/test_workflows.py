"""Integration checks for local persisted review boundaries; no external services."""
import hashlib
import json
from pathlib import Path
import sys
import uuid

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services.workflows import main as workflows


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(workflows, "DB_PATH", tmp_path / "review.sqlite3")
    return TestClient(workflows.app)


URL = "/api/v1/workflows/patients/P002"
ACTOR = {"actor": "Test clinician"}


def verify_all(client):
    state = client.get(URL).json()
    for entity in state["entities"]:
        if entity["status"] == "pending":
            assert client.post(f'{URL}/entities/{entity["id"]}/review', json={**ACTOR, "action": "accept"}).status_code == 200


def test_patient_isolation_and_unknown_patient(client):
    first = client.get(URL).json()
    second = client.get(URL.replace("P002", "P003")).json()
    assert first["patient_id"] != second["patient_id"]
    assert set(e["id"] for e in first["entities"]).isdisjoint(e["id"] for e in second["entities"])
    assert client.get(URL.replace("P002", "unknown")).status_code == 404
    assert all(e["status"] == "pending" for e in first["entities"])


def test_review_gates_and_original_values_survive(client):
    entity = client.get(URL).json()["entities"][0]
    assert client.post(URL + "/fhir/approve", json=ACTOR).status_code == 409
    assert client.post(URL + "/documents", json={**ACTOR, "kind": "discharge_summary", "finalize": True}).status_code == 409
    assert client.post(f'{URL}/entities/{entity["id"]}/review', json={**ACTOR, "action": "edit", "value": " "}).status_code == 422
    edited = client.post(f'{URL}/entities/{entity["id"]}/review', json={**ACTOR, "action": "edit", "value": "Updated clinical description"}).json()
    assert edited["original"] == entity["value"]
    assert edited["value"] == "Updated clinical description"
    assert client.get(URL).json()["entities"][0]["status"] == "edited"
    audit = client.get(URL + "/audit").json()
    assert any(e["action"] == "entity.edit" and e["detail"]["before"]["value"] == entity["value"] for e in audit)


def test_duplicates_preserve_provenance_and_conflicts_block(client):
    entity = client.get(URL).json()["entities"][1]
    item = {**ACTOR, **{k: entity[k] for k in ["kind", "code", "label", "value", "unit", "observed_at"]}, "source": "external-lab-source"}
    added = client.post(URL + "/entities", json=item).json()
    group = client.get(URL).json()["deduplication"][0]
    assert group["kind"] == "duplicate"
    merged = client.post(URL + "/merge", json={**ACTOR, "entity_ids": [entity["id"], added["id"]]}).json()
    assert "external-lab-source" in merged["sources"]
    assert merged["status"] == "pending"
    client.post(URL + "/entities", json={**item, "value": "999", "source": "conflicting-source"})
    assert client.get(URL).json()["deduplication"][0]["kind"] == "conflict"
    verify_all(client)
    assert client.post(URL + "/fhir/approve", json=ACTOR).status_code == 409


def test_final_document_superseded_after_edit_and_print_escaped(client):
    verify_all(client)
    document = client.post(URL + "/documents", json={**ACTOR, "kind": "treatment_plan", "notes": "<script>alert(1)</script>", "finalize": True}).json()
    assert document["status"] == "final"
    printed = client.get(f'{URL}/documents/{document["id"]}/print').text
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in printed
    assert "<script>alert(1)</script>" not in printed
    entity = client.get(URL).json()["entities"][0]
    client.post(f'{URL}/entities/{entity["id"]}/review', json={**ACTOR, "action": "reject"})
    assert client.get(URL).json()["documents"][0]["status"] == "superseded"


def test_fhir_approval_persists_and_references_resolve(client):
    verify_all(client)
    stored = client.post(URL + "/fhir/approve", json=ACTOR).json()
    assert stored["destination"] == "Local SQLite repository"
    assert client.get(f'{URL}/fhir/{stored["id"]}').json() == stored
    full_urls = {e["fullUrl"] for e in stored["bundle"]["entry"]}
    for entry in stored["bundle"]["entry"]:
        resource = entry["resource"]
        if entry["fullUrl"].startswith("urn:uuid:"):
            assert str(uuid.UUID(entry["fullUrl"].removeprefix("urn:uuid:"))) == resource["id"]
        if "subject" in resource:
            assert resource["subject"]["reference"] in full_urls
        if resource["resourceType"] == "Provenance":
            assert resource["target"][0]["reference"] in full_urls
            assert resource["entity"]


def test_audit_chain_and_explicit_recommendation_decision(client):
    state = client.get(URL).json()
    recommendation = state["recommendations"][0]
    assert recommendation["status"] == "pending"
    assert client.post(f'{URL}/recommendations/{recommendation["id"]}', json={**ACTOR, "action": "accept"}).json()["status"] == "accepted"
    events = list(reversed(client.get(URL + "/audit").json()))
    previous = "0" * 64
    for record in events:
        assert record["previous_hash"] == previous
        detail = json.dumps(record["detail"], sort_keys=True)
        digest = hashlib.sha256(json.dumps([previous, "P002", record["timestamp"], record["actor"], record["action"], detail]).encode()).hexdigest()
        assert digest == record["hash"]
        previous = digest


def test_corrected_diagnosis_never_exports_stale_code_or_active_condition(client):
    original = client.get(URL).json()["entities"][0]
    assert original["kind"] == "diagnosis" and original["code"] == "E11.9"
    corrected = client.post(f'{URL}/entities/{original["id"]}/review', json={**ACTOR, "action": "edit", "value": "No diabetes; prior diagnosis disputed"}).json()
    assert corrected["code"] == ""
    assert corrected["label"] == corrected["value"]
    assert corrected["original_mapping"] == {"code": original["code"], "label": original["label"]}
    assert corrected["requires_remapping"] is True
    verify_all(client)
    stored = client.post(URL + "/fhir/approve", json=ACTOR).json()
    condition = next(entry["resource"] for entry in stored["bundle"]["entry"] if entry["resource"]["resourceType"] == "Condition")
    assert condition["code"] == {"text": "No diabetes; prior diagnosis disputed"}
    assert "clinicalStatus" not in condition
    assert condition["verificationStatus"]["coding"][0]["code"] == "unconfirmed"
    assert "E11.9" not in json.dumps(condition)


def test_imported_diagnosis_does_not_infer_active_clinical_status(client):
    verify_all(client)
    stored = client.post(URL + "/fhir/approve", json=ACTOR).json()
    condition = next(entry["resource"] for entry in stored["bundle"]["entry"] if entry["resource"]["resourceType"] == "Condition")
    assert condition["code"]["coding"][0]["code"] == "E11.9"
    assert "clinicalStatus" not in condition


def test_naive_lab_time_preserves_date_and_original_without_invented_timezone(client):
    state = client.get(URL).json()
    source = next(entity for entity in state["entities"] if entity["kind"] == "observation")
    assert "T" in source["observed_at"]
    verify_all(client)
    stored = client.post(URL + "/fhir/approve", json=ACTOR).json()
    observation = next(entry["resource"] for entry in stored["bundle"]["entry"] if entry["resource"]["id"] == source["id"])
    assert observation["effectiveDateTime"] == source["observed_at"][:10]
    assert source["observed_at"] in observation["note"][0]["text"]
    assert "timezone unspecified" in observation["note"][0]["text"]


def test_timezone_aware_source_timestamp_keeps_offset(client):
    client.get(URL)
    added = client.post(URL + "/entities", json={**ACTOR, "kind": "observation", "code": "test-coded-lab", "label": "Timestamped source result", "value": "123", "unit": "mg/dL", "source": "explicit-offset-source", "observed_at": "2026-10-24T10:15:00+05:30"}).json()
    verify_all(client)
    stored = client.post(URL + "/fhir/approve", json=ACTOR).json()
    observation = next(entry["resource"] for entry in stored["bundle"]["entry"] if entry["resource"]["id"] == added["id"])
    assert observation["effectiveDateTime"] == "2026-10-24T10:15:00+05:30"
    assert "note" not in observation
