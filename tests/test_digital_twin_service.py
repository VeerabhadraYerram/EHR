"""Automated integration tests for the Metabolic Digital Twin FastAPI Microservice,
In-Silico Counterfactual Simulation Engine, and HL7 FHIR R4 Serialization.
"""

from __future__ import annotations

import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "digital-twin"))

from main import app  # noqa: E402

client = TestClient(app)


def test_health_endpoint():
    """Verify service health, loaded models, and decision threshold."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "digital-twin"
    assert "XGBClassifier" in data["models_loaded"]["classifier"]
    assert "MultiOutputRegressor" in data["models_loaded"]["trajectory_regressor"]
    assert "TreeSHAP" in data["models_loaded"]["explainability"]
    assert data["optimal_decision_threshold"] == pytest.approx(0.22, abs=0.01)
    assert data["cohort_patients_loaded"] == 100


def test_list_patients_and_filtering():
    """Verify patient registry endpoint and split filtering."""
    # All patients
    res_all = client.get("/api/v1/twin/patients")
    assert res_all.status_code == 200
    patients = res_all.json()
    assert len(patients) == 100

    # Filter by split
    res_learn = client.get("/api/v1/twin/patients?split=learn")
    assert res_learn.status_code == 200
    assert len(res_learn.json()) == 70

    res_tune = client.get("/api/v1/twin/patients?split=tune")
    assert res_tune.status_code == 200
    assert len(res_tune.json()) == 15

    res_test = client.get("/api/v1/twin/patients?split=test")
    assert res_test.status_code == 200
    assert len(res_test.json()) == 15


def test_get_patient_details():
    """Verify patient profile lookup with attached labs and medications."""
    res = client.get("/api/v1/twin/patients/P001")
    assert res.status_code == 200
    p = res.json()
    assert p["person_id"] == "P001"
    assert "labs" in p and len(p["labs"]) > 0
    assert "medications" in p and len(p["medications"]) > 0

    # Verify 404 for non-existent patient
    res_404 = client.get("/api/v1/twin/patients/P9999")
    assert res_404.status_code == 404


def test_patient_telemetry_readings():
    """Verify continuous glucose sensor readings telemetry."""
    res = client.get("/api/v1/twin/patients/P001/readings?limit=48")
    assert res.status_code == 200
    readings = res.json()
    assert len(readings) == 48
    assert "glucose_mg_dl" in readings[0]
    assert float(readings[0]["glucose_mg_dl"]) > 0


def test_live_dual_head_prediction():
    """Verify live dual-head inference: risk probability + 8-step trajectory + TreeSHAP."""
    payload = {
        "age_years": 55.0,
        "sex_male": 1.0,
        "bmi": 24.2,
        "years_with_diabetes": 4.0,
        "hba1c_percent": 8.2,
        "fasting_c_peptide": 0.55,
        "creatinine_mg_dl": 0.85,
        "egfr": 95.0,
        "on_metformin": 1.0,
        "on_insulin": 0.0,
        "glucose_now": 142.0,
        "glucose_mean_30min": 136.0,
        "glucose_mean_2h": 124.0,
        "glucose_min_2h": 110.0,
        "glucose_max_2h": 142.0,
        "glucose_std_2h": 12.4,
        "glucose_velocity_per_hour": 24.0,
        "glucose_acceleration": 4.0,
        "minutes_since_meal": 25.0,
        "last_meal_carbs_g": 70.0,
        "carbs_intake_last_2h": 70.0,
        "hour_of_day": 13.0,
        "sin_hour": -0.25,
        "cos_hour": -0.96,
    }

    res = client.post("/api/v1/twin/predict?person_id=P001", json=payload)
    assert res.status_code == 200
    pred = res.json()

    # Head 1: Calibrated Probability
    p = pred["calibrated_spike_probability"]
    assert 0.0 <= p <= 1.0
    assert pred["risk_tier"] in ["CALM", "WATCH", "HIGH"]
    assert pred["optimal_decision_threshold"] == pytest.approx(0.22, abs=0.01)

    # Head 2: Continuous 8-Step Forward Trajectory
    traj = pred["continuous_trajectory"]
    assert len(traj) == 8
    horizons = [pt["horizon_minutes"] for pt in traj]
    assert horizons == [15, 30, 45, 60, 75, 90, 105, 120]
    for pt in traj:
        assert pt["lower_bound_p10_mg_dl"] <= pt["projected_glucose_mg_dl"] <= pt["upper_bound_p90_mg_dl"]

    # Head 3: TreeSHAP Explainability
    shap_drivers = pred["top_shap_drivers"]
    assert len(shap_drivers) == 5
    for driver in shap_drivers:
        assert "feature" in driver
        assert "shap_value" in driver
        assert driver["direction"] in ["increases_risk", "decreases_risk"]
        assert len(driver["clinical_explanation"]) > 10


def test_in_silico_simulation_fidelity():
    """Verify biophysical simulation kinetics, AUC integration, TIR, and safety bounds."""
    sim_payload = {
        "person_id": "P001",
        "interventions": [
            {
                "intervention_type": "postprandial_walk",
                "parameters": {"duration_minutes": 20, "intensity": "brisk"},
            },
            {
                "intervention_type": "carb_reduction",
                "parameters": {"carb_reduction_g": 35},
            },
            {
                "intervention_type": "food_sequencing",
                "parameters": {"preload_type": "fiber_protein", "delay_carbs_minutes": 15},
            },
            {
                "intervention_type": "compound_lifestyle",
                "parameters": {"duration_minutes": 20, "carb_reduction_g": 25},
            },
            {
                "intervention_type": "confirm_medication",
                "parameters": {"drug": "metformin", "dose_mg": 500},
            },
        ],
    }

    res = client.post("/api/v1/twin/simulate", json=sim_payload)
    assert res.status_code == 200
    sim = res.json()

    assert sim["person_id"] == "P001"
    assert "baseline" in sim
    branches = sim["counterfactual_branches"]
    assert len(branches) == 5

    # Check walk branch (GLUT4 kinetics)
    walk_branch = next(b for b in branches if b["intervention_type"] == "postprandial_walk")
    assert walk_branch["peak_reduction_mg_dl"] >= 0.0
    assert walk_branch["simulated_peak_mg_dl"] < walk_branch["baseline_peak_mg_dl"]
    assert walk_branch["auc_reduction_percent"] > 0.0
    assert not walk_branch["hypoglycemia_risk_warning"]
    assert "GLUT4" in walk_branch["biophysical_mechanism"]

    # Check carb reduction branch (Hovorka absorption kinetics)
    carb_branch = next(b for b in branches if b["intervention_type"] == "carb_reduction")
    assert carb_branch["peak_reduction_mg_dl"] >= 0.0
    assert "Hovorka" in carb_branch["biophysical_mechanism"]

    # Check food sequencing branch (Gastric emptying delay)
    seq_branch = next(b for b in branches if b["intervention_type"] == "food_sequencing")
    assert seq_branch["peak_reduction_mg_dl"] >= 0.0
    assert "Gastric Emptying Delay" in seq_branch["biophysical_mechanism"]

    # Check compound lifestyle branch (Synergy)
    compound_branch = next(b for b in branches if b["intervention_type"] == "compound_lifestyle")
    assert compound_branch["peak_reduction_mg_dl"] >= 0.0
    assert compound_branch["risk_reduction_percentage_points"] >= 0.0
    assert "Synergy" in compound_branch["biophysical_mechanism"]

    # Check recommendation string
    assert sim["optimal_recommended_action"]
    for branch in branches:
        assert branch["simulated_risk_probability"] <= branch["baseline_risk_probability"]
        assert branch["clarke_safety_zone"] is None
        assert branch["clinically_validated"] is False
        assert "Assumption-based" in branch["simulation_method"]


def test_patient_targeted_simulation():
    """Verify in-silico simulation targeting a cohort patient automatically."""
    res = client.post("/api/v1/twin/simulate/P001")
    assert res.status_code == 200
    sim = res.json()
    assert sim["person_id"] == "P001"
    assert len(sim["counterfactual_branches"]) >= 3
    assert sim["baseline"]["glucose_now_mg_dl"] > 0


def test_hl7_fhir_r4_bundle_serialization():
    """Verify draft FHIR resource shapes; official IG validation is separate."""
    res = client.get("/api/v1/twin/fhir/bundle/P001")
    assert res.status_code == 200
    bundle = res.json()

    assert bundle["resourceType"] == "Bundle"
    assert bundle["type"] == "collection"
    assert bundle["total"] == 5
    assert len(bundle["entry"]) == 5

    # Resource 1: Observation without an unverified terminology code.
    obs = bundle["entry"][0]["resource"]
    assert obs["resourceType"] == "Observation"
    assert "Interstitial glucose" in obs["code"]["text"]
    assert obs["valueQuantity"]["unit"] == "mg/dL"
    assert obs["referenceRange"][0]["low"]["value"] == 70.0
    assert obs["referenceRange"][0]["high"]["value"] == 180.0

    # Resource 2: RiskAssessment with text outcome and structurally valid fields.
    risk = bundle["entry"][1]["resource"]
    assert risk["resourceType"] == "RiskAssessment"
    assert "condition" not in risk
    assert "180 mg/dL" in risk["prediction"][0]["outcome"]["text"]
    assert "TreeSHAP" in risk["prediction"][0]["rationale"]

    # Resource 3: CarePlan (Actionable in-silico counterfactuals)
    plan = bundle["entry"][2]["resource"]
    assert plan["resourceType"] == "CarePlan"
    assert plan["status"] == "draft"
    assert plan["intent"] == "proposal"
    assert len(plan["activity"]) > 0
    assert "In-Silico Simulation" in plan["activity"][0]["detail"]["description"]


def test_metrics_endpoint():
    """Verify endpoint exposing comprehensive model benchmarking metrics."""
    res = client.get("/api/v1/twin/metrics")
    assert res.status_code == 200
    metrics = res.json()
    assert "test_evaluation_head_1_classifier" in metrics
    clf = metrics["test_evaluation_head_1_classifier"]["proposed_calibrated_digital_twin"]
    assert clf["roc_auc"] >= 0.88
    assert clf["brier_score"] <= 0.10
    assert clf["false_alarm_rate_fpr"] <= 0.08

    reg = metrics["test_evaluation_head_2_trajectory"]
    assert reg["mean_trajectory_mae_mg_dl"] <= 16.5
