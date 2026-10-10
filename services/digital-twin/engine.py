"""High-performance inference engine for the Digital Twin Dual-Head Models with TreeSHAP."""

from __future__ import annotations

import json
import math
import pickle
from pathlib import Path
from typing import Any, Dict, List, Optional
import numpy as np
import shap
from xgboost import XGBClassifier

try:
    from .models import (
        ClinicalFeatures,
        PredictionResponse,
        SHAPDriver,
        TrajectoryPoint,
    )
except ImportError:
    from models import (
        ClinicalFeatures,
        PredictionResponse,
        SHAPDriver,
        TrajectoryPoint,
    )

ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = ROOT / "data" / "digital_twin" / "model"

CLINICAL_FEATURE_DESCRIPTIONS = {
    "glucose_now": "Baseline glucose level at current reading",
    "glucose_velocity_per_hour": "Rate of blood glucose climb/drop",
    "glucose_mean_30min": "Short-term average over last 30 minutes",
    "glucose_mean_2h": "2-hour glycemic trend average",
    "glucose_std_2h": "2-hour glycemic volatility/variability",
    "minutes_since_meal": "Digestive phase elapsed since last meal",
    "last_meal_carbs_g": "Carbohydrate load of the most recent meal",
    "carbs_intake_last_2h": "Cumulative carbohydrates consumed in past 2 hours",
    "hba1c_percent": "3-month average glucose control indicator",
    "years_with_diabetes": "Disease chronicity and beta-cell secretory reserve",
    "on_metformin": "Active metformin hepatic gluconeogenesis suppression",
    "on_insulin": "Active exogenous insulin pharmacotherapy",
    "hour_of_day": "Circadian biological clock and meal window timing",
    "cos_hour": "Diurnal circadian harmonic (Dawn phenomenon phase)",
    "sin_hour": "Diurnal circadian cycle phase",
    "bmi": "Degree of peripheral metabolic insulin resistance",
    "fasting_c_peptide": "Endogenous pancreatic beta-cell insulin reserve",
    "egfr": "Renal clearance and gluconeogenesis capability",
}


