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
    source_type: str 
    encounter_id: Optional[str]
    capture_timestamp: datetime
    raw_content_ref: str

class SourceFragment(BaseModel):
    id: str
    document_id: str
    original_text: str
    speaker: Optional[str]
    timestamp: Optional[datetime]
    confidence: float

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
