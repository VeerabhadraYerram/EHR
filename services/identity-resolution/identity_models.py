import os
import json
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from sqlalchemy import Column, String, Float, DateTime, Text, Boolean, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

Base = declarative_base()

class IdentityMatchAuditDB(Base):
    __tablename__ = "identity_match_audits"

    id = Column(String(64), primary_key=True, index=True)
    document_id = Column(String(64), nullable=False, index=True)
    candidate_patient_id = Column(String(64), nullable=False, index=True)
    tier = Column(String(32), nullable=False) # AUTO_LINK, DOCTOR_VERIFICATION, MANUAL_REVIEW
    combined_score = Column(Float, nullable=False)
    demographic_score = Column(Float, nullable=False)
    phenotype_score = Column(Float, nullable=False)
    has_hard_conflict = Column(Boolean, default=False)
    breakdown_json = Column(Text, nullable=False)
    action_taken = Column(String(64), nullable=False) # AUTO_LINKED, PENDING_DOCTOR_REVIEW, DOCTOR_CONFIRMED, DOCTOR_REJECTED, QUARANTINED
    doctor_id = Column(String(64), nullable=True)
    doctor_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "document_id": self.document_id,
            "candidate_patient_id": self.candidate_patient_id,
            "tier": self.tier,
            "combined_score": round(self.combined_score, 4),
            "demographic_score": round(self.demographic_score, 4),
            "phenotype_score": round(self.phenotype_score, 4),
            "has_hard_conflict": self.has_hard_conflict,
            "breakdown": json.loads(self.breakdown_json) if self.breakdown_json else {},
            "action_taken": self.action_taken,
            "doctor_id": self.doctor_id,
            "doctor_notes": self.doctor_notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None
        }

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://ehr_user:ehr_password@localhost:5432/ehr_primary")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_identity_db():
    Base.metadata.create_all(bind=engine)

# Pydantic Schemas for API
class MatchScoreBreakdown(BaseModel):
    name_score: float = Field(..., description="Jaro-Winkler / token sort name similarity")
    dob_score: float = Field(..., description="Date of birth match score")
    gender_score: float = Field(..., description="Gender compatibility score")
    phone_score: float = Field(..., description="Phone number match score")
    national_id_score: float = Field(..., description="National ID exact match score")
    address_score: float = Field(..., description="Fuzzy address token similarity")
    mrn_score: float = Field(..., description="MRN cross-reference score")
    demographic_composite: float = Field(..., description="Weighted demographic score")
    phenotype_overlap: float = Field(..., description="Clinical phenotype concepts overlap score")
    combined_score: float = Field(..., description="Final combined multi-factor score")

class MatchDecision(BaseModel):
    document_id: str
    patient_id: Optional[str] = None
    patient_name: Optional[str] = None
    patient_mrn: Optional[str] = None
    tier: str # AUTO_LINK, DOCTOR_VERIFICATION, MANUAL_REVIEW
    combined_score: float
    breakdown: MatchScoreBreakdown
    reasons: List[str]
    conflicts: List[str]
    status: str # LINKED, PENDING_IDENTITY_RESOLUTION, QUARANTINED

class ConfirmMatchRequest(BaseModel):
    document_id: str
    patient_id: str
    doctor_id: str = "DOC-DEFAULT"
    action: str = "CONFIRM" # CONFIRM, REJECT
    notes: Optional[str] = None
