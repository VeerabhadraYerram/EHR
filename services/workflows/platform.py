"""Durable local clinical alert workflow and explicit integration boundaries."""

import hashlib
import json
import sqlite3
import uuid
import os
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
import httpx
from services.workflows.main import (
    database,
    load,
    save,
    event,
    now,
    LOCK,
    Actor,
    check_version,
)
from services.recommendation.engine import similar_profiles
from services.interoperability.fhir.client import deliver

router = APIRouter(prefix="/api/v1/workflows")


@router.get("/platform-status")
def platform_status():
    from ehr_security import mode, identity

    user = identity.get()
    return {
        "authentication": mode(),
        "actor": user["actor"] if user else "Synthetic demo",
        "roles": sorted(user["roles"]) if user else [],
        "hospital_configured": bool(os.environ.get("FHIR_BASE_URL")),
        "live_devices": "paused by user",
        "nlp": "Dictionary/context baseline; licensed/versioned MedCAT models are not provisioned",
        "audit": "Durable local hash chain; off-host immutable retention is not configured",
        "clinical_validation": "Retrospective source-derived demonstration only; independent Indian/prospective cohort not supplied",
    }


def alert_table(db):
    db.execute(
        "CREATE TABLE IF NOT EXISTS alerts(id TEXT PRIMARY KEY,patient_id TEXT,content TEXT)"
    )


class Evaluate(Actor):
    decision_time: str
    replay: bool = True


class AlertAction(Actor):
    action: str
    note: str = ""
    expected_alert_version: int


@router.get("/patients/{patient_id}/similar-cases")
def cases(patient_id: str):
    try:
        return similar_profiles(patient_id)
    except LookupError as e:
        raise HTTPException(404, str(e))


@router.get("/patients/{patient_id}/alerts")
def alerts(patient_id: str):
    with LOCK, database() as db:
        load(db, patient_id)
        alert_table(db)
        items = [
            json.loads(r["content"])
            for r in db.execute(
                "SELECT content FROM alerts WHERE patient_id=?", (patient_id,)
            )
        ]
        for item in items:
            if (
                item["status"] not in ("resolved",)
                and not item["escalated"]
                and datetime.fromisoformat(item["escalate_at"])
                < datetime.now(timezone.utc)
            ):
                item.update(escalated=True, version=item["version"] + 1)
                db.execute(
                    "UPDATE alerts SET content=? WHERE id=?",
                    (json.dumps(item), item["id"]),
                )
                event(
                    db,
                    patient_id,
                    "system",
                    "alert.escalated",
                    {"id": item["id"], "delivery": "in-app only"},
                )
        return sorted(items, key=lambda a: a["created_at"], reverse=True)


@router.post("/patients/{patient_id}/alerts/evaluate")
def evaluate(patient_id: str, payload: Evaluate, request: Request):
    try:
        with httpx.Client(timeout=20) as client:
            r = client.get(
                f"http://127.0.0.1:8004/api/v1/twin/patients/{patient_id}/predict",
                params={"decision_time": payload.decision_time},
                headers={"Authorization": request.headers.get("authorization", "")},
            )
            r.raise_for_status()
            prediction = r.json()
    except Exception as e:
        raise HTTPException(
            502, "Prediction could not be retrieved; no alert created: " + str(e)[:300]
        )
    if not payload.replay:
        observed = datetime.fromisoformat(payload.decision_time.replace("Z", "+00:00"))
        if (
            observed.tzinfo is None
            or abs((datetime.now(timezone.utc) - observed).total_seconds()) > 900
        ):
            return {
                "created": False,
                "reason": "Stale or timezone-unspecified recording suppressed for live alerts. Use explicit replay mode for this historical cohort.",
            }
    if prediction.get("model_applicable") is False:
        return {
            "created": False,
            "reason": "Incident-spike model is not applicable to this state",
        }
    probability = prediction["calibrated_spike_probability"]
    threshold = prediction["optimal_decision_threshold"]
    if probability < threshold:
        return {
            "created": False,
            "reason": f"Probability {probability:.3f} is below the model threshold {threshold:.3f}",
        }
    fingerprint = prediction.get("model_provenance", {})
    key = hashlib.sha256(
        json.dumps(
            [patient_id, payload.decision_time, fingerprint, payload.replay],
            sort_keys=True,
        ).encode()
    ).hexdigest()
    with LOCK, database() as db:
        load(db, patient_id)
        alert_table(db)
        existing = db.execute(
            "SELECT content FROM alerts WHERE id=?", (key,)
        ).fetchone()
        if existing:
            return {
                "created": False,
                "reason": "This prediction already has an alert",
                "alert": json.loads(existing[0]),
            }
        # Group repeated predictions within a 30-minute cooldown per patient/mode/model.
        for row in db.execute(
            "SELECT content FROM alerts WHERE patient_id=?", (patient_id,)
        ):
            old = json.loads(row[0])
            if (
                old["replay"] == payload.replay
                and old["status"] != "resolved"
                and old["model_provenance"] == fingerprint
            ):
                if (
                    abs(
                        (
                            datetime.fromisoformat(old["decision_time"])
                            - datetime.fromisoformat(payload.decision_time)
                        ).total_seconds()
                    )
                    < 1800
                ):
                    return {
                        "created": False,
                        "reason": "Grouped by 30-minute prediction cooldown",
                        "alert": old,
                    }
        item = {
            "id": key,
            "patient_id": patient_id,
            "decision_time": payload.decision_time,
            "probability": probability,
            "threshold": threshold,
            "model_provenance": fingerprint,
            "replay": payload.replay,
            "status": "new",
            "version": 1,
            "created_at": now(),
            "escalate_at": (
                datetime.now(timezone.utc) + timedelta(minutes=15)
            ).isoformat(),
            "escalated": False,
            "delivery": "in_app",
            "external_delivery": "not_configured",
            "history": [],
        }
        db.execute(
            "INSERT INTO alerts VALUES(?,?,?)", (key, patient_id, json.dumps(item))
        )
        event(
            db,
            patient_id,
            payload.actor,
            "alert.created",
            {"id": key, "replay": payload.replay},
        )
        return {"created": True, "alert": item}


