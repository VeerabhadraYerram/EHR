# **System Architecture Document** 

### **EHR Clinical Text Understanding, Doctor Verification & HL7/FHIR Persistence** 

_Open-Source Reference Architecture — Implementation Companion to the Project Scope Document_ 

## 1. Purpose & Scope 

This document translates the project scope (identity resolution, text fusion, clinical NLP, ontology mapping, deduplication, doctor verification, recommendation, document generation, and HL7/FHIR persistence) into a concrete, implementable architecture built entirely from open-source components. It covers four heterogeneous input sources — speech-to-text JSON, OCR JSON, historical/external documents, and HL7-format API JSON for labs/prescriptions/clinical notes (including diagnosis) — and traces them end-to-end to structured, doctor-verified persistence in a FHIR-compliant EHR store. 

## 2. Input Sources & Ownership 

The pipeline accepts four distinct input types, each with a defined upstream owner and a corresponding ingestion adapter on this system's side: 

|**Input**|**Produced by**|**Consumed by**|
|---|---|---|
|OCR JSON|Upstream OCR engine (out of scope)|This pipeline's ingestion adapter|
|Speech-to-Text JSON|Upstream STT engine (out of scope)|This pipeline's ingestion adapter|
|HL7-format API JSON (labs/Rx/notes)|External LIS / pharmacy / EHR systems|This pipeline's HL7 ingestion<br>adapter (via Mirth or direct FHIR<br>JSON POST)|
|Historical/external documents|Other doctors / other hospitals (scanned or<br>structured)|Identity Resolution stage, then this<br>pipeline|



Sample JSON payloads for each of these four input types are provided as separate files alongside this document (two examples per source). 



