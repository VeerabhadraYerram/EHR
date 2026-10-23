# Digital Twin Challenge implementation audit

Reviewed 24 October 2026 (IST). Scope: repository source, running workstation on port 5188, local APIs on ports 8000/8002/8003/8004, existing tests and build. This is an implementation audit against the supplied challenge description and repository plans; the complete external submission guidelines were not independently checked. No application source was changed.

## Assessment

The project has a substantial Type 2 diabetes proof of concept: clinical cohort processing, trained XGBoost models, a working prediction/simulation API, and an interactive anatomy workstation. The main unfinished work is connecting these pieces consistently. The running screen does not currently demonstrate trained-model inference at each timeline position.

The anatomy artwork has convincing depth and animation, but is implemented as 2D PNG/SVG artwork with CSS transforms. Actual 3D body/organ meshes and a patient-specific anatomical reconstruction are not implemented.

“Complete” below means implemented within the stated prototype scope. It does not mean clinically validated or production ready. “Partial” includes backend capabilities that are missing from the active UI.

## Implemented

| Capability | Evidence and boundary |
|---|---|
| React/TypeScript workstation | Running on 5188. Build and lint pass. Active application is `DiagnosticWorkstation`; `/` and `/diagnostics` are supported. |
| 100-patient registry | Bundled cohort JSON loads 100 patients with search/filter code, risk tiers, selection and EHR profile panels. Patient switching was exercised. |
| Clinical data preparation | Shanghai cohort ETL, patient/lab/medication tables, CGM readings and training examples exist. Manifest reports 112,287 readings and 89,379 examples. Data tests pass. |
| Patient-separated datasets | Data tests verify 70 learn / 15 tune / 15 test patients and no patient overlap. The UI's displayed split labels have a separate bug described below. |
| Trained dual-head model | Saved XGBoost classifier, isotonic calibrator, eight-horizon regressor, feature definitions, SHAP summary and metrics exist and load. |
| Model inference API | Port 8004 responds to patient queries and transient simulation requests. Prediction engine uses trained weights and real TreeSHAP. |
| Benchmark pipeline | Training source contains patient-separated evaluation, logistic regression and heuristic classifier comparisons, and persistence trajectory comparison. Current tests check saved metric thresholds; this audit did not retrain or independently recompute all scores. |
| Recorded CGM playback controls | Patient P001 loads 96 readings. Playback, pause and timeline scrubbing work after selection. This is recorded data replay. |
| Anatomy presentation | Body, pancreas, kidneys, heart and brain views render. Organ selection, labels, angle, magnification and reset are implemented. Organ navigation was exercised. |
| Physiological visual effects | Body flow, heartbeat, renal flow, islet secretion and neural SVG/CSS animations exist. Effects respond to frontend estimated telemetry. |
| Genomic illustration | DNA helix and nucleotide explorer are implemented with a fixed sample sequence. This is an educational visual only. |
| Report interface | Report modal renders patient summary and recommendation. JSON export code exists. It uses stored simulation data rather than the forecast panel's current calculation. |
| Core EHR backend foundations | Ingestion adapters, PostgreSQL models, raw payload storage/hashing, identity matching/review endpoints, and quarantine-aware fusion/timeline code exist. Live checks returned 8 documents, 3 EHR patients, identity queue data and a patient timeline. |

## Partially implemented

