import uuid
from datetime import datetime
from typing import List, Optional
from sqlalchemy import String, Date, DateTime, ForeignKey, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector

class Base(DeclarativeBase):
    pass

class OntologyRelease(Base):
    __tablename__ = "ontology_releases"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    ontology: Mapped[str] = mapped_column(String, index=True)
    version: Mapped[str] = mapped_column(String)
    release_date: Mapped[Optional[datetime]] = mapped_column(Date, nullable=True)
    source: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    license: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String) # DOWNLOADED, LOADING, READY, FAILED

    concepts: Mapped[List["Concept"]] = relationship(back_populates="release")

class Concept(Base):
    __tablename__ = "concepts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    ontology: Mapped[str] = mapped_column(String, index=True)
    code: Mapped[str] = mapped_column(String, index=True)
    preferred_term: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String, default="ACTIVE")
    release_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("ontology_releases.id"), nullable=True)

    release: Mapped[Optional["OntologyRelease"]] = relationship(back_populates="concepts")
    terms: Mapped[List["Term"]] = relationship(back_populates="concept")
    embeddings: Mapped[List["OntologyEmbedding"]] = relationship(back_populates="concept")

class Term(Base):
    __tablename__ = "terms"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    concept_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("concepts.id"), index=True)
    term: Mapped[str] = mapped_column(Text)
    normalized_term: Mapped[str] = mapped_column(Text, index=True)
    term_type: Mapped[Optional[str]] = mapped_column(String, nullable=True) # PREFERRED, SYNONYM
    source: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    concept: Mapped["Concept"] = relationship(back_populates="terms")

class Relationship(Base):
    __tablename__ = "relationships"

    source_concept_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("concepts.id"), primary_key=True)
    target_concept_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("concepts.id"), primary_key=True)
    relationship_type: Mapped[str] = mapped_column(String, primary_key=True)
    ontology: Mapped[str] = mapped_column(String)

class OntologyEmbedding(Base):
    __tablename__ = "ontology_embeddings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    concept_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("concepts.id"), index=True)
    ontology: Mapped[str] = mapped_column(String, index=True)
    embedding: Mapped[List[float]] = mapped_column(Vector(384)) # all-MiniLM-L6-v2 uses 384
    embedding_model: Mapped[str] = mapped_column(String)
    embedding_version: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    source_text_hash: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    concept: Mapped["Concept"] = relationship(back_populates="embeddings")
