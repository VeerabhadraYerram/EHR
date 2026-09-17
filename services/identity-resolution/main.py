import os
import sys
import json
import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, Depends, HTTPException, Query, Body, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

# Ensure root is in sys.path
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

IDENTITY_DIR = os.path.abspath(os.path.dirname(__file__))
if IDENTITY_DIR not in sys.path:
    sys.path.insert(0, IDENTITY_DIR)

from identity_models import (
    init_identity_db, SessionLocal, IdentityMatchAuditDB,
    MatchDecision, MatchScoreBreakdown, ConfirmMatchRequest
)
from matcher import PatientIdentityMatcher

# Ingestion DB models
from services.ingestion.models import PatientDB, SourceDocumentDB

app = FastAPI(
    title="EHR Patient Identity Resolution Subsystem",
    description="Week 2 Hybrid EMPI Engine with Demographic Matching, Clinical Phenotype Ontologies, and Multi-Tier Resolution",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize identity DB tables on startup
init_identity_db()

matcher_instance = PatientIdentityMatcher()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "identity-resolution",
        "version": "2.0.0",
        "rules": "EMPI-Hybrid-MultiFactor"
    }

class EvaluateDocumentRequest(BaseModel):
    document_id: str
    target_patient_id: Optional[str] = None
    auto_apply: bool = True