@router.post("/patients/{patient_id}/alerts/{alert_id}/action")
def alert_action(patient_id: str, alert_id: str, payload: AlertAction):
    with LOCK, database() as db:
        alert_table(db)
        row = db.execute(
            "SELECT content FROM alerts WHERE id=? AND patient_id=?",
            (alert_id, patient_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Alert not found")
        item = json.loads(row[0])
        if payload.expected_alert_version != item["version"]:
            raise HTTPException(409, "Alert changed. Refresh before acting.")
        if payload.action not in ("acknowledge", "resolve", "escalate"):
            raise HTTPException(422, "Unknown alert action")
        if item["status"] == "resolved":
            raise HTTPException(409, "Resolved alerts cannot be changed")
        if payload.action == "resolve" and item["status"] == "new":
            raise HTTPException(409, "Acknowledge this alert before resolving it")
        if payload.action == "resolve" and not payload.note.strip():
            raise HTTPException(422, "A resolution note is required")
        if payload.action == "escalate":
            item["escalated"] = True
        else:
            item["status"] = (
                "acknowledged" if payload.action == "acknowledge" else "resolved"
            )
        item["version"] += 1
        item["history"].append(
            {
                "action": payload.action,
                "actor": payload.actor,
                "at": now(),
                "note": payload.note,
            }
        )
        db.execute(
            "UPDATE alerts SET content=? WHERE id=?", (json.dumps(item), alert_id)
        )
        event(
            db,
            patient_id,
            payload.actor,
            "alert." + payload.action,
            {"id": alert_id, "note": payload.note},
        )
        return item


@router.post("/patients/{patient_id}/fhir/{bundle_id}/delivery")
def delivery(patient_id: str, bundle_id: str, payload: Actor):
    with LOCK, database() as db:
        state = load(db, patient_id)
        check_version(state, payload)
        stored = next((b for b in state["bundles"] if b["id"] == bundle_id), None)
        if not stored:
            raise HTTPException(404, "Approved bundle not found")
        if stored["record_version"] != state["version"]:
            raise HTTPException(
                409,
                "Approved bundle is stale; approve the current record before delivery",
            )
        if stored.get("delivery", {}).get("status") == "delivered":
            return stored["delivery"]
        try:
            result = deliver(stored["bundle"])
        except Exception as e:
            stored["delivery"] = {
                "status": "failed",
                "at": now(),
                "error": str(e)[:2500],
            }
            save(db, state)
            event(
                db,
                patient_id,
                payload.actor,
                "fhir.delivery_failed",
                {"bundle_id": bundle_id, "error": str(e)[:500]},
            )
            # Commit failed attempt before returning an HTTP error.
            db.commit()
            raise HTTPException(503, str(e)[:2500])
        stored["delivery"] = {**result, "at": now()}
        save(db, state)
        event(
            db,
            patient_id,
            payload.actor,
            "fhir.delivered",
            {
                "bundle_id": bundle_id,
                "locations": [r["location"] for r in result["resources"]],
            },
        )
        return stored["delivery"]
