# EHR and Diabetes Digital Twin Team Guide

Updated 23 October 2026 · Repository snapshot `35775fe`

Repository: https://github.com/VeerabhadraYerram/EHR

## Project purpose and scope

We are extending an existing EHR platform into a diabetes-focused clinical workstation for the Happiest Health Digital Twin Challenge 2026. The aim is to help a clinician understand a patient’s metabolic state, examine relevant organ context and eventually compare supported what-if scenarios.

The current deliverable is a polished frontend demonstration. A separate experimental glucose-model backend exists in the repository, but the active UI is deliberately disconnected from it. The product is not yet an integrated or clinically validated digital twin.

### Who we are building for

Our initial target is adults with Type 2 diabetes, especially patients who also have hypertension, cardiovascular risk or early kidney impairment. Patients do not need diagnosed heart disease and kidney disease to be in scope. CRM means cardio-renal-metabolic: the heart, kidneys and metabolism considered together.

| Organ | Role in this project | Current capability |
| --- | --- | --- |
| Pancreas | Main diabetes and insulin-related context | Atlas view; fictional HbA1c and C-peptide in the UI. No secretion model. |
| Kidneys | Renal context alongside diabetes | Atlas view; renal labs exist in backend data. No renal simulator. |
| Heart | Cardiovascular context | Atlas view and illustrative physiology. No cardiac simulator. |
| Brain | Supporting neurological context | Atlas view and illustrative MRI anatomy. No neurological simulator. |

### The main use case

A clinician reviews a person with Type 2 diabetes, checks glucose patterns and relevant labs, selects an organ for additional context and eventually compares an experimentally modelled scenario. The clinician remains responsible for interpretation and treatment decisions.

Argon’s early-decompensation and drug-titration idea is a longer-term research direction. We should not present that ambition as a capability already implemented.

## Understanding the current interface

The central body illustration is the main workspace. Organ markers and the bottom Body, Pancreas, Kidneys, Heart and Brain bar switch the same viewer to the selected organ. The corrected markers stay registered to the artwork when the screen resizes.

Current UI: http://127.0.0.1:5188/ (after starting Vite).

### What teammates can interact with

- Anatomy: select an organ, inspect its labelled structures and use the illustration controls available in organ views. These are atlas images with overlays, not volumetric 3D reconstructions.

- Related scans: the panel follows organ selection. Brain MRI examples are illustrations. Local PNG, JPEG or WebP images can be previewed without uploading them; other organs start with no scan attached.

- Supporting panels: neural reconstruction, thoracic radiograph, illustrative physiology and ECG, genomics, twin context and simulated MRI acquisition. Box serial numbers are removed.

- Demo controls: switch DEMO A or DEMO B, pause signals, select MRI sequences, run or pause simulated acquisition, explore illustrative DNA bases and export a demo JSON report.

Every displayed clinical value comes from fictional frontend fixtures. There is no live device, patient-record API, actual genomic analysis or clinical inference behind this screen. The removed “Select an organ” instruction strip stays absent from the body viewer.

## How the architecture fits together

There are two related engineering tracks. The EHR track prepares a trustworthy clinical record. The metabolic research track uses structured features to explore glucose predictions. The current visual workstation is a third, intentionally separate presentation layer.

### The EHR reference flow

```text
STT / OCR / historical documents / HL7 input
  -> Identity resolution where required
  -> Source fusion and clinical entity extraction
  -> Terminology mapping and deduplication
  -> Doctor verification
  -> Documents and validated FHIR persistence
```

Speech-to-text and OCR arrive as upstream outputs. Original source fragments and provenance must be preserved. Ambiguous identity matches, low-confidence extraction and conflicting records require review before final persistence. The governing specification remains project_docs/EHR_Architecture_Document.md.

### The metabolic research flow

```text
Historical cohort files
  -> Feature construction
  -> Glucose classifier and trajectory model
  -> Assumption-based scenario branches
  -> Experimental outputs and FHIR mapping code
```

### The current frontend flow

```text
Fictional demo fixtures + atlas artwork + SVG visuals
  -> React diagnostic workstation
  -> Local interactions and browser-only image previews

No frontend-to-backend connection is active.
```

| Boundary | Technology or location | Implementation status |
| --- | --- | --- |
| Frontend | React, TypeScript, Vite | Active UI demonstration |
| Twin service | FastAPI; services/digital-twin | Implemented research endpoints |
| EHR services | services/ ingestion, processing, verification and interoperability | Mixed maturity; several service READMEs still identify development stubs |
| Target infrastructure | Kafka, PostgreSQL, MinIO, Camunda, HAPI FHIR and related components | Reference architecture; not all verified as one connected deployment |

A directory, API endpoint or healthy process is not proof that the complete clinical pipeline works. Confirm each integration and its data contract independently.

## Data models and known limitations

The repository’s data dictionary attributes the research cohort to the Shanghai Type 2 Diabetes study and cites DOI 10.6084/m9.figshare.20444397. These are historical research records, not live Indian patient data. A demonstration name does not change the cohort’s origin.

