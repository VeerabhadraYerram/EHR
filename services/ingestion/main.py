import os
import glob
import json
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, Depends, HTTPException, Query, Body, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from models import Base, init_db, PatientDB, EncounterDB, SourceDocumentDB, SourceFragmentDB
from storage import storage_client
from adapters.stt_adapter import STTAdapter
from adapters.ocr_adapter import OCRAdapter
from adapters.historical_adapter import HistoricalAdapter
from adapters.hl7_adapter import HL7APIAdapter

app = FastAPI(
    title="EHR Ingestion & Storage Subsystem",
    description="Week 1 Foundation & Input Ingestion APIs (STT, OCR, Historical, HL7)",
    version="1.0.0"
)

# Enable CORS for Frontend UI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://ehr_user:ehr_password@localhost:5432/ehr_primary")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Ensure tables exist
init_db(engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/health")
def health():
    return {"status": "ok", "service": "ingestion", "database": "connected"}

# --- Ingestion Endpoints (Week 1 Scope) ---

@app.post("/api/v1/ingest/stt", status_code=status.HTTP_201_CREATED)
def ingest_stt(payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db)):
    """Ingests Speech-to-Text JSON (diarized transcript with segments)."""
    try:
        doc, frags = STTAdapter.process(payload, db)
        return {
            "status": "success",
            "document_id": doc.id,
            "source_type": doc.source_type,
            "fragment_count": len(frags),
            "minio_raw_path": doc.minio_raw_path,
            "sha256": doc.sha256_checksum
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to ingest STT payload: {str(e)}")

@app.post("/api/v1/ingest/ocr", status_code=status.HTTP_201_CREATED)
def ingest_ocr(payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db)):
    """Ingests current-encounter OCR JSON (prescriptions and documents with bounding boxes)."""
    try:
        doc, frags = OCRAdapter.process(payload, db)
        return {
            "status": "success",
            "document_id": doc.id,
            "source_type": doc.source_type,
            "document_class": doc.document_class,
            "fragment_count": len(frags),
            "minio_raw_path": doc.minio_raw_path,
            "sha256": doc.sha256_checksum
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to ingest OCR payload: {str(e)}")

@app.post("/api/v1/ingest/historical", status_code=status.HTTP_201_CREATED)
def ingest_historical(payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db)):
    """Ingests Historical / External Documents (flags as PENDING_IDENTITY_RESOLUTION)."""
    try:
        doc, frags = HistoricalAdapter.process(payload, db)
        return {
            "status": "success",
            "document_id": doc.id,
            "source_type": doc.source_type,
            "status_flag": doc.status,
            "fragment_count": len(frags),
            "minio_raw_path": doc.minio_raw_path,
            "sha256": doc.sha256_checksum
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to ingest historical payload: {str(e)}")

@app.post("/api/v1/ingest/hl7", status_code=status.HTTP_201_CREATED)
def ingest_hl7(payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db)):
    """Ingests HL7-format API JSON (labs, prescriptions, and notes in FHIR-like bundle)."""
    try:
        doc, frags = HL7APIAdapter.process(payload, db)
        return {
            "status": "success",
            "document_id": doc.id,
            "source_type": doc.source_type,
            "fragment_count": len(frags),
            "minio_raw_path": doc.minio_raw_path,
            "sha256": doc.sha256_checksum
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to ingest HL7 payload: {str(e)}")

# --- Query & Dashboard Endpoints (Week 1 Scope) ---

@app.get("/api/v1/documents")
def list_documents(
    patient_id: Optional[str] = None,
    source_type: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """Lists ingested source documents with filters."""
    query = db.query(SourceDocumentDB)
    if patient_id:
        query = query.filter(SourceDocumentDB.patient_id == patient_id)
    if source_type:
        query = query.filter(SourceDocumentDB.source_type == source_type)
    docs = query.order_by(SourceDocumentDB.capture_timestamp.desc()).limit(limit).all()
    return [d.to_dict() for d in docs]

@app.get("/api/v1/documents/{doc_id}")
def get_document(doc_id: str, db: Session = Depends(get_db)):
    """Retrieves document metadata, source fragments, and raw MinIO payload."""
    doc = db.query(SourceDocumentDB).filter(SourceDocumentDB.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    frags = db.query(SourceFragmentDB).filter(SourceFragmentDB.document_id == doc_id).order_by(SourceFragmentDB.fragment_index.asc()).all()
    raw_payload = storage_client.get_raw_payload(doc.minio_raw_path)

    res = doc.to_dict()
    res["fragments"] = [f.to_dict() for f in frags]
    res["raw_payload"] = raw_payload
    return res

@app.get("/api/v1/patients")
def list_patients(db: Session = Depends(get_db)):
    """Lists registered patients."""
    patients = db.query(PatientDB).all()
    return [{
        "id": p.id,
        "mrn": p.mrn,
        "name": p.name,
        "dob": p.dob,
        "gender": p.gender,
        "phone": p.phone,
        "address": p.address,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "encounters_count": len(p.encounters),
        "documents_count": len(p.documents)
    } for p in patients]

@app.get("/api/v1/patients/{patient_id}/dashboard")
def get_patient_dashboard(patient_id: str, db: Session = Depends(get_db)):
    """Returns patient clinical dashboard data with all attached and external documents."""
    patient = db.query(PatientDB).filter(PatientDB.id == patient_id).first()
    if not patient:
        # Check if patient exists by MRN or session
        patient = db.query(PatientDB).filter((PatientDB.mrn == patient_id) | (PatientDB.id.like(f"%{patient_id}%"))).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    encounters = db.query(EncounterDB).filter(EncounterDB.patient_id == patient.id).all()
    documents = db.query(SourceDocumentDB).filter(SourceDocumentDB.patient_id == patient.id).all()
    
    # Also include pending historical documents that may belong to this patient
    historical_pending = db.query(SourceDocumentDB).filter(
        SourceDocumentDB.status == "PENDING_IDENTITY_RESOLUTION"
    ).all()

    return {
        "patient": {
            "id": patient.id,
            "mrn": patient.mrn,
            "name": patient.name,
            "dob": patient.dob,
            "gender": patient.gender,
            "phone": patient.phone,
            "address": patient.address
        },
        "encounters": [{
            "id": e.id,
            "start_time": e.start_time.isoformat() if e.start_time else None,
            "facility_id": e.facility_id
        } for e in encounters],
        "documents": [d.to_dict() for d in documents],
        "pending_historical_documents": [d.to_dict() for d in historical_pending]
    }

@app.post("/api/v1/seed/samples")
def seed_samples(db: Session = Depends(get_db)):
    """Loads all test samples from data/samples/ through their respective adapters."""
    samples_dir = os.path.join(os.path.dirname(__file__), "..", "..", "data", "samples")
    files = glob.glob(os.path.join(samples_dir, "*.json"))
    
    results = []
    for filepath in sorted(files):
        filename = os.path.basename(filepath)
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
            source_type = data.get("source_type")
            if source_type == "SPEECH_TO_TEXT":
                doc, _ = STTAdapter.process(data, db)
                results.append({"file": filename, "source_type": source_type, "id": doc.id, "status": "ingested"})
            elif source_type == "OCR" and "historical" in filename.lower():
                doc, _ = HistoricalAdapter.process(data, db)
                results.append({"file": filename, "source_type": "HISTORICAL_DOCUMENT", "id": doc.id, "status": "pending_match"})
            elif source_type == "OCR":
                doc, _ = OCRAdapter.process(data, db)
                results.append({"file": filename, "source_type": source_type, "id": doc.id, "status": "ingested"})
            elif source_type == "HL7_API_JSON":
                doc, _ = HL7APIAdapter.process(data, db)
                results.append({"file": filename, "source_type": source_type, "id": doc.id, "status": "ingested"})

    return {
        "status": "success",
        "message": f"Successfully ingested {len(results)} sample payloads into PostgreSQL and MinIO",
        "ingested": results
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
