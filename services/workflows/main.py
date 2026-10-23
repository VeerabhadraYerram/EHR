"""Persistent local workflow adapter for the reference architecture's human review stages.

This adapter is deliberately NOT a substitute for Camunda, Keycloak, the official
HL7 Validator or HAPI FHIR. It makes the same review boundaries executable locally.
"""
from __future__ import annotations

import csv
import hashlib
import json
import os
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field, field_validator

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = Path(os.environ.get("WORKFLOW_DB", ROOT / "data" / "workflows" / "review.sqlite3"))
LOCK = threading.RLock()
app = FastAPI(title="Local clinical review workflows", version="1.0.0")
PREFIX = "/api/v1/workflows"


def now():
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def database():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        db.execute("CREATE TABLE IF NOT EXISTS records (patient_id TEXT PRIMARY KEY, content TEXT NOT NULL)")
        db.execute("CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, patient_id TEXT, timestamp TEXT, actor TEXT, action TEXT, detail TEXT, previous_hash TEXT, hash TEXT)")
        yield db


def event(db, patient_id, actor, action, detail):
    previous = db.execute("SELECT hash FROM events ORDER BY id DESC LIMIT 1").fetchone()
    previous_hash = previous[0] if previous else "0" * 64
    timestamp = now()
    serialized = json.dumps(detail, sort_keys=True)
    digest = hashlib.sha256(json.dumps([previous_hash, patient_id, timestamp, actor, action, serialized]).encode()).hexdigest()
    db.execute("INSERT INTO events(patient_id,timestamp,actor,action,detail,previous_hash,hash) VALUES(?,?,?,?,?,?,?)", (patient_id, timestamp, actor, action, serialized, previous_hash, digest))


def rows(name):
    with (ROOT / "data" / "digital_twin" / "clinic" / name).open(encoding="utf-8-sig") as stream:
        return list(csv.DictReader(stream))


def entity(kind, code, label, value, unit, date, source):
    return {"id": str(uuid.uuid4()), "kind": kind, "code": code, "label": label, "value": str(value), "unit": unit, "observed_at": date, "sources": [source], "status": "pending", "original": str(value)}


def seed(patient_id):
    patient = next((p for p in rows("patients.csv") if p["person_id"] == patient_id), None)
    if not patient:
        raise HTTPException(404, "Patient does not exist in the local twin cohort")
    entities = [entity("diagnosis", patient["icd10_code"], patient["diagnosis_name"], patient["diagnosis_name"], "", "", "clinic/patients.csv")]
    for lab in rows("labs.csv"):
        if lab["person_id"] == patient_id:
            entities.append(entity("observation", lab["loinc_code"], lab["test_name"], lab["value"], lab["unit"], lab["lab_time"], "clinic/labs.csv"))
    for med in rows("medications.csv"):
        if med["person_id"] == patient_id:
            entities.append(entity("medication", med["rxnorm_code"], med["drug_name"], f'{med["dose_text"]}; {med["frequency"]}; {med["route"]}', "", "", "clinic/medications.csv (derived dose metadata; verify against source)"))
    return {"patient_id": patient_id, "patient": patient, "version": 1, "legacy_patient_id": None, "entities": entities, "documents": [], "bundles": [], "recommendations": [
        {"id": "reconcile", "text": "Reconcile recorded medicines, doses and allergies with the patient before using this record.", "source": "Workflow checklist; not a patient-specific treatment recommendation", "status": "pending"},
        {"id": "followup", "text": "Document clinician-selected follow-up and glucose monitoring instructions.", "source": "Workflow checklist; no similar-case retrieval is asserted", "status": "pending"},
    ]}


def load(db, patient_id):
    record = db.execute("SELECT content FROM records WHERE patient_id=?", (patient_id,)).fetchone()
    if record:
        return json.loads(record[0])
    state = seed(patient_id)
    save(db, state)
    event(db, patient_id, "system", "workspace.created", {"source": "Local cohort CSV", "pending_entities": len(state["entities"])})
    return state


def save(db, state):
    db.execute("INSERT INTO records VALUES(?,?) ON CONFLICT(patient_id) DO UPDATE SET content=excluded.content", (state["patient_id"], json.dumps(state)))


def duplicates(state):
    groups = {}
    for item in state["entities"]:
        if item["status"] in ("rejected", "merged"):
            continue
        # Calendar-day proximity, normalized terminology code and entity class.
        key = (item["kind"], item["code"], item["observed_at"][:10])
        groups.setdefault(key, []).append(item)
    return [{"key": "|".join(key), "kind": "duplicate" if len({(e["value"].strip().casefold(), e["unit"].strip().casefold()) for e in items}) == 1 else "conflict", "entities": items} for key, items in groups.items() if key[1] and len(items) > 1]