| Local dataset | Verified count | Meaning |
| --- | --- | --- |
| clinic/patients.csv | 100 patients | 70 learn, 15 tune, 15 test |
| clinic/labs.csv | 1,100 rows | Baseline laboratory observations |
| clinic/medications.csv | 111 rows | Medication records |
| wearables/readings.csv | 112,287 rows | Glucose, meals and related fields |
| training/examples.csv | 89,379 rows | Prepared modelling examples |

### What the backend model computes

ClinicalFeatures defines 24 inputs spanning demographics, labs, medication flags, recent glucose summaries, meals and time of day. An XGBoost classifier and calibrator estimate a future glucose-spike probability. A trajectory regressor produces eight glucose estimates at 15-minute steps through two hours. TreeSHAP reports feature contributions to the classifier; it does not prove causation.

The simulator modifies the predicted baseline with hand-specified intervention curves and multipliers. Branches include walking, carbohydrate reduction, food sequencing, combined lifestyle actions and medication-related experiments. These are research assumptions, not validated treatment-response models.

### What must be fixed or verified

- Reproducibility: an earlier audit recorded trajectory MAE of about 128 mg/dL versus about 17.6 mg/dL for persistence in that local environment. Saved benchmark claims were not reproduced; artifact and library-version warnings remain unresolved. Those audit figures are diagnostic findings, not a replacement benchmark.

- Input mapping: the patient simulation route reads age/gender/lab_name, while current CSVs use age_years/sex/test_name. It also hardcodes several meal and time features. Review these mappings before calling the output patient-specific.

- Uncertainty and safety: forecast interval widths and intervention effects contain assumptions. Existing “Clarke” labels are simplified thresholds, not a proper paired-reference error-grid validation.

- Organ function: glucose forecasts and organ illustrations do not constitute calibrated pancreas, kidney, heart or brain twins. No validated organ-function or early-decompensation model is implemented.

## Run the project locally

Run the UI on its own first. Use Node 22.12 or newer in the supported Vite range; the installed Vite package also allows Node 20.19. Python 3.12 matches the twin service Dockerfile. Commands below assume a macOS or Linux shell.

### Frontend only

```text
git clone https://github.com/VeerabhadraYerram/EHR.git
cd EHR/frontend/doctor-review-ui
npm ci
npm run dev -- --host 127.0.0.1
```

Open http://127.0.0.1:5188/. Both / and /diagnostics show the workstation. Retired frontend routes normalize to /. Port 5188 is strict: if it is occupied, stop the conflicting process or deliberately change the Vite configuration.

```text
# Run inside frontend/doctor-review-ui
npm run build
npm run lint
```

### Optional backend in a separate terminal

Starting this process does not connect the UI. The frontend currently has no API hook or Vite API proxy. Keep that separation until a new integration task is agreed.