class DigitalTwinEngine:
    """Manages model loading, live dual-head inference, calibration, and SHAP explainability."""

    def __init__(self):
        self._load_models()

    def _load_models(self):
        print(f"Loading Digital Twin model weights from {MODEL_DIR}...")
        self.classifier = XGBClassifier()
        self.classifier.load_model(str(MODEL_DIR / "classifier.json"))

        with (MODEL_DIR / "calibrator.pkl").open("rb") as f:
            self.calibrator = pickle.load(f)

        with (MODEL_DIR / "trajectory_regressor.pkl").open("rb") as f:
            self.trajectory_regressor = pickle.load(f)

        self.feature_names: List[str] = json.loads(
            (MODEL_DIR / "feature_names.json").read_text(encoding="utf-8")
        )

        metrics = json.loads((MODEL_DIR / "metrics.json").read_text(encoding="utf-8"))
        self.optimal_threshold = float(metrics.get("optimal_decision_threshold", 0.220))

        # Initialize TreeSHAP explainer
        self.explainer = shap.TreeExplainer(self.classifier)
        print("Digital Twin ML models and TreeSHAP loaded successfully.")

    def features_to_vector(self, features: ClinicalFeatures) -> np.ndarray:
        """Convert ClinicalFeatures schema to the exact ordered 24-element float vector."""
        f_dict = features.model_dump()
        vec = [float(f_dict.get(col, 0.0)) for col in self.feature_names]
        return np.array([vec], dtype=np.float32)

    def predict(
        self,
        features: ClinicalFeatures,
        decision_time: str = "2026-10-10T12:45:00",
        person_id: Optional[str] = "P001",
    ) -> PredictionResponse:
        """Execute instantaneous dual-head prediction and compute TreeSHAP drivers."""
        x_vec = self.features_to_vector(features)

        # 1. Head 1: Calibrated Probability of Incident Spike
        raw_prob = float(self.classifier.predict_proba(x_vec)[0, 1])
        calibrated_prob = float(np.clip(self.calibrator.predict(np.array([raw_prob])), 0.0, 1.0)[0])

        # Risk tiering
        if calibrated_prob >= 0.45:
            tier = "HIGH"
        elif calibrated_prob >= self.optimal_threshold:
            tier = "WATCH"
        else:
            tier = "CALM"

        spike_pred = bool(calibrated_prob >= self.optimal_threshold)

        # 2. Head 2: Multi-Horizon Continuous Glycemic Trajectory (8 Steps)
        future_curve = self.trajectory_regressor.predict(x_vec)[0]
        horizons = [15, 30, 45, 60, 75, 90, 105, 120]

        trajectory_points: List[TrajectoryPoint] = []
        peak_val = -1.0
        peak_time = 60

        for idx, h in enumerate(horizons):
            val = round(float(future_curve[idx]), 1)
            if val > peak_val:
                peak_val = val
                peak_time = h

            # Empirical 90% confidence bounds (+/- 1.645 sigma)
            sigma = 4.5 + (idx * 2.1)
            p10 = round(max(40.0, val - 1.645 * sigma), 1)
            p90 = round(val + 1.645 * sigma, 1)

            trajectory_points.append(
                TrajectoryPoint(
                    horizon_minutes=h,
                    projected_glucose_mg_dl=val,
                    lower_bound_p10_mg_dl=p10,
                    upper_bound_p90_mg_dl=p90,
                )
            )

        # 3. Head 3: TreeSHAP Feature Attributions
        shap_vals = self.explainer.shap_values(x_vec)
        if isinstance(shap_vals, list):
            sv = shap_vals[1][0]
        else:
            sv = shap_vals[0]

        # Top 5 influential features by absolute impact
        abs_order = np.argsort(np.abs(sv))[::-1]
        shap_drivers: List[SHAPDriver] = []

        for idx in abs_order[:5]:
            feat = self.feature_names[idx]
            val = float(sv[idx])
            direction = "increases_risk" if val > 0 else "decreases_risk"
            desc = CLINICAL_FEATURE_DESCRIPTIONS.get(feat, "Clinical factor")

            # Contextualize explanation
            f_val = getattr(features, feat, None)
            if feat == "glucose_velocity_per_hour":
                exp = f"{desc}: {f_val:+.1f} mg/dL/hr (steep slope drives acute excursion risk)"
            elif feat == "last_meal_carbs_g":
                exp = f"{desc}: {f_val:.0f}g carbohydrate meal (postprandial glucose appearance)"
            elif feat == "minutes_since_meal":
                exp = f"{desc}: {f_val:.0f} mins (active gastrointestinal absorption window)"
            elif feat == "hba1c_percent":
                exp = f"{desc}: {f_val:.1f}% baseline (impaired first-phase insulin sensitivity)"
            elif feat == "glucose_now":
                exp = f"{desc}: {f_val:.0f} mg/dL currently"
            else:
                exp = f"{desc} ({val:+.2f} SHAP impact on risk)"

            shap_drivers.append(
                SHAPDriver(
                    feature=feat,
                    shap_value=round(val, 4),
                    direction=direction,
                    clinical_explanation=exp,
                )
            )

        return PredictionResponse(
            person_id=person_id,
            decision_time=decision_time,
            glucose_now_mg_dl=round(float(features.glucose_now), 1),
            calibrated_spike_probability=round(calibrated_prob, 3),
            risk_tier=tier,
            optimal_decision_threshold=round(self.optimal_threshold, 3),
            spike_predicted=spike_pred,
            predicted_peak_glucose_mg_dl=round(peak_val, 1),
            predicted_peak_time_minutes=peak_time,
            continuous_trajectory=trajectory_points,
            top_shap_drivers=shap_drivers,
        )
