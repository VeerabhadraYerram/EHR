# Patient evidence assistant

Implemented locally on top of main `3186794` (24 October 2026). The user is a clinician reviewing the selected research profile, not the patient.

## What works

- `/scenarios` provides a clinician-facing conversation with patient/time-scoped questions, recent conversation context, source inspection, copy, retry, cancellation, and context reset.
- `POST /api/v1/twin/patients/{patient_id}/assistant` retrieves the selected cohort record. Names and original source patient IDs are excluded from model context. Question/history text is sent externally, so identifying details should not be entered. Token-shaped credentials and email addresses are redacted from provider input.
- Two language-model stages route the question and write a cited explanation. Groq is the default; OpenRouter is the fallback. Providers, model IDs and external access are configurable through server environment variables or ignored root `.env`; `.env.example` contains placeholders only. Both connections were tested. No secret is exposed through Vite or status endpoints.
- The Python backend owns the data, calculations, citations and chart values. The model cannot issue SQL, run code, write EHR records, choose arbitrary image URLs, fetch another patient's record, or create a scan.
- Lifestyle calculations allow walking, carbohydrate reduction, carbohydrate sequencing and the walking/carbohydrate combination. Explicit amounts/units are checked against recent user context. Unsupported medication interventions, missing amounts, negation and increased-carbohydrate requests do not silently become a supported reducing scenario.
- Numerical simulations are withheld for a legacy model runtime or recorded baseline glucose at/above the model's evaluated domain. Questions about the record can still be answered without a forecast.
- Responses distinguish source facts, computed patterns, predictions, hypothetical effects, explanations and evidence limits. Mandatory factual summaries for HbA1c, renal markers, medications and simulation outputs come directly from retrieved values; language-model prose cannot overwrite those summaries.
- Source IDs, source-kind compatibility and numerical grounding are checked. Rejected/unavailable AI interpretations fall back to a readable, question-specific evidence answer; real computed scenario charts remain available.

## Visual explanations

Visuals are application components, not generated screenshots or synthetic clinical evidence:

- Recorded glucose line chart for the requested history window, with gaps preserved and exact tabular values available.
- Baseline/scenario curves on the same axes, using the actual simulator response.
- Separate lab/profile cards preserving units and source dates; unrelated units are never compared on one quantitative axis.
- Evidence/interpretation/limitation diagrams using the answer's sourced claims.
- Slice browsing of an existing matching study; synthetic phantoms are prominently identified. No new scan is generated as an answer, and scans are not interpreted diagnostically by the language model.

## Evidence and boundaries

- Baseline patient/lab/medicine CSVs, historical CGM/meal records at or before decision time, and accepted/edited local workflow facts are eligible sources. Reviewed facts do not retrain the model.
- Baseline fields may be derived/imputed; processed lab timestamps are not verified collection times. Medication dose text is derived. The source medication text and derived medication table can conflict and require clinician reconciliation.
- No identity mapping to the legacy STT/OCR encounter is assumed. Clinical scans, urine albumin, potassium, live sensor integration and individualized targets must not be invented.
- General explanations use a bounded, source-linked NIDDK reference pack: A1C, activity/food, kidney assessment, medicines and glucose monitoring. This is not an exhaustive medical retrieval system or a live guideline-search agent.
- Citation existence and numerical checks are guardrails, not semantic proof. LLM explanations still require human review. The prototype is neither foolproof nor clinically validated, and does not prescribe or establish a diagnosis.
- The actual CGM data are historical. Calling an API or calculating a prediction now does not turn the source measurement into a live reading.

## Model corrections included

The portable artifacts were created with XGBoost 3.2. Older XGBoost could silently load vector-intercept models incorrectly. The service now rejects versions older than 3.2; requirements also specify compatible SHAP and NumPy versions. JSON metadata fingerprints accept only equivalent LF/CRLF byte conversion; changed content remains rejected. Portable predictions are used without sklearn pickle inference.

The simulator no longer floors lifestyle branches at 70 mg/dL, which previously concealed low-glucose trajectories and made zero-change scenarios differ from baseline. Low values remain visible and flagged; approximate sensitivity envelopes include their own central curve. Gentle/moderate/brisk walking factors are distinct. Medication branches were removed from automatic frontend comparisons. Zero-walk presets omit invalid walking branches, and sliders track assistant-selected parameters.

On the saved held-out partition (15,467 examples from 15 patients), the corrected portable runtime produced mean trajectory MAE **15.927 mg/dL**, versus **17.582 mg/dL** for persistence. This is a re-evaluation of the existing research test split, not independent clinical validation or evidence of causal intervention accuracy. For P001 at `2021-03-04T02:13:00`, the corrected baseline peak is **162.7 mg/dL**; a 30-minute moderate-walk assumption produces **153.8 mg/dL**. These are model outputs, not recorded future outcomes.

## Setup and verification

1. Install `requirements-demo.txt` into the project virtual environment.
2. Set `GROQ_API_KEY` and/or `OPENROUTER_API_KEY` on the backend. Default models: `openai/gpt-oss-120b` on Groq; `openai/gpt-4.1-mini` on OpenRouter. Set `ASSISTANT_ALLOW_EXTERNAL=false` for local evidence-only operation.
3. Start the stack with `.venv/bin/python scripts/run_app.py` and open `/scenarios`.
4. Check `/api/v1/twin/assistant/status` for configuration and data-transfer disclosure. Configured does not mean every provider request will succeed.
5. Targeted checks: `.venv/bin/python -m pytest tests/test_patient_assistant.py tests/test_twin_asof.py tests/test_digital_twin_service.py tests/test_security.py -q`; frontend build and lint.

Approved external-provider tests use only pseudonymous demonstration cohort data. A public or real-patient deployment needs its own authorization and data-governance decisions. Keys pasted into chat should be rotated before sharing or deployment.
