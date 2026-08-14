# Architecture Review

## 1. Confirmed Requirements
*   **Goal**: Standardize heterogeneous clinical input (STT, OCR, Historical, HL7 API) into a verified FHIR/HL7 record.
*   **Safety Constraints**: Historical docs must wait for identity resolution; low-confidence extractions, deduplication conflicts, and identity matches require explicit doctor verification; original text and provenance must be preserved; recommendations do not auto-prescribe.
*   **Technology**: Python 3.12, FastAPI, Pydantic, SQLAlchemy, React (Vite/TS), PostgreSQL, Kafka, MinIO, Redis, Elasticsearch, Camunda, Keycloak, HAPI FHIR, Mirth.

## 2. Confirmed Architecture
*   **Data Flow**: Raw Inputs -> `CanonicalClinicalRecord` (Machine) -> Processing -> Verification -> `VerifiedClinicalRecord` (Doctor Approved) -> FHIR/HL7 & Documents.
*   **Modular Monolith / Services**: Logical boundaries grouped into deployable services (Ingestion, Identity, Clinical Processing, Verification, Recommendation, Document Gen, Interoperability, Audit).
*   **Pluggable AI**: Clinical NLP and matchers use interface protocols (e.g., `ClinicalNER`, `PatientMatcher`). Stub implementations will be built first.

## 3. Service Boundaries
*   `ingestion/`: stt, ocr, historical, hl7 adapters.
*   `identity-resolution/`: PatientMatcher adapters (Deterministic stub now, OpenEMPI/recordlinkage later).
*   `clinical-processing/`: fusion, nlp, context, terminology, deduplication.
*   `verification/`: Backend for Camunda and React UI.
*   `recommendation/`: Stub now, pgvector/sentence-transformers later.
*   `document-generation/`: Jinja2 templates.
*   `interoperability/`: fhir (mappers, validator), hl7 (mirth).
*   `audit/`: Immutable logging.

## 4. Canonical Model (Shared Package)
*   Stored in `packages/ehr-contracts/`.
*   Distinguishes `CanonicalClinicalRecord` (pre-verification) from `VerifiedClinicalRecord` (post-verification).
*   Models: `Patient`, `Encounter`, `SourceDocument`, `ClinicalEntity`, `DoctorReviewTask`, `DoctorAction`, `ProvenanceRecord`, etc.

## 5. Event Topology
Kafka topics: `stt.raw`, `ocr.raw`, `docs.historical`, `hl7.api`, `identity.pending`, `identity.resolved`, `fusion.completed`, `clinical.entities.extracted`, `terminology.resolved`, `dedup.pending`, `doctor.review.created`, `record.verified`, `fhir.persisted`.

## 6. Data Stores
*   **PostgreSQL**: System of record (canonical data, verification state, provenance, audit).
*   **MinIO**: Immutable raw sources / generated documents.
*   **Elasticsearch**: Patient candidate search.
*   **Redis**: Caching, sessions.
*   **HAPI FHIR**: FHIR repository.

## 7. Security Boundaries
*   Keycloak for AuthN/AuthZ.
*   All PHI reads/writes emit `AuditEvent`.
*   Historical data quarantine (IDENTITY_PENDING).

## 8. Verification Gates
*   State machine enforcement: No path from `raw input` to `EHR persistence` without doctor verification.
*   Gates: Medium-confidence identity matches, low-confidence NLP, duplicate conflicts.

## 9. Open Decisions
*   **FHIR Profile**: TBD. Will use base FHIR R4 for now until an Implementation Guide is selected.
*   **Cold Start Recommendation**: TBD. Will return empty/no suggestion until sufficient historical data exists.

## 10. Explicit Assumptions
*   The first E2E pipeline is architectural (deterministic stubs), proving boundaries, not intelligence.
*   The `packages/ehr-contracts/` is a local Python package installed in editable mode (`pip install -e`) by the services.
*   Docker Compose will use profiles (`core`, `integration`, `observability`, `full`) to allow lightweight local development.
