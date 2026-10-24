# EHR Clinical Intelligence & Metabolic Digital Twin

A local diabetes digital-twin demonstration alongside an EHR ingestion, identity-resolution and clinical-review pipeline. The React workstation combines recorded CGM playback, a trained spike classifier and glucose trajectory model, model explanations, intervention exploration and an anatomical atlas. The workstation now includes licensed layered 3D mesh anatomy, a reproducible synthetic CT-to-mask-to-mesh pipeline, patient-linked VCF exploration, model-grounded scenario conversation and care operations. Original atlas previews remain available. See `docs/DEMO_AND_INTEGRATION_GUIDE.md` for checkpoint evidence and exact integration limits.

The 100-person demonstration cohort contains real-source-derived data and synthetic demonstration context. Read the dataset manifest and provenance labels before interpreting any result. Synthetic realism is not independent clinical validation.

## Challenge use case and submission readiness

The healthcare problem is anticipating incident glucose spikes in Type 2 diabetes
from clinical history and continuous glucose recordings, so a clinician can review
the forecast and explore explicitly assumption-based lifestyle scenarios. The
stack uses React/TypeScript/Vite/Three.js, Python/FastAPI, calibrated XGBoost and
multi-horizon glucose regressors with genuine TreeSHAP explanations. The wider
local EHR pipeline uses PostgreSQL, MinIO and a SQLite demonstration review store.

See [functional QA and official-requirements checklist](docs/FUNCTIONAL_QA_AND_HACKATHON_READINESS_2026-10-24.md).
Before submission, add actual team and college/incubator details, a qualifying
20-minute-or-longer demo-video link, the final presentation PDF/PPT, current twin
architecture PDF/PPT and owner-approved project license details. Verify public
repository access and the required team/college folder name. These items are not
claimed complete by the running application.

## Local startup

Run from the repository root in PowerShell. Use Python, Node/npm and Docker Desktop with Compose available. Model artifacts and cohort files must already exist under `data/digital_twin`.

```powershell
python -m pip install -r requirements-demo.txt
npm --prefix frontend/doctor-review-ui ci
python scripts/run_app.py
```

The runner starts PostgreSQL and private MinIO through Docker Compose, then local ingestion, identity resolution, clinical fusion, the twin, local workflows and Vite. The twin runs **once locally by default**. To run that service in Docker instead, use `python scripts/run_app.py --twin-mode docker`; stop any existing port-8004 owner first. For separately managed infrastructure, use `--skip-infra`. The Docker twin image may require downloading/building dependencies on first use.

The runner reuses services that already pass HTTP health checks. It stops only processes it started; reused processes and Docker containers remain running. An occupied unhealthy port fails startup rather than opening the UI on an unexpected alternate port.

```powershell
python scripts/run_app.py --check
```

The check reports measured endpoint availability and returns a nonzero exit code for unavailable services. Health checks alone do not prove model correctness, external hospital integration or clinical safety.

| Component | Address |
|---|---|
| React workstation | http://localhost:5188 |
| Ingestion and baseline NLP | http://localhost:8000/docs |
| Identity resolution | http://localhost:8002/docs |
| Clinical fusion | http://localhost:8003/docs |
| Trained twin inference | http://localhost:8004/docs |
| Persistent local review workflows | http://localhost:8005/docs |
| Synthetic imaging reconstruction | http://localhost:8006/docs |
| Patient-linked VCF ingestion | http://localhost:8007/docs |
| Cross-service access audit | http://localhost:8008/docs |
| MinIO development console | http://localhost:9001 |

The workflow service must be started from the repository root when launched manually:

```powershell
python -m uvicorn services.workflows.main:app --host 127.0.0.1 --port 8005
```

Vite routes `/api/v1/twin` to 8004, `/api/v1/workflows` to 8005, imaging to 8006, genomics to 8007, audit to 8008, identity to 8002, fusion to 8003 and remaining `/api` requests to ingestion on 8000. The optional terminology proxy points to 8001; terminology infrastructure is separately configured with `docker-compose.terminology.yml`. A deployed frontend needs equivalent server/reverse-proxy routes; Vite's development proxy is not part of a static production build.

Default PostgreSQL and MinIO credentials in Compose are for local development. Raw objects are private. Do not enable anonymous download access for clinical documents. The legacy `.env.example` lists broader architecture components and does not match every local Compose hostname/default; configure actual deployed services explicitly.

## What is local versus externally integrated

The authoritative design is `project_docs/EHR_Architecture_Document.md`. Existing ingestion adapters accept OCR/STT/HL7-shaped inputs, preserve source fragments, quarantine historical identity uncertainty and expose review/timeline endpoints. The dedicated local workflow service persists review, conflict handling, document and alert demonstrations in SQLite. The default synthetic demo uses actor labels; optional OIDC mode derives identity from verified Keycloak access tokens and enforces backend roles and assignments.

Full MedCAT models/terminology releases, an actual Keycloak realm/login acceptance, Camunda orchestration, official profile validation, configured HAPI/hospital delivery, immutable off-host audit, live wearable accounts and independent clinical validation still require their corresponding external components and acceptance evidence. Keycloak/JWT controls and the FHIR transaction client are implemented and locally tested; an external deployment is not asserted. A downloaded FHIR bundle is not proof of successful hospital persistence.

See `docs/RESEARCH_MISSING_CAPABILITIES_2026-10-24.md` for verified primary sources, anatomy asset licensing, scan reconstruction and the phased integration plan. Original twin previews are preserved alongside the new licensed GLB meshes.

## Verification

```powershell
npm --prefix frontend/doctor-review-ui run build
npm --prefix frontend/doctor-review-ui run lint
python -m pytest --collect-only -q
python -m pytest -q
```

The Week 1/2 integration tests require PostgreSQL and the running identity/fusion services. They write the repository's sample/test records into the configured development database; use a disposable development instance. Combined collection uses scoped imports so independent services' generic `models` and `engine` names do not collide. API tests use FastAPI TestClient and need an environment where local sockets are permitted.

Normal inference now uses fingerprint-verified native XGBoost JSON models and NumPy-based isotonic interpolation, avoiding incompatible sklearn pickle loading. Portable export was compared against the legacy artifacts on 500 real vectors spanning all 100 patients: trajectory outputs matched exactly and calibrated probability differed by at most 5.96e-8. Legacy pickle artifacts remain intact for reproducibility; tests that explicitly load them can still report version warnings. Regenerate portable artifacts with `python scripts/export_portable_twin_models.py` after changing models. Training also exports portable artifacts automatically.

## Repository layout

- `frontend/doctor-review-ui/`: React/Vite workstation.
- `services/`: independent ingestion, identity, clinical-processing, twin and workflow services plus architectural service boundaries.
- `packages/ehr-contracts/`: shared canonical contracts.
- `data/`: demonstration cohort, model artifacts and sample inputs.
- `scripts/`: startup, ETL, data/model and presentation utilities.
- `tests/`: data/model/API and integration tests.
- `docs/`, `project_docs/`: implementation evidence, research and architecture.
