"""High-performance inference engine for the Digital Twin Dual-Head Models with TreeSHAP."""

from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import pickle
from pathlib import Path
from typing import Any, Dict, List, Optional
import numpy as np
import shap
from xgboost import XGBClassifier
import xgboost

try:
    from .portable import load_portable_models, SOURCE_FILES
    from .models import (
        ClinicalFeatures,
        PredictionResponse,
        SHAPDriver,
        TrajectoryPoint,
    )
except ImportError:
    from portable import load_portable_models, SOURCE_FILES
    from models import (
        ClinicalFeatures,
        PredictionResponse,
        SHAPDriver,
        TrajectoryPoint,
    )

if os.getenv("DATA_DIR"):
    MODEL_DIR = Path(os.environ["DATA_DIR"]) / "model"
else:
    _parents = Path(__file__).resolve().parents
    ROOT = _parents[2] if len(_parents) > 2 else _parents[0]
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
        version = tuple(int(part) for part in xgboost.__version__.split('.')[:2])
        if version < (3, 2):
            raise RuntimeError('This model was exported with XGBoost 3.2. Install xgboost>=3.2,<4; older runtimes can silently misread vector base scores.')
        print(f"Loading Digital Twin model weights from {MODEL_DIR}...")
        self.classifier = XGBClassifier()
        self.classifier.load_model(str(MODEL_DIR / "classifier.json"))
        self.classifier.set_params(n_jobs=1)

        try:
            self.calibrator, self.trajectory_regressor, manifest = load_portable_models(MODEL_DIR)
            self.serialization_format = "native_xgboost_json_and_numpy_isotonic"
            self.portable_verification = manifest.get("parity_verification", {})
        except (OSError, ValueError, KeyError, TypeError) as exc:
            logging.getLogger(__name__).warning(
                "Portable twin artifacts unavailable or invalid (%s). Loading trusted legacy pickle artifacts; "
                "re-export with scripts/export_portable_twin_models.py to avoid version-dependent deserialization.", exc)
            with (MODEL_DIR / "calibrator.pkl").open("rb") as f:
                self.calibrator = pickle.load(f)
            with (MODEL_DIR / "trajectory_regressor.pkl").open("rb") as f:
                self.trajectory_regressor = pickle.load(f)
            self.trajectory_regressor.n_jobs = 1
            for estimator in self.trajectory_regressor.estimators_:
                estimator.set_params(n_jobs=1)
            self.serialization_format = "legacy_trusted_pickle_fallback"
            self.portable_verification = {}

        self.artifact_fingerprints = {name: hashlib.sha256((MODEL_DIR / name).read_bytes()).hexdigest() for name in SOURCE_FILES}
        self.model_fingerprint = hashlib.sha256(json.dumps(self.artifact_fingerprints, sort_keys=True).encode()).hexdigest()

        self.feature_names: List[str] = json.loads(
            (MODEL_DIR / "feature_names.json").read_text(encoding="utf-8")
        )

        metrics = json.loads((MODEL_DIR / "metrics.json").read_text(encoding="utf-8"))
        self.metrics = metrics
        self.model_hash = hashlib.sha256((MODEL_DIR / "classifier.json").read_bytes()).hexdigest()
        self.optimal_threshold = float(metrics.get("optimal_decision_threshold", 0.220))

        # Initialize TreeSHAP explainer
        self.explainer = shap.TreeExplainer(self.classifier)
        print("Digital Twin ML models and TreeSHAP loaded successfully.")

    def features_to_vector(self, features: ClinicalFeatures) -> np.ndarray:
        """Convert ClinicalFeatures schema to the exact ordered 24-element float vector."""
        f_dict = features.model_dump()
        vec = [float(f_dict[col]) for col in self.feature_names]
        if not np.isfinite(vec).all():
            raise ValueError("Model features must all be finite; no silent imputation applied.")
        return np.array([vec], dtype=np.float32)

    def predict(
        self,
        features: ClinicalFeatures,
        decision_time: str = "2026-10-10T12:45:00",
        person_id: Optional[str] = "P001",
        threshold: Optional[float] = None,
        alert_operating_mode: Optional[str] = None,
    ) -> PredictionResponse:
        """Execute instantaneous dual-head prediction and compute TreeSHAP drivers."""
        x_vec = self.features_to_vector(features)

        # 1. Head 1: Calibrated Probability of Incident Spike
        raw_prob = float(self.classifier.predict_proba(x_vec)[0, 1])
        calibrated_prob = float(np.clip(self.calibrator.predict(np.array([raw_prob])), 0.0, 1.0)[0])

        mode_thresholds = {
            "high_sensitivity": 0.170,
            "standard": self.optimal_threshold,
            "high_specificity": 0.300,
        }
        if threshold is not None:
            active_threshold = float(threshold)
            mode_name = "custom"
        elif alert_operating_mode in mode_thresholds:
            active_threshold = mode_thresholds[alert_operating_mode]
            mode_name = alert_operating_mode
        else:
            active_threshold = self.optimal_threshold
            mode_name = "standard"

        # Risk tiering
        if calibrated_prob >= 0.45:
            tier = "HIGH"
        elif calibrated_prob >= active_threshold:
            tier = "WATCH"
        else:
            tier = "CALM"

        spike_pred = bool(calibrated_prob >= active_threshold)

        # 2. Head 2: Multi-Horizon Continuous Glycemic Trajectory (8 Steps)
        future_curve = self.trajectory_regressor.predict(x_vec)[0]
        horizons = [15, 30, 45, 60, 75, 90, 105, 120]

        # Dynamic Clarke Error Grid and hypoglycemia safety check
        all_projected = [float(val) for val in future_curve] + [float(features.glucose_now)]
        min_proj = min(all_projected)
        hypo_warning = bool(min_proj < 70.0)
        if min_proj < 54.0:
            clarke_zone = "Zone C/D/E (Severe Hypoglycemia Warning)"
        elif min_proj < 70.0:
            clarke_zone = "Zone B (Borderline Hypoglycemia Dip)"
        else:
            clarke_zone = "Zone A (Clinically Safe Euglycemia)"

        trajectory_points: List[TrajectoryPoint] = []
        peak_val = -1.0
        peak_time = 60

        for idx, h in enumerate(horizons):
            val = round(float(future_curve[idx]), 1)
            if val > peak_val:
                peak_val = val
                peak_time = h

            # Illustrative sensitivity envelope only: no residual quantile calibration exists.
            sigma = 4.5 + (idx * 2.1)
            p10 = round(max(0.0, val - 1.645 * sigma), 1)
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
            optimal_decision_threshold=round(active_threshold, 3),
            spike_predicted=spike_pred,
            predicted_peak_glucose_mg_dl=round(peak_val, 1),
            predicted_peak_time_minutes=peak_time,
            continuous_trajectory=trajectory_points,
            top_shap_drivers=shap_drivers,
            hypoglycemia_risk_warning=hypo_warning,
            clarke_safety_zone=clarke_zone,
            alert_operating_mode=mode_name,
            event_status="ongoing_hyperglycemia" if features.glucose_now >= 180 else "incident_forecast",
            model_applicable=features.glucose_now < 180,
            features=features.model_dump(),
            explanation={
                "method": "TreeSHAP", "scale": "uncalibrated_classifier_log_odds",
                "base_value": float(np.asarray(self.explainer.expected_value).reshape(-1)[-1]),
                "contribution_sum": float(np.sum(sv)),
                "raw_margin": float(self.classifier.predict(x_vec, output_margin=True)[0]),
                "raw_probability": raw_prob,
                "additivity_residual": float(self.classifier.predict(x_vec, output_margin=True)[0]) - float(np.asarray(self.explainer.expected_value).reshape(-1)[-1]) - float(np.sum(sv)),
                "all_contributions": {name: float(value) for name, value in zip(self.feature_names, sv)},
                "note": "Contributions explain the raw classifier log odds, not the isotonic-calibrated probability or causal effects.",
            },
            model_provenance={"classifier_sha256": self.model_hash,
                              "serialization_format": self.serialization_format,
                              "model_fingerprint": self.model_fingerprint,
                              "portable_parity_verification": self.portable_verification,
                              "architecture": self.metrics.get("model_architecture"),
                              "training_provenance": self.metrics.get("training_provenance"),
                              "target": self.metrics.get("question"),
                              "validation": "Patient-separated retrospective test cohort; no prospective validation."},
            warnings=["Current glucose is already >=180 mg/dL. Incident classifier and trajectory were trained below 180 mg/dL; outputs are outside their validated baseline domain."] if features.glucose_now >= 180 else [],
        )
