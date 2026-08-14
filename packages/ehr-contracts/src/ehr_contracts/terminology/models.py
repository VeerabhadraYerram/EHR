from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime
from uuid import UUID

class OntologyTerm(BaseModel):
    id: UUID
    concept_id: UUID
    term: str
    normalized_term: str
    term_type: Optional[str] = None
    source: Optional[str] = None

class OntologyRelationship(BaseModel):
    source_concept_id: UUID
    target_concept_id: UUID
    relationship_type: str
    ontology: str

class OntologyRelease(BaseModel):
    id: UUID
    ontology: str
    version: str
    release_date: Optional[date] = None
    source: Optional[str] = None
    license: Optional[str] = None
    status: str

class OntologyConcept(BaseModel):
    id: UUID
    ontology: str
    code: str
    preferred_term: str
    status: str
    release_id: Optional[UUID] = None
    
    terms: List[OntologyTerm] = []

class SearchCandidate(BaseModel):
    concept: OntologyConcept
    matched_term: str
    match_type: str # EXACT, LEXICAL, VECTOR, HYBRID
    similarity: Optional[float] = None
    rank: int
