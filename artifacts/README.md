# EHR Platform: Technical PDF Artifacts Repository

This directory contains the verified, publication-grade PDF technical specifications for the **EHR Clinical Intelligence & Interoperability Platform** across **Week 1** and **Week 2**.

---

## Directory Organization & PDF Deliverables

```
artifacts/
├── README.md                                                 # Master index & document catalog
├── EHR_Platform_Weeks_1_and_2_Master_Artifacts.pdf           # Consolidated Master Technical Specification (6 pages)
├── week-1/
│   └── EHR_Week_1_Technical_Artifacts.pdf                   # Week 1 Specification (3 pages)
└── week-2/
    └── EHR_Week_2_Technical_Artifacts.pdf                   # Week 2 Specification (3 pages)
```

---

## Deliverables Summary

### 1. Consolidated Master Specification
- **[EHR_Platform_Weeks_1_and_2_Master_Artifacts.pdf](file:///c:/Internship/EHR/artifacts/EHR_Platform_Weeks_1_and_2_Master_Artifacts.pdf)** (6 pages):
  - **Executive Technical Summary:** End-to-end clinical data flow, microservices architecture, and safety guarantees.
  - **Complete Week 1 Scope:** Container mesh, PostgreSQL schemas, MinIO S3 object storage, `pgvector` terminology embeddings, 4 heterogeneous ingestion adapters (STT, OCR, Historical, HL7), canonical data contracts, Clinical NLP baseline (NER, NegEx negation, temporality), and integration test suite.
  - **Complete Week 2 Scope:** Hybrid Multi-Factor EMPI engine, Jaro-Winkler string distance, ISO DOB tolerance, clinical phenotype ontology boost (SNOMED CT & RxNorm Jaccard overlap), deterministic clinical safety vetoes, 3 confidence decision tiers, forensic audit schema (`identity_match_audits`), Clinical Text Fusion, zero-leakage quarantine invariant, chronological patient timeline, synthesized 4-section clinical working narrative, Doctor Review UI (React 19 + Vite), dual-theme monochrome design system (Bright Mode vs Dark Mode), and integration test suite.

### 2. Week 1 Technical Specification
- **[artifacts/week-1/EHR_Week_1_Technical_Artifacts.pdf](file:///c:/Internship/EHR/artifacts/week-1/EHR_Week_1_Technical_Artifacts.pdf)** (3 pages):
  - Section 1: System Topology & Core Infrastructure (Ports 5432, 5433, 9000/9001, 8000, 8001).
  - Section 2: Canonical Relational Models (`patients`, `encounters`, `source_documents`, `source_fragments`).
  - Section 3: Heterogeneous Multi-Source Ingestion Adapters (`STTAdapter`, `OCRAdapter`, `HistoricalAdapter`, `HL7APIAdapter`).
  - Section 4: Clinical AI & NLP Baseline Extractor (Multi-class NER, NegEx negation scope window, temporality tagging).
  - Section 5: Week 1 Integration Verification Suite (`test_week1_pipeline.py`, 6/6 tests passing).

### 3. Week 2 Technical Specification
- **[artifacts/week-2/EHR_Week_2_Technical_Artifacts.pdf](file:///c:/Internship/EHR/artifacts/week-2/EHR_Week_2_Technical_Artifacts.pdf)** (3 pages):
  - Section 1: Hybrid Multi-Factor Patient Identity Resolution (EMPI scoring formula, field weights, Jaccard concept overlap, deterministic safety vetoes, 3 confidence tiers, audit schema).
  - Section 2: Clinical Text Normalization & Source Fusion (Strict quarantine safety invariant, chronological trajectory, SHA-256 provenance tracking, 4-section synthesized working narrative).
  - Section 3: Doctor Review UI & Dual-Theme Monochrome Architecture (React 19 + TypeScript + Vite, Dashboard `/`, Verification Queue `/review`, Unified Timeline `/timeline`, Bright Mode vs Dark Mode semantic token engine).
  - Section 4: Week 2 Integration Verification Suite (`test_week2_pipeline.py`, 6/6 tests passing).

---

## Compilation & Verification
All PDF artifacts are generated via `reportlab.platypus` with `NumberedCanvas` running against live services, canonical schemas, and verified test results. To regenerate the PDFs from source:

```bash
python scripts/generate_artifacts_pdf.py
```