def ready(state):
    unresolved = [e["id"] for e in state["entities"] if e["status"] == "pending"]
    if unresolved or duplicates(state):
        raise HTTPException(409, "Resolve every pending entity and duplicate/conflict before finalizing")
    if not any(e["status"] in ("accepted", "edited") for e in state["entities"]):
        raise HTTPException(409, "At least one accepted clinical entity is required")


def invalidate(state):
    state["version"] += 1
    for document in state["documents"]:
        if document["status"] == "final":
            document["status"] = "superseded"


class Actor(BaseModel):
    actor: str = Field(min_length=2, max_length=100)


class Review(Actor):
    action: Literal["accept", "edit", "reject"]
    value: str | None = Field(default=None, max_length=2000)
    reason: str = Field(default="", max_length=2000)


class NewEntity(Actor):
    kind: Literal["diagnosis", "observation", "medication", "allergy", "procedure"]
    code: str = Field(default="", max_length=100)
    label: str = Field(min_length=1, max_length=300)
    value: str = Field(min_length=1, max_length=2000)
    unit: str = Field(default="", max_length=50)
    observed_at: str = Field(default="", max_length=50)
    source: str = Field(min_length=1, max_length=500)

    @field_validator("observed_at")
    @classmethod
    def valid_date(cls, value):
        if value:
            try:
                datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError as error:
                raise ValueError("Use an ISO date or timestamp") from error
        return value


class Merge(Actor):
    entity_ids: list[str] = Field(min_length=2)


class Decision(Actor):
    action: Literal["accept", "reject"]


class Document(Actor):
    kind: Literal["treatment_plan", "discharge_summary"]
    notes: str = Field(default="", max_length=20000)
    finalize: bool = False


@app.get("/health")
def health():
    return {"status": "ok", "service": "local-workflows", "storage": "SQLite development adapter", "authentication": "demo actor labels only"}


@app.get(PREFIX + "/patients/{patient_id}")
def workspace(patient_id: str):
    with LOCK, database() as db:
        state = load(db, patient_id)
        event(db, patient_id, "demo-reader", "workspace.read", {})
        return {**state, "deduplication": duplicates(state), "mode": "Local persistent demo; actor names are not authenticated identities", "fhir_validation": "Basic structural checks only; official HL7 validator and hospital persistence are not connected"}


@app.post(PREFIX + "/patients/{patient_id}/entities")
def add_entity(patient_id: str, request: NewEntity):
    with LOCK, database() as db:
        state = load(db, patient_id)
        item = entity(request.kind, request.code, request.label, request.value, request.unit, request.observed_at, request.source)
        state["entities"].append(item)
        invalidate(state)
        event(db, patient_id, request.actor, "entity.added", item)
        save(db, state)
        return item


@app.post(PREFIX + "/patients/{patient_id}/entities/{entity_id}/review")
def review_entity(patient_id: str, entity_id: str, request: Review):
    if request.action == "edit" and not (request.value or "").strip():
        raise HTTPException(422, "An edited value is required")
    with LOCK, database() as db:
        state = load(db, patient_id)
        item = next((e for e in state["entities"] if e["id"] == entity_id), None)
        if not item or item["status"] == "merged":
            raise HTTPException(404, "Reviewable entity not found")
        before = dict(item)
        item["status"] = {"accept": "accepted", "edit": "edited", "reject": "rejected"}[request.action]
        if request.action == "edit":
            corrected_value = request.value.strip()
            if item["kind"] == "diagnosis" and corrected_value != item["value"]:
                # A free-text clinical correction does not revalidate the old
                # terminology mapping or establish condition activity/negation.
                # Preserve it as evidence, then export only unconfirmed text.
                item.setdefault("original_mapping", {"code": item["code"], "label": item["label"]})
                item["code"] = ""
                item["label"] = corrected_value
                item["requires_remapping"] = True
            item["value"] = corrected_value
        item.update(reviewed_by=request.actor, reviewed_at=now(), reason=request.reason)
        invalidate(state)
        event(db, patient_id, request.actor, "entity." + request.action, {"before": before, "after": item})
        save(db, state)
        return item


