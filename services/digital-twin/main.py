"""FastAPI Microservice for the Type 2 Diabetes Metabolic Digital Twin Platform.

Exposes RESTful endpoints for:
1. Live Dual-Head Model Inference (Calibrated Risk + Continuous Trajectory + TreeSHAP).
2. Dynamic In-Silico 'What-If' Counterfactual Simulation.
3. HL7 FHIR R4 Resource Serialization (Observation, RiskAssessment, CarePlan).
4. Patient Registry and Clinical Telemetry Queries.
"""

from __future__ import annotations

import hashlib
import csv
import json
import os
from functools import lru_cache
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

try:
    from .cohort import build_features, patient_readings
    from .engine import DigitalTwinEngine
    from .fhir_mappers import to_fhir_care_plan, to_fhir_observation, to_fhir_risk_assessment, to_fhir_patient, to_fhir_provenance, validate_bundle
    from .models import (
        ClinicalFeatures,
        InterventionSpec,
        PredictionResponse,
        SimulationRequest,
        SimulationResponse,
    )
    from .simulator import MetabolicDigitalTwinSimulator
except ImportError:
    from cohort import build_features, patient_readings
    from engine import DigitalTwinEngine
    from fhir_mappers import to_fhir_care_plan, to_fhir_observation, to_fhir_risk_assessment, to_fhir_patient, to_fhir_provenance, validate_bundle
    from models import (
        ClinicalFeatures,
        InterventionSpec,
        PredictionResponse,
        SimulationRequest,
        SimulationResponse,
    )
    from simulator import MetabolicDigitalTwinSimulator

if os.getenv("DATA_DIR"):
    DATA_DIR = Path(os.environ["DATA_DIR"])
else:
    _parents = Path(__file__).resolve().parents
    ROOT = _parents[2] if len(_parents) > 2 else _parents[0]
    DATA_DIR = ROOT / "data" / "digital_twin"

app = FastAPI(
    title="Metabolic Digital Twin Service",
    description="Live In-Silico Glycemic Simulation & Incident Forecasting Microservice",
    version="1.0.0",
)

# Enable CORS for frontend applications
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Engine and Simulator on startup
engine = DigitalTwinEngine()
simulator = MetabolicDigitalTwinSimulator(engine)


@app.get("/health")
def health_check() -> Dict[str, Any]:
    """Health check returning loaded model status and operational parameters."""
    return {
        "status": "healthy",
        "service": "digital-twin",
        "version": "1.0.0",
        "models_loaded": {
            "classifier": "XGBClassifier (Calibrated Isotonic)",
            "trajectory_regressor": "MultiOutputRegressor (XGBRegressor 8-Horizons)",
            "explainability": "shap.TreeExplainer (TreeSHAP)",
        },
        "serialization_format": engine.serialization_format,
        "model_fingerprint": engine.model_fingerprint,
        "optimal_decision_threshold": engine.optimal_threshold,
        "cohort_patients_loaded": 100,
        "timestamp": datetime.now().isoformat(),
    }


@app.get("/api/v1/twin/patients")
def list_patients(
    split: Optional[str] = Query(None, description="Filter by split (learn, tune, test)")
) -> List[Dict[str, Any]]:
    """List virtual patients in the clinical digital twin cohort."""
    patients_file = DATA_DIR / "clinic" / "patients.csv"
    if not patients_file.exists():
        raise HTTPException(status_code=404, detail="Clinical patients database missing.")

    patients = []
    with patients_file.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if split and row.get("split") != split:
                continue
            patients.append(row)

    from ehr_security import assigned
    return [p for p in patients if assigned(p["person_id"])]