<!-- Start of picture text -->
T. Input Sources 13, Security & Compliance (cross-cutting)<br>(Labs,HL7-format Rx, ClinicalAPINotes/Dx) JSON JSONSpeech-to-Text (transcript) (prescriptions/docs)‘OCR JSON. DocumentsHistorical/External (PDF/JSON/HL7v2) OAuth2/OIDC,KeycloakRBAC (immutable,Audit everyLog Service read/write)<br>to 1<br>(7|cialKong API Gatew: abl toaf1't<br>11<br>‘Apache Kafic 14, Observability (cross-cutting) 9. Clinicalsentence-transformersRecommendation Engine ) (8, Doctor VerificationCamunda BPMN & Correction 11'lpop 1;1'<br>Vea DtsT = —=—=h—h— lull td 111 111<br>3. Identity Resolution & Patient Matching 5. Clinical NLP: NER, Linking & Context t ‘<br>\ 1<br>‘OpenEMPI/ recordlinkage MedCAT (spaCy-based) SsGece seer awe Pavector / FAISS i<br>sombound) — 6. Ontology& Terminology Servic suggestions oi] accepteditveject —_];10. Document Generation 1'H1 11. HU7/FHIR Structuring & Persistence<br>FuzzyElasticsearchPatient Index (auto-linkConfidence/ doctor-confirm Tiering /flag) (RxNorm‘Terminology/ LOINCMicroservice/ ICD-10-11) ‘SNOMED|CTSnowstormTerminology Server ‘auxiliary parsingftokenizationscispacy MetaCAT‘Negation,/ Temporality, Certainty NegEx / pyConTextNLP Paranaernie courCot 5 (acceptReact/ Review edit / reject) Ul ‘Treatment PlanJinja2/Discharge Templates Summary ) | H | 1 fhir.resourcesResource Builder (Python)<br>(alignby time, tagFusion source+confidence) Service (cross-terminologyUMLS Metathesaurus mapping) DB (code+value+date-proximityDedup Engine match) HTMLWeasyPrint -> POF 1'' ‘HL7Mirth v2 Connect ADT/ORU (NextGen) Interfacing (vs. HL7Implementation FHIR Validator Guide)<br>kK =a'H1<br>1<br>Raw fragmentastore (immutable) (retain—_—all source—_ refs) °°»| ' (esse Gana(FHIR Repository)<br>1H i<br>12. Brace!mlayer u<br>cache /session (ae)Mel,<br><!-- End of picture text -->

## 4. Layer-by-Layer Detail 

### 4.1 Input Sources 

Four adapters normalize each source into a canonical envelope (source_type, encounter_id/patient_ref, timestamp, confidence, payload) before anything touches the pipeline: Speech-to-Text JSON (diarized transcript segments with persegment confidence), OCR JSON (prescription/document text blocks with bounding boxes and OCR confidence), Historical/External Documents (scanned or structured records from other doctors/hospitals, not yet identity-verified), and HL7-format API JSON (labs, prescriptions and clinical notes/diagnosis already emitted in HL7 v2 or FHIR-like JSON by external lab/pharmacy/EHR systems). 

### 4.2 API Gateway & Ingestion Bus 

Kong (open-source API gateway) fronts all inbound traffic — authentication pass-through to Keycloak, rate limiting, and routing to the correct ingestion adapter. Every accepted payload is published to a source-specific Apache Kafka topic (stt.raw, ocr.raw, docs.historical, hl7.api), which decouples ingestion from processing and lets each downstream stage consume at its own pace — important because identity resolution and clinical NLP have very different latency profiles. 

### 4.3 Identity Resolution & Patient Matching 

This stage applies only to historical/external documents; current-encounter inputs are already bound to the active patient session. OpenEMPI (an open-source Master Patient Index) or a custom matcher built on the Python `recordlinkage` library combines name, date of birth, gender, phone/national ID, MRN cross-reference and address — never a single field — backed by an Elasticsearch fuzzy index for candidate search. Matches are tiered exactly as specified in the scope document: highconfidence auto-links, medium-confidence routes to the doctor verification loop before use, low/no-confidence is flagged and held in a manual-match queue rather than discarded or force-linked. False-match and false-non-match rates are logged separately to PostgreSQL for the required NFR reporting. 

### 4.4 Text Normalization & Source Fusion 

A Python fusion microservice aligns speech transcript segments, OCR text blocks, current-encounter documents, and identity-resolved historical documents into one time-ordered working narrative, tagging every fragment with its source, timestamp and original confidence. Raw fragments are written once to MinIO (S3-compatible, immutable) so nothing downstream ever needs to overwrite or discard the original text — every structured field can be traced back to it later. 

### 4.5 Clinical NLP: NER, Linking & Context 

MedCAT (Medical Concept Annotation Toolkit, open-source, built on spaCy and trained against UMLS) is the primary engine: it performs named entity recognition across the required entity types — demographics, diagnosis/problem, medication, dosage/frequency, lab/vital, procedure, allergy — and simultaneously links each span to a UMLS concept, with a confidence score per entity. scispaCy supplies auxiliary biomedical tokenization/parsing. MetaCAT (MedCAT's contextclassification module), supplemented by NegEx / pyConTextNLP, handles negation (“no chest pain”), temporality (active vs. historical), and certainty/hedging (“likely”, “rule out”) as qualifiers attached to each entity rather than dropped. 

### 4.6 Ontology & Terminology Services 

Snowstorm — SNOMED International's own open-source terminology server — serves SNOMED CT concept lookups and hierarchy queries. A terminology microservice, backed by PostgreSQL tables loaded from the NLM RxNorm API/dataset, LOINC's released files, and ICD-10/11 code sets, resolves medications, labs and diagnosis codes respectively. A UMLS Metathesaurus database ties these vocabularies together for cross-terminology synonym resolution. Where no confident mapping exists, the closest candidates are returned (not silently chosen) so the doctor can pick one during verification, with the original free-text term preserved alongside. 

### 4.7 Deduplication & Longitudinal Merge 

Running only after ontology mapping (per the scope document's rationale that normalized codes, not raw text, make duplicates reliably detectable), a dedup engine compares normalized code + value + date proximity across sources. Matches 

are merged into a single observation in PostgreSQL while a provenance linker keeps references to every contributing source document — nothing is deleted. Conflicting values for what looks like the same fact are never auto-resolved; they are routed into the doctor verification queue instead. 

### 4.8 Doctor Verification & Correction Loop 

Camunda BPMN (Community Edition, open-source) models this as an explicit workflow with human tasks, so lowconfidence entities, uncertain identity matches, and conflicting merges all become trackable review tasks rather than implicit states in application code. A FastAPI backend serves a React review UI where the doctor accepts, edits, or rejects each item individually — without re-entering the whole record. Every action is timestamped and logged against the specific entity for audit and for model-improvement feedback. The record cannot progress to FHIR structuring until every flagged item is resolved. 

### 4.9 Clinical Recommendation Engine 

sentence-transformers embeds the doctor's own historical, structured case outcomes; pgvector (a PostgreSQL extension) or FAISS performs similarity search against the current case's diagnosis/demographics/labs to surface “you prescribed X in N similar cases” style suggestions inside the same review UI. Suggestions from the doctor's own history are visually distinguished from longitudinal context sourced from other doctors/hospitals. Nothing is auto-applied; ignored suggestions are logged so they are not repeated identically. 

### 4.10 Document Generation 

Jinja2 templates define the required sections for the Treatment Plan and Discharge Summary; the verified structured record populates them (not open-ended generation), and WeasyPrint renders the final HTML to PDF. Both documents are reviewable and editable by the doctor before finalization, and both reuse the same structured record rather than being authored separately. 

### 4.11 HL7/FHIR Structuring & Persistence 

Once the doctor confirms the record, the Python `fhir.resources` library builds the required FHIR resources, which are checked with the official HL7 FHIR Validator against the chosen Implementation Guide before being persisted to a HAPI FHIR JPA Server — HL7's own open-source, spec-compliant FHIR repository. Where legacy HL7 v2 messaging (ADT, ORU) is also required, Mirth Connect (NextGen Connect, open-source) generates those from the same canonical structured record rather than a separate transformation path. Any resource created by merging duplicate records carries a FHIR Provenance resource listing every contributing source. 

## 5. Structured Data → FHIR Resource Mapping 

|**Structured data**|**FHIR resource**|**Primary upstream stage**|
|---|---|---|
|Patient demographics|Patient|Identity-resolution matcher, current-<br>encounter session|
|Diagnoses / problems|Condition|NER + ICD-10/11 & SNOMED CT<br>mapping, verified by doctor|
|Medications|MedicationStatement /<br>MedicationRequest|NER + RxNorm mapping, verified by<br>doctor|
|Labs & vitals|Observation|HL7 API JSON (labs) or NER-extracted<br>vitals + LOINC mapping|
|Lab reports|DiagnosticReport|HL7 API JSON (labs), grouped<br>Observations|
|Treatment plan|CarePlan|Document Generation stage, from verified<br>structured record|
|Discharge summary / case sheet|DocumentReference / Composition|Document Generation stage|
|Encounter details|Encounter|Current-encounter session metadata|
|Merged/duplicate resources|Provenance|Deduplication & Longitudinal Merge stage<br>— lists every contributing source<br>document/system|



## 6. End-to-End Data Flow 

- 1. Kong receives a payload from one of the four sources and publishes it to its Kafka topic. 

- 2. Historical/external documents pass through Identity Resolution first; current-encounter inputs (STT, OCR, HL7 API for this visit) go straight to Fusion, already bound to the session. 

- 3. The Fusion Service merges all identity-cleared fragments into one time-ordered narrative and archives the raw text in MinIO. 

- 4. MedCAT extracts entities and links them to UMLS concepts; MetaCAT/NegEx attach negation, temporality and certainty. 

- 5. The Terminology Microservice and Snowstorm resolve each entity to RxNorm, LOINC, ICD-10/11 or SNOMED CT codes. 

- 6. The Dedup Engine merges same-fact entities across sources on normalized code + value + date proximity, keeping provenance. 

- 7. Camunda opens a review task for anything low-confidence, ambiguous, or conflicting; the doctor works through it in the React UI, optionally accepting recommendation-engine suggestions. 

- 8. On completion, the structured record drives Treatment Plan / Discharge Summary generation and is transformed into FHIR resources. 

- 9. Resources are validated and persisted to HAPI FHIR; HL7 v2 messages are emitted via Mirth Connect where required; PostgreSQL and MinIO hold the relational and document copies respectively. 

## 7. Technology Stack Summary 

|**Layer / Component**|**Open-Source Technology**|**Role**|
|---|---|---|
|Input Ingestion|Kong API Gateway, Apache Kafka|Unified entry point for the four input<br>sources; decouples ingestion from<br>downstream processing via per-source<br>topics.|



|**Layer / Component**|**Open-Source Technology**|**Role**|
|---|---|---|
|Identity Resolution|OpenEMPI or Python recordlinkage,<br>Elasticsearch|Open-source Master Patient Index /<br>probabilistic record linkage for matching<br>historical documents to the correct patient;<br>Elasticsearch powers fuzzy<br>name/demographic search.|
|Text Fusion|Custom Python microservice, MinIO|Aligns speech/OCR/document fragments<br>into one timeline; MinIO stores immutable<br>raw fragments with provenance.|
|Clinical NLP|MedCAT, scispaCy, MetaCAT, NegEx<br>/ pyConTextNLP|MedCAT (built on spaCy, trained against<br>UMLS) performs entity recognition and<br>concept linking; MetaCAT/NegEx add<br>negation, temporality and certainty<br>classification.|
|Terminology Services|Snowstorm (SNOMED CT server),<br>UMLS Metathesaurus,<br>RxNorm/LOINC/ICD-10-11 lookup<br>service|Maps recognized entities to standard<br>interoperable codes; Snowstorm is<br>SNOMED International's own open-source<br>terminology server.|
|Deduplication & Merge|Custom rules engine (Python<br>`dedupe`/`recordlinkage`), PostgreSQL|Detects the same fact across sources using<br>normalized code + value + date proximity;<br>retains provenance links rather than<br>overwriting.|
|Workflow / Human-in-the-loop|Camunda BPMN (Community<br>Edition), React, FastAPI|Orchestrates the doctor verification loop as<br>a first-class workflow with tasks, timers and<br>audit trail; React is the review UI.|
|Recommendation Engine|sentence-transformers, pgvector or<br>FAISS|Embeds past case notes and retrieves the<br>doctor's own similar historical cases for in-<br>loop, explainable suggestions.|
|Document Generation|Jinja2, WeasyPrint|Template-driven treatment plan and<br>discharge summary generation (HTML -><br>PDF) from the verified structured record.|
|HL7/FHIR Structuring|fhir.resources (Python), HAPI FHIR<br>JPA Server, HL7 FHIR Validator,<br>Mirth Connect (NextGen Connect)|Builds and validates FHIR resources before<br>persisting to the open-source HAPI FHIR<br>repository; Mirth handles legacy HL7 v2<br>ADT/ORU interfacing from the same<br>canonical record.|
|Core Data Stores|PostgreSQL (+ pgvector), MinIO,<br>Elasticsearch, Redis|System of record for MPI, structured<br>entities, and audit trail; object storage for<br>raw documents/PDFs; search index;<br>cache/session store.|
|Security & Compliance|Keycloak (OAuth2/OIDC + RBAC),<br>custom audit service|Central authN/authZ for every service;<br>immutable audit log on every PHI<br>read/write, per NFR 9.|
|Observability|Prometheus, Grafana, OpenTelemetry,<br>Loki/ELK|Metrics, tracing and log aggregation across<br>all microservices.|
|Orchestration & Runtime|Docker, Kubernetes + Helm (Docker<br>Compose for dev)|Container orchestration; Kubernetes<br>recommended for production given the<br>service count and HA/PHI requirements.|



## 8. Security, Privacy & Compliance 

- Keycloak provides OAuth2/OIDC authentication and role-based access control across every microservice, including the Kong gateway edge. 

- Every PHI read/write is captured by a dedicated audit log service writing immutable records to PostgreSQL, satisfying the scope document's auditability and traceability NFRs. 

- The identity-resolution auto-link threshold is deliberately conservative: false-match and false-non-match rates are tracked as two separate metrics, not one blended accuracy figure, per the scope document's patient-safety requirement. 

- TLS terminates at the Kong gateway; internal service-to-service traffic runs inside the Kubernetes cluster network. 

## 9. Deployment View 

Kubernetes (with Helm charts) is recommended for production given the service count and the need for high availability and rolling updates around PHI workloads; Docker Compose is suitable for local development and demonstration. Each layer above maps to one or more independently deployable containers/pods, all fronted by the Kong gateway and connected via Kafka, allowing individual services (e.g. the clinical NLP layer) to be scaled independently of lighter-weight services like the terminology microservice. 

## 10. Traceability to the Scope Document 

Every stage in this architecture maps one-to-one to the eight pipeline stages defined in the project scope document (Identity Resolution & Patient Matching, Text Normalization & Source Fusion, NER & Entity Linking, Ontology & Terminology Mapping, Deduplication & Longitudinal Merge, Context & Relation Extraction, Doctor Verification & Correction Loop, and Structuring & Persistence), so each acceptance-criteria checkbox in that document has a corresponding concrete open-source component here responsible for satisfying it. 