@app.post(PREFIX + "/patients/{patient_id}/merge")
def merge_entities(patient_id: str, request: Merge):
    with LOCK, database() as db:
        state = load(db, patient_id)
        requested = set(request.entity_ids)
        group = next((g for g in duplicates(state) if g["kind"] == "duplicate" and {e["id"] for e in g["entities"]} == requested), None)
        if not group:
            raise HTTPException(409, "Only an entire identical-value duplicate group may merge; resolve conflicts individually")
        keeper, *others = group["entities"]
        keeper["sources"] = list(dict.fromkeys(s for item in group["entities"] for s in item["sources"]))
        keeper["status"] = "pending"
        for other in others:
            other.update(status="merged", merged_into=keeper["id"])
        invalidate(state)
        event(db, patient_id, request.actor, "entities.merged", {"ids": request.entity_ids, "retained": keeper["id"], "sources": keeper["sources"]})
        save(db, state)
        return keeper


@app.post(PREFIX + "/patients/{patient_id}/recommendations/{recommendation_id}")
def decide_recommendation(patient_id: str, recommendation_id: str, request: Decision):
    with LOCK, database() as db:
        state = load(db, patient_id)
        item = next((r for r in state["recommendations"] if r["id"] == recommendation_id), None)
        if not item:
            raise HTTPException(404, "Recommendation not found")
        item.update(status="accepted" if request.action == "accept" else "rejected", reviewed_by=request.actor, reviewed_at=now())
        invalidate(state)
        event(db, patient_id, request.actor, "recommendation." + request.action, {"id": recommendation_id, "text": item["text"]})
        save(db, state)
        return item


def document_text(state, request):
    lines = [request.kind.replace("_", " ").title(), f'Patient: {state["patient_id"]}', "LOCAL DEMONSTRATION — clinician review required", "", "Verified record:"]
    lines.extend(f'- {e["label"]}: {e["value"]} {e["unit"]} ({e["code"]}); recorded {e["observed_at"] or "date unavailable"}' for e in state["entities"] if e["status"] in ("accepted", "edited"))
    lines.extend(["", "Accepted workflow reminders:"])
    lines.extend("- " + r["text"] for r in state["recommendations"] if r["status"] == "accepted")
    lines.extend(["", "Clinician-authored instructions:", request.notes or "No additional instructions entered.", "", f"Prepared by demo actor: {request.actor}"])
    return "\n".join(lines)


@app.post(PREFIX + "/patients/{patient_id}/documents")
def create_document(patient_id: str, request: Document):
    with LOCK, database() as db:
        state = load(db, patient_id)
        if request.finalize:
            ready(state)
        item = {"id": str(uuid.uuid4()), "kind": request.kind, "status": "final" if request.finalize else "draft", "text": document_text(state, request), "created_at": now(), "actor": request.actor, "record_version": state["version"]}
        state["documents"].append(item)
        event(db, patient_id, request.actor, "document." + item["status"], {"id": item["id"], "kind": request.kind, "version": state["version"]})
        save(db, state)
        return item


@app.get(PREFIX + "/patients/{patient_id}/documents/{document_id}/print", response_class=HTMLResponse)
def print_document(patient_id: str, document_id: str):
    import html
    with LOCK, database() as db:
        state = load(db, patient_id)
        item = next((d for d in state["documents"] if d["id"] == document_id), None)
        if not item:
            raise HTTPException(404, "Document not found")
        event(db, patient_id, "demo-reader", "document.export", {"id": document_id})
        return f'<!doctype html><html><head><title>Clinical document</title><style>body{{font:16px Georgia;max-width:800px;margin:50px auto;line-height:1.6}}pre{{white-space:pre-wrap;font:inherit}}@media print{{button{{display:none}}}}</style></head><body><button onclick="window.print()">Print / save PDF</button><p>Status: {html.escape(item["status"])} · record version {item["record_version"]}</p><pre>{html.escape(item["text"])}</pre></body></html>'


