from fastapi import FastAPI, Depends, Query, HTTPException
from typing import List, Optional
from pydantic import BaseModel
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from retriever import CandidateRetriever
from providers import SentenceTransformersProvider
from ehr_contracts.terminology.models import SearchCandidate, OntologyConcept

app = FastAPI(
    title="Terminology Service",
    description="EHR Ontology Storage and Vector Retrieval Subsystem"
)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://ehr_term:ehr_term_pass@localhost:5433/terminology")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

embedding_provider = SentenceTransformersProvider()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "terminology"}

@app.get("/ready")
def ready_check():
    return {"status": "ready"}

@app.get("/terminology/concepts/{ontology}/{code}", response_model=OntologyConcept)
def get_concept(ontology: str, code: str, db: Session = Depends(get_db)):
    retriever = CandidateRetriever(db, embedding_provider)
    concept = retriever.exact_lookup(ontology, code)
    if not concept:
        raise HTTPException(status_code=404, detail="Concept not found")
    return concept

@app.get("/terminology/search", response_model=List[SearchCandidate])
def search(
    q: str = Query(..., description="The query string"),
    ontology: Optional[str] = None,
    mode: str = Query("hybrid", description="Search mode: exact, lexical, vector, or hybrid"),
    limit: int = 10,
    db: Session = Depends(get_db)
):
    retriever = CandidateRetriever(db, embedding_provider)
    candidates = retriever.search(query=q, ontology=ontology, mode=mode, limit=limit)
    return candidates
