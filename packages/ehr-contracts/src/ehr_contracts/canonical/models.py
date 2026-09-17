from datetime import datetime
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field
from ehr_contracts.state_machines.machines import IdentityState, RecordState

class ProvenanceRecord(BaseModel):
    provenance_id: str
    source_fragment_ids: List[str]
    source_document_ids: List[str]
    source_systems: List[str]
    extracted_at: datetime
    verification_action: Optional[str] # e.g., "ACCEPTED", "EDITED"
    doctor_id: Optional[str]

class Patient(BaseModel):
    id: str
    mrn: Optional[str]
    name: str
    dob: str
    gender: str
    national_id: Optional[str]
    phone: Optional[str]
    address: Optional[str]

class Encounter(BaseModel):
    id: str
    patient_id: str
    start_time: datetime
    end_time: Optional[datetime]
    facility_id: str
    practitioner_id: str

class SourceDocument(BaseModel):
    id: str
    source_type: str # 'SPEECH_TO_TEXT', 'OCR', 'HISTORICAL_DOCUMENT', 'HL7_API_JSON'
    encounter_id: Optional[str] = None
    patient_id: Optional[str] = None
    patient_session_ref: Optional[str] = None
    document_class: Optional[str] = None
    origin: Optional[str] = "current_encounter"
    originating_facility_name: Optional[str] = None
    capture_timestamp: datetime
    raw_content_ref: str # MinIO S3 URI or path
    sha256_checksum: Optional[str] = None
    overall_confidence: Optional[float] = 1.0
    status: str = "INGESTED" # 'INGESTED', 'PENDING_IDENTITY_RESOLUTION', 'PROCESSED'
    identity_hint_fields: Optional[Dict[str, Any]] = None
    raw_text: Optional[str] = None

class SourceFragment(BaseModel):
    id: str
    document_id: str
    original_text: str
    speaker: Optional[str] = None
    timestamp: Optional[datetime] = None
    confidence: float = 1.0
    start_ms: Optional[int] = None
    end_ms: Optional[int] = None
    bounding_box: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None

class CanonicalEnvelope(BaseModel):
    """Canonical Ingestion Envelope (Architecture Doc Section 4.1)"""
    source_type: str
    encounter_id: Optional[str] = None
    patient_ref: Optional[str] = None
    timestamp: datetime
    confidence: float
    payload: Dict[str, Any]

class ClinicalEntity(BaseModel):
    entity_id: str
    entity_type: str
    original_text: str
    normalized_text: Optional[str]
    ontology: Optional[str]
    ontology_code: Optional[str]
    confidence: float
    patient_id: str
    encounter_id: str
    temporal_status: str = "ACTIVE"
    negation_status: bool = False
    certainty_status: str = "CONFIRMED"
    provenance_ids: List[str]

class CanonicalClinicalRecord(BaseModel):
    """Machine-produced candidate state"""
    record_id: str
    encounter_id: str
    patient_id: str
    state: RecordState
    entities: List[ClinicalEntity]
    created_at: datetime

class VerifiedClinicalRecord(BaseModel):
    """Doctor-approved state"""
    record_id: str
    encounter_id: str
    patient_id: str
    state: RecordState
    entities: List[ClinicalEntity]
    verified_at: datetime
    verified_by_doctor_id: str
