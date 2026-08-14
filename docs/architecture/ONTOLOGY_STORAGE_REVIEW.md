# Ontology Storage Review

## 1. Confirmed Requirements
* **Goal**: Build an isolated, independently runnable ontology storage and vector retrieval subsystem.
* **Storage**: PostgreSQL (authoritative store) + pgvector (semantic index). No other vector database is permitted.
* **Terminologies**: SNOMED CT (via Snowstorm adapter), ICD-10/11, RxNorm, LOINC, UMLS (cross-terminology layer).
* **Data Model**: Concepts must be strictly separated from Terms/Synonyms. Relationships and Mappings must be supported. Active/Inactive flags and versioning are required.
* **Ingestion**: Must be idempotent, transactional (release states), and manifest-based. Do not blindly copy raw files into git.
* **Retrieval**: Support exact, lexical, vector, and hybrid search. Provide ontology filtering. Results must include `match_type`, `similarity`, and `rank` without conflating retrieval relevance with clinical certainty.

## 2. Existing Architecture & Contracts
* The overall `ehr-platform` uses a grouped service structure (`services/clinical-processing/terminology`). We will implement the subsystem there.
* The `ehr-contracts` package exists but we must verify if it already defines `OntologyConcept`, `OntologyTerm`, etc. (It currently does not, it focuses on clinical patient data; we will need to add terminology contracts).
* Do not duplicate the infrastructure: the subsystem will have its own minimal Docker setup (Postgres + pgvector + FastAPI) to run independently, while fitting into the broader `ehr-platform` repository structure.

## 3. Seed Data
* The provided `Ontology_Seed_Data_Labs_Diagnoses_Pharma.xlsx` is marked as DEVELOPMENT / TEST DATA.
* An adapter/importer must be created to parse Labs (LOINC), Diagnoses (ICD-10/SNOMED), and Pharma (RxNorm) into the canonical ontology schema.

## 4. Proposed Database Schema
```sql
CREATE TABLE ontology_releases (
    id UUID PRIMARY KEY,
    ontology VARCHAR NOT NULL,
    version VARCHAR NOT NULL,
    release_date DATE,
    source VARCHAR,
    license VARCHAR,
    status VARCHAR NOT NULL, -- DOWNLOADED, LOADING, READY, FAILED
    UNIQUE(ontology, version)
);

CREATE TABLE concepts (
    id UUID PRIMARY KEY,
    ontology VARCHAR NOT NULL,
    code VARCHAR NOT NULL,
    preferred_term VARCHAR NOT NULL,
    status VARCHAR DEFAULT 'ACTIVE',
    release_id UUID REFERENCES ontology_releases(id),
    UNIQUE(ontology, code, release_id)
);

CREATE TABLE terms (
    id UUID PRIMARY KEY,
    concept_id UUID REFERENCES concepts(id),
    term VARCHAR NOT NULL,
    normalized_term VARCHAR NOT NULL,
    term_type VARCHAR, -- e.g., 'PREFERRED', 'SYNONYM'
    source VARCHAR
);

CREATE TABLE relationships (
    source_concept_id UUID REFERENCES concepts(id),
    target_concept_id UUID REFERENCES concepts(id),
    relationship_type VARCHAR NOT NULL,
    ontology VARCHAR NOT NULL
);

CREATE TABLE ontology_embeddings (
    id UUID PRIMARY KEY,
    concept_id UUID REFERENCES concepts(id),
    ontology VARCHAR NOT NULL,
    embedding vector(384), -- assuming all-MiniLM-L6-v2 dimension
    embedding_model VARCHAR NOT NULL,
    embedding_version VARCHAR,
    source_text_hash VARCHAR NOT NULL,
    created_at TIMESTAMP
);

-- pgvector Index
CREATE INDEX ON ontology_embeddings USING hnsw (embedding vector_cosine_ops);
```

## 5. Ingestion Pipeline
1. **Manifest Parsing**: Read ontology metadata and create `ontology_releases` entry with status `LOADING`.
2. **Parsing & Normalization**: Read raw source (or seed Excel), clean text, lowercasing/whitespace handling.
3. **Database Insertion**: Insert Concepts, Terms, Relationships idempotently using `ON CONFLICT DO NOTHING` or `UPDATE`.
4. **Text Builder**: Construct meaningful semantic text (e.g., `LOINC | Hemoglobin A1c | HbA1c | A1C`).
5. **Embedding**: Hash text, call `EmbeddingProvider` (sentence-transformers), store vectors.
6. **Completion**: Update release status to `READY`.

## 6. Exclusions
This subsystem will explicitly **NOT** implement:
* Clinical NER / Entity Extraction
* Patient Matching
* Doctor Verification
* FHIR Persistence
* Kafka pipelines
* User Interfaces

It provides terminology knowledge and retrieval only.
