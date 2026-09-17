from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class TimelineItem(BaseModel):
    id: str
    document_id: str
    source_type: str # SPEECH_TO_TEXT, OCR, HL7_API_JSON, HISTORICAL_DOCUMENT
    timestamp: datetime
    facility: str
    title: str
    text_content: str
    confidence: float
    sha256_checksum: str
    minio_path: str
    status: str
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)

class PatientTimelineResponse(BaseModel):
    patient_id: str
    patient_name: str
    mrn: Optional[str] = None
    total_sources: int
    timeline: List[TimelineItem]

class NarrativeSection(BaseModel):
    section_name: str
    text: str
    sources_cited: List[str]

class FusedNarrativeResponse(BaseModel):
    patient_id: str
    patient_name: str
    mrn: Optional[str] = None
    generated_at: datetime
    working_narrative: str
    sections: List[NarrativeSection]
    sources_included: List[Dict[str, Any]]