| Capability | What remains |
|---|---|
| EHR + CGM + prediction integration | The active workstation primarily reads a bundled ~19.96 MB JSON file. It does not call the trained prediction endpoint when the timeline changes. The legacy EHR database and twin CSV cohort remain separate data paths. |
| Two-hour forecast UI | `GlucoseForecastPanel.tsx` calculates its own eight-point curve and probability using hand-written momentum, meal and clearance formulas. It does not render the trained regressor trajectory as its main forecast. |
| Risk consistency | Registry/header/report use stored risk; forecast uses a different calculation. Observed P001 at 04:15: header/report 96% HIGH, forecast 9% CALM, glucose 139 mg/dL. These values do not describe one shared prediction state. |
| Explainability display | Backend TreeSHAP is implemented. Frontend cohort mapping substitutes fixed attribution values and the forecast panel rewrites some values using formulas. The “Exact SHAP” and additive-consistency labels are unsupported for these displayed values. |
| Patient initialization | Selected ID starts as P012 before the async cohort cache loads. The loaded first high-risk patient is also P012, so the patient-load effect need not run again. Observed initial P012 screen had 0 readings, fallback glucose/risk and an active connection label. Selecting P001 populated readings. |
| API routing | Vite sends all `/api` requests to ingestion on port 8000. `/api/v1/twin/patients` through 5188 returns 404, while port 8004 serves the actual twin API. Static data masks this problem. |
| Patient-targeted backend features | Source reads `age` and `gender`, while patient CSV columns are `age_years` and `sex`; lab lookup reads `lab_name`, while CSV uses `test_name`. Defaults can replace actual patient data. Meal timing/carbs and acceleration are also hard-coded in this path. |
| What-if simulations | Backend branches implement walking, carbohydrate reduction, food sequencing, compound lifestyle and medication confirmation. They apply assumed kinetic adjustments and risk multipliers; they do not establish treatment effects from outcome data. Current workstation has no interactive intervention-comparison workflow. |
| Multi-organ physiological twin | `kineticEngine.ts` derives organ states from glucose, baseline labs and constants. Heart rate/shear stress and neural status are estimates, not acquired measurements or separately validated organ models. |
| Patient facts and provenance | Some frontend lipids are fixed for all patients; “fasting glucose” is derived from daily minimum glucose or HbA1c rather than necessarily the recorded fasting lab. Names are fictional aliases on Shanghai cohort profiles. Defaults and derived values need explicit labels. |
| Split labels | Frontend assigns splits from patient-ID cutoffs instead of the source table. Eight patient labels disagree with actual CSV splits. This is a display bug, not evidence of training leakage. |
| Time alignment | Simulation is loaded per patient, not per scrubber position. Explanations and report may refer to a different moment. Forecast velocity uses the preceding single reading divided by 0.5 hours, while the wearable panel uses two intervals; they can disagree. |
| Data freshness and uncertainty | Empty/missing data produces plausible fallback values. Connection badges are unconditional. No robust stale-data or insufficient-history state is exposed. Forecast envelopes use assumed widths rather than validated interval coverage. |
| FHIR output | Working API serializes a three-resource collection: Observation, RiskAssessment, CarePlan. No Patient resource is included. Full standards validation, Provenance, doctor approval and persistence to a FHIR repository are unfinished. |
| Clinical NLP | Regex/dictionary extraction, confidence and context heuristics exist; five clinical-case tests pass. Full architecture-described MedCAT/scispaCy/context integration is unfinished. |
| Terminology subsystem | pgvector schema, seed loader, embeddings and candidate retrieval API exist. End-to-end entity linking and routing through the complete verification/persistence pipeline are unfinished. Live terminology retrieval was not verified in this audit. |
| Doctor review | Identity-resolution review/confirmation backend exists. The current React entry point has no `/review` or `/timeline` screen; unsupported paths are rewritten to `/`. Full entity correction/approval workflow is unfinished. |
| Scan and deep-dive components | `OrganScans` and separate organ deep-dive components exist in source, but are not imported by the active workstation. Their existence is not an accessible feature in the running UI. |
| Documentation and packaging | Architecture, plans, benchmark report and earlier technical PDFs exist. README startup instructions reference a missing compose filename. Artwork documentation says frontend-only/no proxy, contrary to current code. Progress log contains outdated model names, counts and scores. |
| Test integration | The focused digital-twin suite passes, but a combined repository test invocation fails collection because separate services import generic module names such as `models`. Model loading emits sklearn/XGBoost version warnings. |

## Not implemented in the active product / repository scope reviewed