```text
# Run from the repository root
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r services/digital-twin/requirements.txt
cd services/digital-twin
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Inspect http://127.0.0.1:8000/docs and /health directly. The service requires the checked-in data and model artifacts under data/digital_twin. Existing dependency minimums do not guarantee compatibility with the serialized models; record the environment before interpreting outputs.

### Tests and infrastructure

```text
# From the repository root with the virtual environment active
python -m pip install pytest
python -m pytest tests/test_digital_twin_service.py -q
```

This command is a service regression check, not clinical validation. Tests import the app and load model artifacts. Historical audit results and test reports must not be described as freshly rerun results.

docker-compose.yml currently includes PostgreSQL, MinIO and a twin container exposing port 8004. Direct local development above uses 8000. Container model/data path handling still needs verification. Older README port, proxy and dashboard descriptions can be stale; check current code.

## Where to work in the repository

The snapshot covered by this guide is main at commit 35775fe, dated 23 October 2026. Start with the component that owns the change rather than replacing the dashboard or architecture wholesale.

| Path from repository root | Responsibility |
| --- | --- |
| frontend/doctor-review-ui/src/diagnostics/DiagnosticWorkstation.tsx | Dashboard composition, central view selection, markers, supporting panels and dialogs |
| frontend/doctor-review-ui/src/diagnostics/organ-twins.css | Body sizing, image-registered hotspots, organ views and responsive layout |
| frontend/doctor-review-ui/src/diagnostics/diagnostics.css | Base workstation styling and original supporting panels |
| frontend/doctor-review-ui/src/diagnostics/OrganScans.tsx | Per-organ scan availability and browser-local image previews |
| frontend/doctor-review-ui/src/diagnostics/OrganVisuals.tsx and organDefinitions.ts | Organ artwork selection, names, structures and landmarks |
| frontend/doctor-review-ui/src/diagnostics/demoData.ts | Fictional DEMO A and DEMO B measurements |
| frontend/doctor-review-ui/src/diagnostics/MedicalVisuals.tsx | SVG anatomy, MRI planes, DNA, thorax and scanner visuals |
| services/digital-twin/main.py and models.py | FastAPI routes and request/response contracts |
| services/digital-twin/engine.py and simulator.py | Model loading, inference, explanations and scenario assumptions |
| services/digital-twin/fhir_mappers.py | Research-output FHIR resource mapping |
| scripts/etl_clinical_cohort.py and train_digital_twin_model.py | Data preparation and model training |
| data/digital_twin/ | Historical cohort, training examples, model artifacts and reports |

### Design boundaries to preserve

Keep the enlarged body illustration, corrected marker registration and bottom organ bar. Separate organ-twin cards have been replaced by supporting diagnostic panels. The genomic panel stays in its middle-right position. No numbered boxes or procedural 3D replacement are part of the current agreed design.

Do not regenerate data or overwrite model artifacts as a side effect of a UI change. Old frontend cohort-generation scripts remain in the repository, but their output is not the source used by the active demo.

## Backend API reference and integration boundary

These routes are implemented in services/digital-twin/main.py. They describe the separate research service; the current frontend does not call them. Use the local /docs page for full schemas.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | /health | Process and model-loading health |
| GET | /api/v1/twin/patients | List cohort patients; optional split filter |
| GET | /api/v1/twin/patients/{id} | Patient profile with labs and medications |
| GET | /api/v1/twin/patients/{id}/readings | Historical readings; default last 96 rows |
| POST | /api/v1/twin/predict | Predict from an explicit ClinicalFeatures payload |
| POST | /api/v1/twin/simulate | Compare baseline and scenario branches |
| POST | /api/v1/twin/simulate/{id} | Build features from a cohort record; mapping review required |
| GET | /api/v1/twin/metrics | Read stored benchmark metadata |
| GET | /api/v1/twin/fhir/bundle/{id} | Generate a research FHIR bundle |

### Rules for a future frontend integration

- Agree the patient identifier, units, observation timestamps, provenance and missing-data behaviour before wiring a screen to an endpoint. DEMO A and DEMO B are fictional fixture labels, not P001 or P002.

- Build features only from information available at the prediction time. Keep historical observations, model predictions and simulated scenarios visibly distinct.

- Show loading, unavailable, error and retry states. Never replace a failed request with invented clinical values or keep the previous patient’s results visible after switching.

- Treat a generated FHIR bundle as an output to validate. Creating JSON is not evidence of official FHIR validation or persistence to a live EHR.

For /simulate, omitting explicit features currently triggers a hardcoded example profile. The convenience patient route has schema-mapping and hardcoded-feature gaps. Fix these before presenting personalized results.

GET /metrics reads saved JSON. It does not rerun evaluation, establish clinical validity or resolve the earlier reproducibility findings.

## Team priorities and shared vocabulary

### Recommended order of work

- Frontend: keep the agreed body-first design stable, maintain accessibility and responsive behaviour, and preserve labels that distinguish illustrative content from patient data.

- Data and backend: document schemas and units, repair patient-to-feature mapping and remove silent clinical defaults. Keep data provenance and patient-level train, tune and test separation explicit.

- Model validation: reproduce artifact loading in a recorded environment, compare with a persistence baseline, evaluate calibration and trajectory error, and check that no future observations enter features.

- Clinical and product review: choose a narrow diabetes use case, review scenario assumptions and define what evidence is required before broader CRM, drug-titration or organ-function claims.

A useful next integrated milestone is one patient, one known observation time, one reproducible baseline forecast and one clearly labelled research scenario. It should include measured-versus-predicted provenance, failure handling and clinician review. This is a proposed next milestone, not a feature already connected.

### Before merging a change

For UI work, run the build and lint, check desktop and mobile layout, exercise body markers and all bottom organ tabs, and verify the browser makes no backend requests while frontend-only mode is required. For model or API work, add meaningful contract and regression checks and record validation limitations. Update progress.md for significant work. Follow agent.md: commit and push only with explicit user authorization.

### Terms used in this project

EHR: electronic health record. CGM: continuous glucose monitoring. HbA1c: a recorded longer-term glucose marker. C-peptide: an insulin-related lab measurement. eGFR: an estimate of kidney filtration. FHIR: a healthcare data exchange standard. SHAP: feature-attribution scores explaining a model output. An organ atlas is a visual representation; a functional organ twin needs a personalized, validated model.

### Reading order and sources

- project_docs/EHR_Architecture_Document.md — governing reference architecture; do not overwrite it.

- project_docs/EHR_Clinical_NLP_HL7_Project_Scope (1).md and EHR_Timeline_and_Milestones.md — original EHR scope and delivery plan, not a current completion report.

- project_docs/Organ_Twin_Artwork.md — generated artwork provenance, prompts and scan-preview limitations.

- data/digital_twin/DATA_DICTIONARY.md and MODEL_BENCHMARK_REPORT.md — schema and historical modelling claims; read with the audit caveats in progress.md.

- progress.md — dated implementation history and the 23 October 2026 competition-fit/model evidence audit. Older dashboard features in the log may have been retired.
