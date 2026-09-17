import os
from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy import (
    Column, String, Integer, Float, DateTime, Text, ForeignKey
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from sqlalchemy import create_engine
import json

Base = declarative_base()

class PatientDB(Base):
    __tablename__ = "patients"

    id = Column(String(64), primary_key=True, index=True)
    mrn = Column(String(64), unique=True, index=True, nullable=True)
    name = Column(String(255), nullable=False, index=True)
    dob = Column(String(32), nullable=True)
    gender = Column(String(32), nullable=True)
    phone = Column(String(64), nullable=True)
    national_id = Column(String(64), nullable=True, index=True)
    address = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    encounters = relationship("EncounterDB", back_populates="patient", cascade="all, delete-orphan")
    documents = relationship("SourceDocumentDB", back_populates="patient")

class EncounterDB(Base):
    __tablename__ = "encounters"

    id = Column(String(64), primary_key=True, index=True)
    patient_id = Column(String(64), ForeignKey("patients.id"), nullable=False, index=True)
    patient_session_ref = Column(String(64), nullable=True, index=True)
    facility_id = Column(String(128), nullable=True)
    practitioner_id = Column(String(128), nullable=True)
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    patient = relationship("PatientDB", back_populates="encounters")
    documents = relationship("SourceDocumentDB", back_populates="encounter")

class SourceDocumentDB(Base):
    __tablename__ = "source_documents"

    id = Column(String(64), primary_key=True, index=True) # e.g. OCR-2026-081234
    source_type = Column(String(64), nullable=False, index=True) # SPEECH_TO_TEXT, OCR, HISTORICAL_DOCUMENT, HL7_API_JSON
    encounter_id = Column(String(64), ForeignKey("encounters.id"), nullable=True, index=True)
    patient_id = Column(String(64), ForeignKey("patients.id"), nullable=True, index=True)
    patient_session_ref = Column(String(64), nullable=True)
    document_class = Column(String(128), nullable=True) # prescription, historical_discharge_summary, transcript, etc.
    origin = Column(String(128), default="current_encounter") # current_encounter, external_hospital, external_lab
    originating_facility_name = Column(String(255), nullable=True)
    capture_timestamp = Column(DateTime, default=datetime.utcnow)
    minio_raw_path = Column(String(512), nullable=False) # e.g. ehr-raw-inputs/ocr/OCR-2026-081234.json
    sha256_checksum = Column(String(64), nullable=False)
    overall_confidence = Column(Float, default=1.0)
    status = Column(String(64), default="INGESTED", index=True) # INGESTED, PENDING_IDENTITY_RESOLUTION, PROCESSED
    identity_hint_fields = Column(Text, nullable=True) # JSON-serialized hints
    raw_text = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    patient = relationship("PatientDB", back_populates="documents")
    encounter = relationship("EncounterDB", back_populates="documents")
    fragments = relationship("SourceFragmentDB", back_populates="document", cascade="all, delete-orphan")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "source_type": self.source_type,
            "encounter_id": self.encounter_id,
            "patient_id": self.patient_id,
            "patient_session_ref": self.patient_session_ref,
            "document_class": self.document_class,
            "origin": self.origin,
            "originating_facility_name": self.originating_facility_name,
            "capture_timestamp": self.capture_timestamp.isoformat() if self.capture_timestamp else None,
            "minio_raw_path": self.minio_raw_path,
            "sha256_checksum": self.sha256_checksum,
            "overall_confidence": self.overall_confidence,
            "status": self.status,
            "identity_hint_fields": json.loads(self.identity_hint_fields) if self.identity_hint_fields else None,
            "raw_text": self.raw_text,
            "fragment_count": len(self.fragments) if self.fragments else 0
        }

class SourceFragmentDB(Base):
    __tablename__ = "source_fragments"

    id = Column(String(128), primary_key=True, index=True)
    document_id = Column(String(64), ForeignKey("source_documents.id"), nullable=False, index=True)
    fragment_index = Column(Integer, nullable=False)
    original_text = Column(Text, nullable=False)
    speaker = Column(String(64), nullable=True) # doctor, patient
    confidence = Column(Float, default=1.0)
    start_ms = Column(Integer, nullable=True)
    end_ms = Column(Integer, nullable=True)
    bounding_box = Column(Text, nullable=True) # JSON-serialized
    created_at = Column(DateTime, default=datetime.utcnow)

    document = relationship("SourceDocumentDB", back_populates="fragments")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "document_id": self.document_id,
            "fragment_index": self.fragment_index,
            "original_text": self.original_text,
            "speaker": self.speaker,
            "confidence": self.confidence,
            "start_ms": self.start_ms,
            "end_ms": self.end_ms,
            "bounding_box": json.loads(self.bounding_box) if self.bounding_box else None
        }

def init_db(engine):
    Base.metadata.create_all(bind=engine)
