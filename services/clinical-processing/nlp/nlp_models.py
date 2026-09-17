from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class NLPInput(BaseModel):
    document_id: str
    encounter_id: Optional[str] = None
    patient_id: Optional[str] = None
    text: str
    source_type: Optional[str] = None # SPEECH_TO_TEXT, OCR, etc.
    metadata: Optional[Dict[str, Any]] = None

class ClinicalEntitySpan(BaseModel):
    entity_id: str
    entity_type: str # MEDICATION, DOSAGE, FREQUENCY, DIAGNOSIS, LAB_VITAL, DEMOGRAPHIC, PROCEDURE, ALLERGY
    span_text: str
    start_char: int
    end_char: int
    confidence: float
    temporal_status: str = "ACTIVE" # ACTIVE, HISTORICAL
    negation_status: bool = False   # True if negated (e.g. "no fever", "no chest pain")
    certainty: str = "CONFIRMED"    # CONFIRMED, SUSPECTED, RULE_OUT
    attributes: Optional[Dict[str, Any]] = Field(default_factory=dict)

class NLPOutput(BaseModel):
    document_id: str
    text_processed_length: int
    entity_count: int
    entities: List[ClinicalEntitySpan]
    processed_at: datetime = Field(default_factory=datetime.utcnow)