@app.post("/api/v1/identity/evaluate", response_model=MatchDecision)
def evaluate_document(
    req: EvaluateDocumentRequest,
    db: Session = Depends(get_db)
):
    """
    Evaluates an ingested source document against candidate patients.
    Applies multi-factor scoring (Demographic + Clinical Phenotype Ontologies)
    and routes to AUTO_LINK, DOCTOR_VERIFICATION, or MANUAL_REVIEW.
    """
    doc = db.query(SourceDocumentDB).filter_by(id=req.document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document {req.document_id} not found in repository.")

    # Parse hints
    hints = {}
    if doc.identity_hint_fields:
        hints = json.loads(doc.identity_hint_fields) if isinstance(doc.identity_hint_fields, str) else doc.identity_hint_fields

    raw_text = doc.raw_text or ""

    # Candidates pool
    if req.target_patient_id:
        candidates = db.query(PatientDB).filter_by(id=req.target_patient_id).all()
    else:
        candidates = db.query(PatientDB).all()

    if not candidates:
        raise HTTPException(status_code=404, detail="No candidate patients found in database.")

    best_decision: Optional[MatchDecision] = None
    best_candidate: Optional[PatientDB] = None

    for cand in candidates:
        # Retrieve candidate historical text from existing linked documents to calculate phenotype overlap
        linked_docs = db.query(SourceDocumentDB).filter_by(patient_id=cand.id).all()
        cand_historical_text = " ".join([d.raw_text or "" for d in linked_docs])

        decision = matcher_instance.evaluate_match(
            document_id=doc.id,
            hints=hints,
            doc_raw_text=raw_text,
            candidate_patient=cand,
            candidate_historical_text=cand_historical_text
        )

        if best_decision is None or decision.combined_score > best_decision.combined_score:
            best_decision = decision
            best_candidate = cand

    if not best_decision or not best_candidate:
        raise HTTPException(status_code=500, detail="Failed to evaluate match decision.")

    # Audit & apply actions
    audit_id = f"AUD-{uuid.uuid4().hex[:12].upper()}"
    has_conflict = len(best_decision.conflicts) > 0

    if best_decision.tier == "AUTO_LINK":
        action = "AUTO_LINKED"
        if req.auto_apply:
            doc.patient_id = best_candidate.id
            doc.status = "LINKED"
            db.commit()
    elif best_decision.tier == "DOCTOR_VERIFICATION":
        action = "PENDING_DOCTOR_REVIEW"
        if req.auto_apply:
            doc.status = "PENDING_IDENTITY_RESOLUTION"
            db.commit()
    else:
        action = "QUARANTINED"
        if req.auto_apply:
            doc.status = "QUARANTINED"
            db.commit()

    audit_entry = IdentityMatchAuditDB(
        id=audit_id,
        document_id=doc.id,
        candidate_patient_id=best_candidate.id,
        tier=best_decision.tier,
        combined_score=best_decision.combined_score,
        demographic_score=best_decision.breakdown.demographic_composite,
        phenotype_score=best_decision.breakdown.phenotype_overlap,
        has_hard_conflict=has_conflict,
        breakdown_json=json.dumps(best_decision.breakdown.model_dump()),
        action_taken=action,
        doctor_id=None,
        doctor_notes=None,
        created_at=datetime.utcnow()
    )
    db.add(audit_entry)
    db.commit()

    return best_decision

@app.get("/api/v1/identity/review-queue")
def get_doctor_review_queue(db: Session = Depends(get_db)):
    """
    Returns the queue of documents awaiting doctor identity verification.
    Only includes documents with tier == DOCTOR_VERIFICATION and pending status.
    """
    audits = (
        db.query(IdentityMatchAuditDB)
        .filter(IdentityMatchAuditDB.action_taken == "PENDING_DOCTOR_REVIEW")
        .filter(IdentityMatchAuditDB.resolved_at.is_(None))
        .order_by(IdentityMatchAuditDB.created_at.desc())
        .all()
    )

    queue = []
    for audit in audits:
        doc = db.query(SourceDocumentDB).filter_by(id=audit.document_id).first()
        cand = db.query(PatientDB).filter_by(id=audit.candidate_patient_id).first()

        doc_dict = doc.to_dict() if doc else {}
        hints = doc_dict.get("identity_hint_fields") or {}

        queue.append({
            "audit_id": audit.id,
            "document_id": audit.document_id,
            "document_class": doc.document_class if doc else "unknown",
            "originating_facility_name": doc.originating_facility_name if doc else "External Facility",
            "capture_timestamp": doc.capture_timestamp.isoformat() if doc and doc.capture_timestamp else None,
            "document_hints": hints,
            "document_text_snippet": (doc.raw_text[:300] + "...") if doc and doc.raw_text and len(doc.raw_text) > 300 else (doc.raw_text if doc else ""),
            "candidate_patient": {
                "id": cand.id if cand else audit.candidate_patient_id,
                "name": cand.name if cand else "Unknown",
                "dob": cand.dob if cand else None,
                "gender": cand.gender if cand else None,
                "mrn": cand.mrn if cand else None,
                "phone": cand.phone if cand else None,
                "national_id": cand.national_id if cand else None,
                "address": cand.address if cand else None
            },
            "tier": audit.tier,
            "combined_score": round(audit.combined_score, 4),
            "demographic_score": round(audit.demographic_score, 4),
            "phenotype_score": round(audit.phenotype_score, 4),
            "breakdown": json.loads(audit.breakdown_json) if audit.breakdown_json else {},
            "has_hard_conflict": audit.has_hard_conflict,
            "created_at": audit.created_at.isoformat() if audit.created_at else None
        })

    return {"queue_length": len(queue), "items": queue}

@app.post("/api/v1/identity/confirm")
def confirm_or_reject_match(
    req: ConfirmMatchRequest,
    db: Session = Depends(get_db)
):
    """
    Doctor decision endpoint.
    - CONFIRM: Links document to patient and sets status = LINKED.
    - REJECT: Quarantines document, sets status = REJECTED, document remains unlinked.
    """
    doc = db.query(SourceDocumentDB).filter_by(id=req.document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document {req.document_id} not found.")

    audit = (
        db.query(IdentityMatchAuditDB)
        .filter(IdentityMatchAuditDB.document_id == req.document_id)
        .filter(IdentityMatchAuditDB.resolved_at.is_(None))
        .order_by(IdentityMatchAuditDB.created_at.desc())
        .first()
    )

    action_upper = req.action.upper()
    now = datetime.utcnow()

    if action_upper == "CONFIRM":
        doc.patient_id = req.patient_id
        doc.status = "LINKED"
        action_name = "DOCTOR_CONFIRMED"
    elif action_upper == "REJECT":
        doc.patient_id = None
        doc.status = "REJECTED"
        action_name = "DOCTOR_REJECTED"
    else:
        raise HTTPException(status_code=400, detail="Invalid action. Must be CONFIRM or REJECT.")

    if audit:
        audit.action_taken = action_name
        audit.doctor_id = req.doctor_id
        audit.doctor_notes = req.notes
        audit.resolved_at = now
    else:
        # Create an audit entry if one wasn't pending
        audit = IdentityMatchAuditDB(
            id=f"AUD-{uuid.uuid4().hex[:12].upper()}",
            document_id=req.document_id,
            candidate_patient_id=req.patient_id,
            tier="DOCTOR_VERIFICATION",
            combined_score=1.0 if action_upper == "CONFIRM" else 0.0,
            demographic_score=1.0 if action_upper == "CONFIRM" else 0.0,
            phenotype_score=1.0 if action_upper == "CONFIRM" else 0.0,
            has_hard_conflict=False,
            breakdown_json=json.dumps({"manual_override": True}),
            action_taken=action_name,
            doctor_id=req.doctor_id,
            doctor_notes=req.notes,
            created_at=now,
            resolved_at=now
        )
        db.add(audit)

    db.commit()

    return {
        "status": "success",
        "document_id": doc.id,
        "patient_id": doc.patient_id,
        "document_status": doc.status,
        "action_taken": action_name,
        "doctor_id": req.doctor_id,
        "resolved_at": now.isoformat()
    }

@app.get("/api/v1/identity/audits/{document_id}")
def get_document_audits(document_id: str, db: Session = Depends(get_db)):
    audits = (
        db.query(IdentityMatchAuditDB)
        .filter_by(document_id=document_id)
        .order_by(IdentityMatchAuditDB.created_at.desc())
        .all()
    )
    return {"document_id": document_id, "audit_count": len(audits), "audits": [a.to_dict() for a in audits]}
