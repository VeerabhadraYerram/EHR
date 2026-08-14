# EHR Clinical Intelligence & Interoperability Platform

This repository implements a clinical text understanding, doctor verification, and HL7/FHIR persistence pipeline. It takes raw inputs from speech-to-text, OCR, historical documents, and HL7 APIs, resolves identities, extracts clinical entities, maps to standard ontologies, deduplicates records, routes them through a doctor verification workflow, and persists the verified canonical record as FHIR resources.

## What it does

The system accepts heterogeneous clinical information sources and standardizes them into a verified canonical clinical record, which is then mapped to FHIR and legacy HL7 v2 messages. It strictly adheres to clinical safety rules:
- Historical documents wait for identity resolution.
- Low-confidence extractions demand doctor verification.
- Conflicting deduplication merges demand doctor verification.
- Recommendations require explicit doctor action.
- Original source fragments and provenances are preserved.

## Repository Structure

- `docs/` - Architecture, security, and operational documentation and ADRs.
- `contracts/` - Canonical data models (Pydantic), Event schemas, and API definitions.
- `services/` - Independent microservices (Ingestion, NLP, Workflow, FHIR, etc.).
- `frontend/` - React application for the Doctor Review workflow.
- `infrastructure/` - Configurations for Docker Compose, Kubernetes, and supporting infra.
- `data/` - Sample datasets and seed data.
- `scripts/` - Bootstrapping and automation scripts.
- `tests/` - Integration and E2E tests.

## Running Locally

To start the core development infrastructure (PostgreSQL, Kafka, Redis, etc.):

```bash
docker-compose -f docker-compose.dev.yml up -d
```

> **Note**: Several services are currently marked as `STUB` to establish architectural boundaries before implementing deep clinical NLP models. See `docs/architecture/` for details.