@app.get("/api/v1/twin/patients/{patient_id}")
def get_patient(patient_id: str) -> Dict[str, Any]:
    """Get complete clinical baseline profile and current active medications for a patient."""
    patients_file = DATA_DIR / "clinic" / "patients.csv"
    labs_file = DATA_DIR / "clinic" / "labs.csv"
    meds_file = DATA_DIR / "clinic" / "medications.csv"

    found_patient = None
    with patients_file.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["person_id"] == patient_id:
                found_patient = dict(row)
                break

    if not found_patient:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found.")

    # Attach labs
    labs = []
    if labs_file.exists():
        with labs_file.open(encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if row["person_id"] == patient_id:
                    labs.append(row)

    # Attach meds
    meds = []
    if meds_file.exists():
        with meds_file.open(encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if row["person_id"] == patient_id:
                    meds.append(row)

    found_patient["labs"] = labs
    found_patient["medications"] = meds
    return found_patient


@app.get("/api/v1/twin/patients/{patient_id}/readings")
def get_patient_readings(
    patient_id: str, limit: int = Query(96, ge=0, le=100000, description="Number of 15-min intervals (0 = all)"),
    date: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
) -> List[Dict[str, Any]]:
    """Get time-series continuous sensor telemetry for a patient."""
    readings_file = DATA_DIR / "wearables" / "readings.csv"
    if not readings_file.exists():
        raise HTTPException(status_code=404, detail="Readings database missing.")

    get_patient(patient_id)
    readings = []
    with readings_file.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["person_id"] == patient_id and (date is None or row["reading_time"].startswith(date)):
                readings.append(row)

    return readings[-limit:] if limit else readings


@app.post("/api/v1/twin/predict", response_model=PredictionResponse)
def predict_glucose_spike(
    features: ClinicalFeatures,
    person_id: Optional[str] = "P001",
    decision_time: Optional[str] = None,
    threshold: Optional[float] = None,
    alert_mode: Optional[str] = None,
) -> PredictionResponse:
    """Execute live dual-head inference for an arbitrary clinical feature state."""
    dt = decision_time or datetime.now().isoformat()
    return engine.predict(
        features,
        decision_time=dt,
        person_id=person_id,
        threshold=threshold,
        alert_operating_mode=alert_mode,
    )


@app.post("/api/v1/twin/simulate", response_model=SimulationResponse)
def simulate_counterfactuals(request: SimulationRequest) -> SimulationResponse:
    """Execute live In-Silico 'What-If' Simulation across candidate clinical/lifestyle interventions."""
    pid = request.person_id or "P001"
    dt = datetime.now().isoformat()

    features = request.features
    provenance = {}
    if features is None:
        features, dt, provenance = _cohort_features(pid, request.decision_time)
    else:
        dt = request.decision_time or dt

    baseline, branches, recommendation = simulator.simulate_interventions(
        features=features,
        interventions=request.interventions,
        decision_time=dt,
        person_id=pid,
        threshold=request.threshold,
        alert_operating_mode=request.alert_mode,
    )

    baseline.feature_provenance = provenance
    return SimulationResponse(
        person_id=pid,
        decision_time=dt,
        baseline=baseline,
        counterfactual_branches=branches,
        optimal_recommended_action=recommendation,
    )


@app.get("/api/v1/twin/metrics")
def get_model_metrics() -> Dict[str, Any]:
    """Return comprehensive validation and benchmark metrics for the dual-head digital twin models."""
    metrics_path = DATA_DIR / "model" / "metrics.json"
    if not metrics_path.exists():
        raise HTTPException(status_code=404, detail="Metrics report file missing.")
    return json.loads(metrics_path.read_text(encoding="utf-8"))


def _cohort_features(patient_id: str, decision_time: Optional[str]):
    try:
        return build_features(DATA_DIR, patient_id, decision_time)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except (ValueError, KeyError) as exc:
        raise HTTPException(422, str(exc)) from exc


@app.get("/api/v1/twin/patients/{patient_id}/predict", response_model=PredictionResponse)
def predict_patient(
    patient_id: str,
    decision_time: Optional[str] = None,
    threshold: Optional[float] = None,
    alert_mode: Optional[str] = None,
):
    features, dt, provenance = _cohort_features(patient_id, decision_time)
    result = engine.predict(
        features,
        decision_time=dt,
        person_id=patient_id,
        threshold=threshold,
        alert_operating_mode=alert_mode,
    )
    result.feature_provenance = provenance
    return result


@app.get("/api/v1/twin/patients/{patient_id}/dates")
def get_patient_dates(patient_id: str):
    get_patient(patient_id)
    readings = patient_readings(DATA_DIR, patient_id)
    counts = {}
    for row in readings:
        day = row['reading_time'][:10]
        counts[day] = counts.get(day, 0) + 1
    dates = sorted(counts)
    complete = [d for d in dates if counts[d] >= 96]
    return {"dates": dates, "default_date": (complete or dates or [None])[-1], "reading_counts": counts}


@app.post("/api/v1/twin/simulate/{patient_id}", response_model=SimulationResponse)
def simulate_patient_counterfactuals(
    patient_id: str,
    interventions: Optional[List[InterventionSpec]] = None,
    decision_time: Optional[str] = None,
    threshold: Optional[float] = None,
    alert_mode: Optional[str] = None,
) -> SimulationResponse:
    req = SimulationRequest(
        person_id=patient_id,
        decision_time=decision_time,
        threshold=threshold,
        alert_mode=alert_mode,
        interventions=interventions if interventions is not None else SimulationRequest().interventions,
    )
    return simulate_counterfactuals(req)


def _build_fhir_bundle(patient_id: str, decision_time: Optional[str] = None, interventions: Optional[List[InterventionSpec]] = None) -> Dict[str, Any]:
    """Export a draft FHIR collection with Patient, model outputs and Provenance."""
    # Build feature state targeting the patient
    sim_res = simulate_patient_counterfactuals(patient_id, interventions=interventions, decision_time=decision_time)

    obs = to_fhir_observation(sim_res.baseline)
    risk = to_fhir_risk_assessment(sim_res.baseline)
    plan = to_fhir_care_plan(sim_res)

    patient = to_fhir_patient(get_patient(patient_id))
    resources = [obs, risk, plan, patient]
    resources.append(to_fhir_provenance(sim_res.baseline, resources))
    bundle = {
        "resourceType": "Bundle", "type": "collection",
        "timestamp": datetime.now().astimezone().isoformat(), "total": len(resources),
        "entry": [{"fullUrl": f"https://ehr.invalid/fhir/{r['resourceType']}/{r['id']}", "resource": r} for r in resources],
    }
    return bundle


@app.get("/api/v1/twin/fhir/bundle/{patient_id}")
def get_fhir_bundle(patient_id: str = "P001", decision_time: Optional[str] = None):
    return _build_fhir_bundle(patient_id, decision_time)


@app.post("/api/v1/twin/fhir/bundle/{patient_id}")
def post_fhir_bundle(patient_id: str, interventions: List[InterventionSpec], decision_time: Optional[str] = None):
    """Export exactly the selected scenario set and recorded decision timestamp."""
    return _build_fhir_bundle(patient_id, decision_time, interventions)


@app.get("/api/v1/twin/fhir/validate/{patient_id}")
def validate_patient_bundle(patient_id: str, decision_time: Optional[str] = None):
    return validate_bundle(get_fhir_bundle(patient_id, decision_time))


@lru_cache(maxsize=1)
def _cohort_risk_summaries(source_fingerprint: str, model_fingerprint: str):
    """Batch evaluate each patient's latest eligible recorded, below-threshold state."""
    ids, vectors, times, errors = [], [], [], []
    for patient in list_patients(split=None):
        pid = patient['person_id']
        selected = None
        for reading in reversed(patient_readings(DATA_DIR, pid)):
            if float(reading['glucose_mg_dl']) >= 180:
                continue
            try:
                features, timestamp, _ = build_features(DATA_DIR, pid, reading['reading_time'])
                selected = (features, timestamp)
                break
            except ValueError:
                continue
        if selected is None:
            errors.append({'person_id': pid, 'status': 'insufficient_history', 'risk_tier': None,
                           'calibrated_spike_probability': None, 'decision_time': None, 'model_applicable': False})
            continue
        ids.append(pid)
        vectors.append(engine.features_to_vector(selected[0])[0])
        times.append(selected[1])
    results = []
    if vectors:
        matrix = np.asarray(vectors, dtype=np.float32)
        raw = engine.classifier.predict_proba(matrix)[:, 1]
        probabilities = np.clip(engine.calibrator.predict(raw), 0, 1)
        curves = engine.trajectory_regressor.predict(matrix)
        for index, pid in enumerate(ids):
            probability = float(probabilities[index])
            tier = 'HIGH' if probability >= .45 else 'WATCH' if probability >= engine.optimal_threshold else 'CALM'
            results.append({'person_id': pid, 'decision_time': times[index], 'risk_tier': tier,
                            'calibrated_spike_probability': round(probability, 3),
                            'predicted_peak_glucose_mg_dl': round(float(np.max(curves[index])), 1),
                            'model_applicable': True, 'status': 'evaluated'})
    return {'evaluated_at': datetime.now().astimezone().isoformat(),
            'timestamp_policy': 'Each patient latest eligible recorded moment: glucose below 180 mg/dL and two hours of consecutive prior sensor history. These are not simultaneous live states.',
            'source_fingerprint': source_fingerprint, 'model_fingerprint': model_fingerprint,
            'summaries': results + errors}


@app.get('/api/v1/twin/cohort/risk-summaries')
def get_cohort_risk_summaries():
    source = hashlib.sha256()
    for path in [DATA_DIR / 'clinic' / 'patients.csv', DATA_DIR / 'wearables' / 'readings.csv']:
        source.update(path.read_bytes())
    model = engine.model_fingerprint
    return _cohort_risk_summaries(source.hexdigest(), model)

# Cross-cutting OIDC authorization and local access audit.
import sys as _sys
from pathlib import Path as _Path
_security_root=next((p for p in _Path(__file__).resolve().parents if (p/"ehr_security.py").exists()), _Path(__file__).resolve().parent)
_sys.path.insert(0,str(_security_root))
from ehr_security import install_security
install_security(app, "digital-twin")
