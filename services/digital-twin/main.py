"""FastAPI Microservice for the Type 2 Diabetes Metabolic Digital Twin Platform.

Exposes RESTful endpoints for:
1. Live Dual-Head Model Inference (Calibrated Risk + Continuous Trajectory + TreeSHAP).
2. Dynamic In-Silico 'What-If' Counterfactual Simulation.
3. HL7 FHIR R4 Resource Serialization (Observation, RiskAssessment, CarePlan).
4. Patient Registry and Clinical Telemetry Queries.
"""

from __future__ import annotations

import csv
import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

try:
    from .engine import DigitalTwinEngine
    from .fhir_mappers import to_fhir_care_plan, to_fhir_observation, to_fhir_risk_assessment
    from .models import (
        ClinicalFeatures,
        InterventionSpec,
        PredictionResponse,
        SimulationRequest,
        SimulationResponse,
    )
    from .simulator import MetabolicDigitalTwinSimulator
except ImportError:
    from engine import DigitalTwinEngine
    from fhir_mappers import to_fhir_care_plan, to_fhir_observation, to_fhir_risk_assessment
    from models import (
        ClinicalFeatures,
        InterventionSpec,
        PredictionResponse,
        SimulationRequest,
        SimulationResponse,
    )
    from simulator import MetabolicDigitalTwinSimulator

ROOT = Path(__file__).resolve().parents[2]
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

    return patients


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
    patient_id: str, limit: int = Query(96, description="Number of 15-min intervals (96 = 24h)")
) -> List[Dict[str, Any]]:
    """Get time-series continuous sensor telemetry for a patient."""
    readings_file = DATA_DIR / "wearables" / "readings.csv"
    if not readings_file.exists():
        raise HTTPException(status_code=404, detail="Readings database missing.")

    readings = []
    with readings_file.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["person_id"] == patient_id:
                readings.append(row)

    return readings[-limit:] if limit else readings


@app.post("/api/v1/twin/predict", response_model=PredictionResponse)
def predict_glucose_spike(
    features: ClinicalFeatures,
    person_id: Optional[str] = Query("P001"),
    decision_time: Optional[str] = Query(None),
) -> PredictionResponse:
    """Execute live dual-head inference for an arbitrary clinical feature state."""
    dt = decision_time or datetime.now().isoformat()
    return engine.predict(features, decision_time=dt, person_id=person_id)


@app.post("/api/v1/twin/simulate", response_model=SimulationResponse)
def simulate_counterfactuals(request: SimulationRequest) -> SimulationResponse:
    """Execute live In-Silico 'What-If' Simulation across candidate clinical/lifestyle interventions."""
    pid = request.person_id or "P001"
    dt = datetime.now().isoformat()

    # If features not supplied, build from patient's default clinical baseline (e.g. Rohan Sharma postprandial state)
    features = request.features
    if features is None:
        features = ClinicalFeatures(
            age_years=55.0,
            sex_male=1.0,
            bmi=24.2,
            years_with_diabetes=4.0,
            hba1c_percent=8.2,
            fasting_c_peptide=0.55,
            creatinine_mg_dl=0.85,
            egfr=95.0,
            on_metformin=1.0,
            on_insulin=0.0,
            glucose_now=138.0,
            glucose_mean_30min=132.0,
            glucose_mean_2h=122.0,
            glucose_min_2h=108.0,
            glucose_max_2h=138.0,
            glucose_std_2h=11.2,
            glucose_velocity_per_hour=22.0,
            glucose_acceleration=5.5,
            minutes_since_meal=30.0,
            last_meal_carbs_g=65.0,
            carbs_intake_last_2h=65.0,
            hour_of_day=12.75,
            sin_hour=-0.195,
            cos_hour=-0.981,
        )

    baseline, branches, recommendation = simulator.simulate_interventions(
        features=features,
        interventions=request.interventions,
        decision_time=dt,
        person_id=pid,
    )

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


