import os
import sys
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel

# Ensure paths
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

FUSION_DIR = os.path.abspath(os.path.dirname(__file__))
if FUSION_DIR not in sys.path:
    sys.path.insert(0, FUSION_DIR)

from fusion_models import PatientTimelineResponse, FusedNarrativeResponse
from engine import ClinicalFusionEngine

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://ehr_user:ehr_password@localhost:5432/ehr_primary")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

app = FastAPI(
    title="EHR Clinical Text Fusion Subsystem",
    description="Week 2 Multi-Source Clinical Timeline & Normalized Working Narrative Synthesis",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

fusion_engine = ClinicalFusionEngine()

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
        "service": "clinical-fusion",
        "version": "2.0.0",
        "safety_rule": "Quarantine-Gated"
    }

@app.get("/api/v1/fusion/patient/{patient_id}/timeline", response_model=PatientTimelineResponse)
def get_patient_timeline(patient_id: str, db: Session = Depends(get_db)):
    """
    Returns the unified chronological clinical timeline for a patient.
    Excludes unverified/quarantined documents automatically.
    """
    try:
        return fusion_engine.build_patient_timeline(patient_id=patient_id, db=db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error building timeline: {str(e)}")

@app.get("/api/v1/fusion/patient/{patient_id}/narrative", response_model=FusedNarrativeResponse)
def get_patient_narrative(patient_id: str, db: Session = Depends(get_db)):
    """
    Returns the synthesized working clinical narrative for a patient.
    Organized by encounter, diagnostic, and reconciled historical sections with full cryptographic provenance.
    """
    try:
        return fusion_engine.synthesize_working_narrative(patient_id=patient_id, db=db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating narrative: {str(e)}")

class PreviewFusionRequest(BaseModel):
    texts: List[str]

@app.post("/api/v1/fusion/preview")
def preview_normalization(req: PreviewFusionRequest):
    normalized = [fusion_engine.normalize_clinical_text(t) for t in req.texts]
    fused = "\n\n---\n\n".join([n for n in normalized if n])
    return {
        "count": len(normalized),
        "normalized_segments": normalized,
        "fused_preview": fused
    }