| Capability | Status |
|---|---|
| Actual 3D anatomy engine | No Three.js/Babylon/WebGL scene, organ mesh loader, GLB/glTF model or orbit camera in the active frontend. Angle control tilts a flat illustration. |
| Patient-specific anatomy | No scan segmentation, volumetric reconstruction, individualized organ geometry, or calibrated organ mechanics. |
| Live wearable connection | No working Libre/Dexcom/Fitbit integration, Bluetooth ingestion, wearable authorization flow, stream subscription or device pairing. Public CGM replay is implemented instead. |
| Patient genomics | No genomic uploads, variant calling, patient sequence data or genotype-based risk prediction. Fixed sequence is decorative/educational. |
| Complete clinical deduplication workflow | Dedicated service contains only a health endpoint. |
| Complete entity verification workflow | Dedicated verification service contains only a health endpoint; identity confirmation is a separate implemented subset. |
| Similar-case recommendation service | Dedicated recommendation service contains only a health endpoint. Twin what-if recommendations are separate code. |
| Treatment/discharge document service | Dedicated document-generation service contains only a health endpoint. Browser JSON dossier export is a separate feature. |
| General HL7/FHIR persistence services | Dedicated interoperability FHIR and HL7 services are stubs; no complete hospital write-back pipeline. |
| Central audit service | Dedicated audit service is a stub. Existing identity audit rows and source hashes cover narrower areas. |
| Standalone context service | Health-only stub. Baseline NLP includes some context heuristics. |
| Authentication and clinician roles | No implemented OIDC/JWT/RBAC enforcement found on the reviewed APIs. Compose also configures anonymous raw-object download; this is a deployment gap for non-demo data. |
| Notification delivery and alert lifecycle | No completed clinician notification delivery, acknowledgment/escalation or alert outcome tracking found. |
| Broader wearable features | Steps, sleep and real measured heart rate are not part of the current 24-feature model. Medication prescription status exists; dose adherence tracking is unfinished. |
| Indian-cohort or prospective validation | No evidence of independent Indian-population validation, prospective deployment evaluation or validated intervention outcomes. |
| Complete submission package | No clearly identified final competition submission checklist/video/presentation package found. Exact external submission requirements need separate verification. |

Upstream speech recognition and OCR engines are explicitly out of scope in the architecture: the implemented pipeline consumes their JSON output. Their standalone service stubs should not be confused with a failure to implement the JSON adapters.

## Metrics supported by the saved artifact

Source: `data/digital_twin/model/metrics.json`; these are stored held-out evaluation results, not freshly recomputed scores.

| Metric | Value |
|---|---:|
| Calibrated classifier ROC-AUC | 0.8852 |
| PR-AUC / average precision | 0.6058 |
| Brier score | 0.0907 |
| Sensitivity / recall at threshold 0.22 | 57.67% |
| Precision | 58.87% |
| False-positive rate | 7.37% |
| Mean trajectory MAE across horizons | 15.93 mg/dL |
| +120 minute MAE | 23.57 mg/dL |
| MAE improvement over persistence | 9.4% |
| Aggregate Clarke zones A + B | 99.73% |

The progress log's LightGBM wording, 86.4% recall, PR-AUC 0.7814 and Brier 0.1147 do not match the current artifact. The screen's unconditional “Zone A / Clinically Safe / No Hypoglycemia Hazard” is hard-coded, not a per-prediction validation result. Aggregate Clarke results do not establish the safety of every displayed forecast.

## Verification results

- `npm.cmd run build`: passed.
- `npm.cmd run lint`: passed.
- Focused suite: `python -m pytest tests/test_clinical_data_pipeline.py tests/test_model_performance.py tests/test_digital_twin_service.py -q`: **19 passed**, with model-version warnings. Run outside the restricted sandbox after the initial sandboxed attempt stalled.
- NLP: `python -m pytest services/clinical-processing/nlp/test_clinical_cases.py -q`: **5 passed**, with datetime deprecation warnings.
- Combined repository suite: **2 collection errors** in week-1/week-2 tests from generic `models` imports colliding with digital-twin models. The database-mutating week-1/week-2 suites were not separately rerun.
- Local API checks: ingestion, identity, fusion and twin health returned 200. Document/patient lists, identity queue and fusion timeline returned 200. Twin patient list returned 100 records; simulation and FHIR bundle returned 200 on port 8004.
- UI proxy check: `http://localhost:5188/api/v1/twin/patients` returned **404**.
- Browser checks: initial load, patient switching, playback/pause, scrubber, body and four organ views, and report modal. JSON export was source-inspected; download contents were not separately verified. Responsive and exhaustive accessibility testing were not performed.

## Recommended order before a jury demo

1. Fix routing and initial cohort loading so the first screen has real data and honest connection/error states.
2. Feed the selected patient's as-of-time features to the trained model. Use its response consistently for header, registry/current risk, chart, SHAP, report and export.
3. Remove fixed SHAP values and unsupported safety labels; distinguish assumptions, recorded measurements and unavailable facts.
4. Correct patient feature column names, split labels, glucose velocity and missing meal context. Preserve timestamps and source provenance.
5. Expose one clear what-if comparison and a held-out example where a warning precedes an observed threshold crossing. Distinguish an existing spike from a future incident warning.
6. Update README, reported scores, reproducible dependency versions and test imports; prepare the final competition-specific documentation/demo package.
7. If actual 3D is still desired, implement a mesh viewer with body/organ geometry and camera controls. The current atlas artwork can continue to support the demo while the prediction integration is completed.
