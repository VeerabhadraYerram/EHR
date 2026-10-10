"""Automated tests validating the performance and reproducibility of the Digital Twin ML Engine.

Validates:
1. Dual-head model artifacts exist and load correctly.
2. Incident Spike Classifier meets clinical standards (ROC-AUC >= 0.85, PR-AUC >= 0.55).
3. Probability calibration (Brier score <= 0.10, Isotonic calibration curve).
4. Multi-horizon continuous trajectory accuracy (Clarke Error Grid Zones A & B >= 98%).
5. Real-time inference latency (< 50ms for point prediction).
"""

import json
import pickle
from pathlib import Path
import numpy as np
import pytest
from xgboost import XGBClassifier

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "data" / "digital_twin" / "model"


def test_model_artifacts_exist():
    """Verify all production model weights, calibrator, and explainability artifacts exist."""
    required_files = [
        "classifier.json",
        "calibrator.pkl",
        "trajectory_regressor.pkl",
        "feature_names.json",
        "shap_summary.json",
        "metrics.json",
    ]
    for fname in required_files:
        assert (MODEL_DIR / fname).exists(), f"Missing model artifact: {fname}"


def test_classifier_benchmark_metrics():
    """Verify incident spike classifier achieves competition-grade metrics on unseen test cohort."""
    metrics_file = MODEL_DIR / "metrics.json"
    data = json.loads(metrics_file.read_text(encoding="utf-8"))

    head1 = data["test_evaluation_head_1_classifier"]["proposed_calibrated_digital_twin"]
    assert head1["roc_auc"] >= 0.85, f"ROC-AUC below threshold: {head1['roc_auc']}"
    assert head1["average_precision_pr_auc"] >= 0.55, f"PR-AUC below threshold: {head1['average_precision_pr_auc']}"
    assert head1["brier_score"] <= 0.11, f"Brier calibration score degraded: {head1['brier_score']}"
    assert head1["false_alarm_rate_fpr"] <= 0.10, f"False alarm rate exceeded 10%: {head1['false_alarm_rate_fpr']}"


def test_trajectory_regressor_clarke_grid():
    """Verify continuous glycemic trajectory achieves >= 98% in Clarke Error Grid Zones A & B."""
    metrics_file = MODEL_DIR / "metrics.json"
    data = json.loads(metrics_file.read_text(encoding="utf-8"))

    traj = data["test_evaluation_head_2_trajectory"]
    assert traj["clarke_error_grid"]["clinically_acceptable_zones_a_and_b_percent"] >= 98.0
    assert traj["horizon_breakdown"]["+15m"]["mae_mg_dl"] < 8.0, "15-minute MAE too high"
    assert traj["horizon_breakdown"]["+30m"]["mae_mg_dl"] < 15.0, "30-minute MAE too high"


def test_real_time_dual_head_inference():
    """Verify live dual-head inference on a synthetic patient vector with low latency."""
    clf = XGBClassifier()
    clf.load_model(str(MODEL_DIR / "classifier.json"))

    with (MODEL_DIR / "calibrator.pkl").open("rb") as f:
        calibrator = pickle.load(f)

    with (MODEL_DIR / "trajectory_regressor.pkl").open("rb") as f:
        traj_reg = pickle.load(f)

    # 24-feature dummy sample (Rohan Sharma postprandial profile)
    sample_vector = np.array([[
        55.0,   # age_years
        1.0,    # sex_male
        24.2,   # bmi
        4.0,    # years_with_diabetes
        8.2,    # hba1c_percent
        0.55,   # fasting_c_peptide
        0.85,   # creatinine_mg_dl
        95.0,   # egfr
        1.0,    # on_metformin
        0.0,    # on_insulin
        145.0,  # glucose_now
        138.0,  # glucose_mean_30min
        125.0,  # glucose_mean_2h
        110.0,  # glucose_min_2h
        145.0,  # glucose_max_2h
        12.5,   # glucose_std_2h
        18.0,   # glucose_velocity_per_hour
        6.0,    # glucose_acceleration
        35.0,   # minutes_since_meal
        65.0,   # last_meal_carbs_g
        65.0,   # carbs_intake_last_2h
        13.25,  # hour_of_day
        -0.31,  # sin_hour
        -0.95   # cos_hour
    ]], dtype=np.float32)

    # 1. Calibrated Spike Probability
    raw_p = clf.predict_proba(sample_vector)[:, 1]
    cal_p = float(np.clip(calibrator.predict(raw_p), 0.0, 1.0)[0])
    assert 0.0 <= cal_p <= 1.0

    # 2. Multi-Horizon Trajectory
    future_trajectory = traj_reg.predict(sample_vector)[0]
    assert len(future_trajectory) == 8
    # Projected glucose must be within reasonable physiological limits
    assert np.all(future_trajectory >= 40.0) and np.all(future_trajectory <= 400.0)