@app.post("/api/v1/twin/simulate/{patient_id}", response_model=SimulationResponse)
def simulate_patient_counterfactuals(
    patient_id: str,
    interventions: Optional[List[InterventionSpec]] = None,
) -> SimulationResponse:
    """Execute live in-silico simulation targeting a specific patient's profile from the cohort."""
    # Fetch patient profile
    patient_data = get_patient(patient_id)
    
    # Parse demographics and baseline labs
    age = float(patient_data.get("age", 55.0))
    gender = str(patient_data.get("gender", "male")).lower()
    sex_male = 1.0 if gender in ["male", "m"] else 0.0
    bmi = float(patient_data.get("bmi", 25.0))
    years_dm = float(patient_data.get("years_with_diabetes", 5.0))
    
    # Parse labs
    hba1c = 8.0
    c_pep = 0.55
    creat = 0.85
    egfr_val = 90.0
    for lab in patient_data.get("labs", []):
        name = lab.get("lab_name", "").lower()
        try:
            val = float(lab.get("value", 0.0))
            if "hba1c" in name:
                hba1c = val
            elif "c-peptide" in name or "c_peptide" in name:
                c_pep = val
            elif "creatinine" in name:
                creat = val
            elif "egfr" in name:
                egfr_val = val
        except (ValueError, TypeError):
            continue

    # Medications
    meds = [m.get("drug_name", "").lower() for m in patient_data.get("medications", [])]
    on_met = 1.0 if any("metformin" in m for m in meds) else 0.0
    on_ins = 1.0 if any("insulin" in m for m in meds) else 0.0

    # Get latest readings
    readings = get_patient_readings(patient_id, limit=8)
    if readings and len(readings) >= 1:
        latest = readings[-1]
        g_now = float(latest.get("glucose_mg_dl", 135.0))
        past_vals = [float(r.get("glucose_mg_dl", g_now)) for r in readings]
        g_mean_30 = float(np.mean(past_vals[-2:])) if len(past_vals) >= 2 else g_now
        g_mean_2h = float(np.mean(past_vals))
        g_min_2h = float(np.min(past_vals))
        g_max_2h = float(np.max(past_vals))
        g_std_2h = float(np.std(past_vals)) if len(past_vals) > 1 else 10.0
        # velocity = (latest - oldest) / (hours elapsed)
        g_vel = (g_now - past_vals[0]) / max(0.25, len(past_vals) * 0.25)
    else:
        g_now = 138.0
        g_mean_30 = 132.0
        g_mean_2h = 122.0
        g_min_2h = 108.0
        g_max_2h = 138.0
        g_std_2h = 11.2
        g_vel = 22.0

    feat = ClinicalFeatures(
        age_years=age,
        sex_male=sex_male,
        bmi=bmi,
        years_with_diabetes=years_dm,
        hba1c_percent=hba1c,
        fasting_c_peptide=c_pep,
        creatinine_mg_dl=creat,
        egfr=egfr_val,
        on_metformin=on_met,
        on_insulin=on_ins,
        glucose_now=g_now,
        glucose_mean_30min=g_mean_30,
        glucose_mean_2h=g_mean_2h,
        glucose_min_2h=g_min_2h,
        glucose_max_2h=g_max_2h,
        glucose_std_2h=g_std_2h,
        glucose_velocity_per_hour=g_vel,
        glucose_acceleration=2.0,
        minutes_since_meal=30.0,
        last_meal_carbs_g=60.0,
        carbs_intake_last_2h=60.0,
        hour_of_day=12.5,
        sin_hour=-0.13,
        cos_hour=-0.99,
    )

    req = SimulationRequest(
        person_id=patient_id,
        features=feat,
        interventions=interventions or SimulationRequest().interventions,
    )
    return simulate_counterfactuals(req)


@app.get("/api/v1/twin/fhir/bundle/{patient_id}")
def get_fhir_bundle(patient_id: str = "P001") -> Dict[str, Any]:
    """Generate HL7 FHIR R4 Transaction Bundle with Observation, RiskAssessment, and CarePlan."""
    # Build feature state targeting the patient
    sim_res = simulate_patient_counterfactuals(patient_id)

    obs = to_fhir_observation(sim_res.baseline)
    risk = to_fhir_risk_assessment(sim_res.baseline)
    plan = to_fhir_care_plan(sim_res)

    return {
        "resourceType": "Bundle",
        "type": "collection",
        "timestamp": datetime.now().isoformat(),
        "total": 3,
        "entry": [
            {"resource": obs},
            {"resource": risk},
            {"resource": plan},
        ],
    }