def bundle_for(state, actor):
    patient_id = state["patient_id"]
    resources = [{"resourceType": "Patient", "id": patient_id, "identifier": [{"system": "urn:ehr:local-cohort", "value": patient_id}]}]
    for item in state["entities"]:
        if item["status"] not in ("accepted", "edited"):
            continue
        rid = item["id"]
        subject = {"reference": f"urn:ehr:patient:{patient_id}"}
        coding = {"text": item["label"]}
        system = {"observation": "http://loinc.org", "diagnosis": "http://hl7.org/fhir/sid/icd-10", "medication": "http://www.nlm.nih.gov/research/umls/rxnorm"}.get(item["kind"])
        if item["code"] and system:
            coding["coding"] = [{"system": system, "code": item["code"], "display": item["label"]}]
        if item["kind"] == "observation":
            resource = {"resourceType": "Observation", "id": rid, "status": "final", "code": coding, "subject": subject, "valueString": item["value"] + " " + item["unit"]}
            if item["observed_at"]:
                observed = datetime.fromisoformat(item["observed_at"].replace("Z", "+00:00"))
                # FHIR requires a timezone for timestamps with a time component.
                # Source lab timestamps have no offset: preserve their calendar
                # date without inventing a source timezone, retaining raw time.
                resource["effectiveDateTime"] = observed.isoformat() if observed.tzinfo else observed.date().isoformat()
                if not observed.tzinfo and len(item["observed_at"]) > 10:
                    resource["note"] = [{"text": "Original recorded local timestamp: " + item["observed_at"] + "; timezone unspecified by source. Only the source date is serialized in effectiveDateTime."}]
        elif item["kind"] == "diagnosis":
            resource = {"resourceType": "Condition", "id": rid, "subject": subject, "code": coding, "note": [{"text": item["value"]}]}
            if item.get("requires_remapping"):
                resource["verificationStatus"] = {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-ver-status", "code": "unconfirmed"}]}
                resource["note"].append({"text": "Clinician-edited free text; original terminology mapping cleared. Remapping and clinical status assessment required."})
        elif item["kind"] == "medication":
            resource = {"resourceType": "MedicationStatement", "id": rid, "status": "unknown", "subject": subject, "medicationCodeableConcept": coding, "dosage": [{"text": item["value"]}]}
        elif item["kind"] == "allergy":
            resource = {"resourceType": "AllergyIntolerance", "id": rid, "patient": subject, "code": coding, "note": [{"text": item["value"]}]}
        else:
            resource = {"resourceType": "Procedure", "id": rid, "status": "unknown", "subject": subject, "code": coding, "note": [{"text": item["value"]}]}
        resources.append(resource)
        resources.append({"resourceType": "Provenance", "id": str(uuid.uuid4()), "target": [{"reference": "urn:uuid:" + rid}], "recorded": now(), "agent": [{"who": {"display": actor}}], "entity": [{"role": "source", "what": {"identifier": {"system": "urn:ehr:source", "value": source}}} for source in item["sources"]]})
    return {"resourceType": "Bundle", "id": str(uuid.uuid4()), "type": "collection", "timestamp": now(), "meta": {"tag": [{"system": "urn:ehr:environment", "code": "local-demo"}]}, "entry": [{"fullUrl": "urn:uuid:" + r["id"] if r["resourceType"] != "Patient" else "urn:ehr:patient:" + patient_id, "resource": r} for r in resources]}


@app.post(PREFIX + "/patients/{patient_id}/fhir/approve")
def approve_fhir(patient_id: str, request: Actor):
    with LOCK, database() as db:
        state = load(db, patient_id)
        ready(state)
        bundle = bundle_for(state, request.actor)
        # Deliberately narrow: no claim of conformance to an implementation guide.
        if not all(e["resource"].get("resourceType") and e["resource"].get("id") for e in bundle["entry"]):
            raise HTTPException(422, "Basic resource identity check failed")
        stored = {"id": bundle["id"], "approved_at": now(), "actor": request.actor, "record_version": state["version"], "validation": "Basic resource identity/reference construction checks; official HL7 validator not run", "destination": "Local SQLite repository", "bundle": bundle}
        state["bundles"].append(stored)
        event(db, patient_id, request.actor, "fhir.approved_local", {"id": stored["id"], "version": state["version"], "resources": len(bundle["entry"])})
        save(db, state)
        return stored


@app.get(PREFIX + "/patients/{patient_id}/fhir/{bundle_id}")
def get_bundle(patient_id: str, bundle_id: str):
    with LOCK, database() as db:
        state = load(db, patient_id)
        stored = next((b for b in state["bundles"] if b["id"] == bundle_id), None)
        if not stored:
            raise HTTPException(404, "Bundle not found")
        event(db, patient_id, "demo-reader", "fhir.read", {"id": bundle_id})
        return stored


@app.get(PREFIX + "/patients/{patient_id}/audit")
def audit(patient_id: str):
    with LOCK, database() as db:
        load(db, patient_id)
        event(db, patient_id, "demo-reader", "audit.read", {})
        records = db.execute("SELECT * FROM events WHERE patient_id=? ORDER BY id DESC LIMIT 500", (patient_id,)).fetchall()
        return [{**dict(r), "detail": json.loads(r["detail"])} for r in records]
