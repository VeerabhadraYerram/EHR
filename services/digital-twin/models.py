"""Pydantic schemas and data contracts for the Digital Twin Simulation & Prediction Service."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, model_validator


class ClinicalFeatures(BaseModel):
    model_config = {"allow_inf_nan": False}

    """The 24 standardized clinical input variables driving the Digital Twin."""

    age_years: float = Field(..., description="Age in years")
    sex_male: float = Field(..., description="1.0 for male, 0.0 for female")
    bmi: float = Field(..., description="Body Mass Index (kg/m^2)")
    years_with_diabetes: float = Field(..., description="Duration of diabetes in years")
    hba1c_percent: float = Field(..., description="Glycated Hemoglobin DCCT percentage (%)")
    fasting_c_peptide: float = Field(0.55, description="Fasting C-Peptide (nmol/L)")
    creatinine_mg_dl: float = Field(0.85, description="Serum Creatinine (mg/dL)")
    egfr: float = Field(90.0, description="Estimated GFR (mL/min/1.73m^2)")
    on_metformin: float = Field(1.0, description="Active Metformin therapy (1.0 or 0.0)")
    on_insulin: float = Field(0.0, description="Active Exogenous Insulin therapy (1.0 or 0.0)")

    glucose_now: float = Field(..., description="Current interstitial glucose (mg/dL)")
    glucose_mean_30min: float = Field(..., description="Mean glucose over past 30 min (mg/dL)")
    glucose_mean_2h: float = Field(..., description="Mean glucose over past 2 hours (mg/dL)")
    glucose_min_2h: float = Field(..., description="Minimum glucose over past 2 hours (mg/dL)")
    glucose_max_2h: float = Field(..., description="Maximum glucose over past 2 hours (mg/dL)")
    glucose_std_2h: float = Field(..., description="Glycemic variability standard deviation (mg/dL)")
    glucose_velocity_per_hour: float = Field(..., description="First derivative dG/dt (mg/dL/hour)")
    glucose_acceleration: float = Field(0.0, description="Second derivative d2G/dt2")

    minutes_since_meal: float = Field(-1.0, description="Elapsed minutes since last meal (-1 if none)")
    last_meal_carbs_g: float = Field(0.0, description="Carbohydrates of last meal (g)")
    carbs_intake_last_2h: float = Field(0.0, description="Cumulative carbohydrates in past 2 hours (g)")

    hour_of_day: float = Field(12.0, description="Continuous hour of day (0.0 to 23.75)")
    sin_hour: float = Field(0.0, description="sin(2*pi*hour/24)")
    cos_hour: float = Field(1.0, description="cos(2*pi*hour/24)")


class TrajectoryPoint(BaseModel):
    """Single point in the forward 2-hour continuous glycemic projection."""

    horizon_minutes: int = Field(..., description="Minutes ahead (+15, +30, ..., +120)")
    projected_glucose_mg_dl: float = Field(..., description="Expected continuous glucose level")
    lower_bound_p10_mg_dl: float = Field(..., description="Illustrative lower sensitivity bound (legacy field name; not a calibrated percentile)")
    upper_bound_p90_mg_dl: float = Field(..., description="Illustrative upper sensitivity bound (legacy field name; not a calibrated percentile)")


class SHAPDriver(BaseModel):
    """Mathematical explainability feature contribution."""

    feature: str = Field(..., description="Feature name")
    shap_value: float = Field(..., description="Shapley value impact on model log-odds")
    direction: Literal["increases_risk", "decreases_risk"] = Field(...)
    clinical_explanation: str = Field(..., description="Plain-language clinical rationale")


class PredictionResponse(BaseModel):
    """Dual-head prediction output for an instantaneous decision point."""

    person_id: Optional[str] = Field(None)
    decision_time: str = Field(..., description="ISO 8601 evaluation timestamp")
    glucose_now_mg_dl: float = Field(..., description="Baseline glucose at decision time")
    calibrated_spike_probability: float = Field(..., description="Isotonic calibrated risk P(Spike)")
    risk_tier: Literal["CALM", "WATCH", "HIGH"] = Field(...)
    optimal_decision_threshold: float = Field(0.220, description="Decision line tuned on held-out patients")
    spike_predicted: bool = Field(..., description="True if probability >= threshold")
    predicted_peak_glucose_mg_dl: float = Field(..., description="Highest projected glucose in 2h")
    predicted_peak_time_minutes: int = Field(..., description="Time horizon of peak (+15 to +120 min)")
    continuous_trajectory: List[TrajectoryPoint] = Field(..., description="8-step forward curve")
    top_shap_drivers: List[SHAPDriver] = Field(..., description="Top 5 mathematical risk drivers")
    event_status: Literal["incident_forecast", "ongoing_hyperglycemia"] = "incident_forecast"
    model_applicable: bool = True
    hypoglycemia_risk_warning: bool = False
    clarke_safety_zone: str = "Zone A (Clinically Safe Euglycemia)"
    alert_operating_mode: str = "standard"
    features: Dict[str, float] = Field(default_factory=dict)
    feature_provenance: Dict[str, Any] = Field(default_factory=dict)
    explanation: Dict[str, Any] = Field(default_factory=dict)
    model_provenance: Dict[str, Any] = Field(default_factory=dict)
    uncertainty_method: str = "Illustrative sensitivity envelope; not calibrated prediction intervals."
    warnings: List[str] = Field(default_factory=list)


class InterventionSpec(BaseModel):
    """Specification of an in-silico counterfactual intervention."""

    intervention_type: Literal[
        "postprandial_walk",
        "carb_reduction",
        "confirm_medication",
        "insulin_bolus",
        "food_sequencing",
        "compound_lifestyle",
    ] = Field(..., description="Type of clinical/lifestyle intervention")
    parameters: Dict[str, Any] = Field(
        default_factory=dict,
        description="e.g. {'duration_minutes': 20, 'intensity': 'brisk'}, {'carb_reduction_g': 35}",
    )


    @model_validator(mode="after")
    def validate_parameters(self):
        ranges = {"duration_minutes": (1, 120), "carb_reduction_g": (0, 150),
                  "delay_carbs_minutes": (0, 60), "dose_mg": (1, 3000),
                  "units": (0, 20), "isf_mg_dl_per_unit": (5, 150)}
        for key, (low, high) in ranges.items():
            if key in self.parameters:
                try:
                    value = float(self.parameters[key])
                except (ValueError, TypeError) as exc:
                    raise ValueError(f"{key} must be numeric") from exc
                if not low <= value <= high:
                    raise ValueError(f"{key} must be between {low} and {high}")
        if "intensity" in self.parameters and self.parameters["intensity"] not in ["brisk", "moderate", "gentle"]:
            raise ValueError("intensity must be brisk, moderate or gentle")
        if self.intervention_type == "insulin_bolus" and "isf_mg_dl_per_unit" not in self.parameters:
            raise ValueError("Insulin sensitivity must be explicitly supplied for an educational insulin scenario")
        return self


class SimulationBranchResult(BaseModel):
    """Result of simulating one specific counterfactual intervention."""

    intervention_type: str
    intervention_label: str
    baseline_peak_mg_dl: float
    simulated_peak_mg_dl: float
    peak_reduction_mg_dl: float
    baseline_risk_probability: float
    simulated_risk_probability: float
    risk_reduction_percentage_points: float
    baseline_auc_mg_min_dl: float
    simulated_auc_mg_min_dl: float
    auc_reduction_percent: float
    baseline_tir_percent: float
    simulated_tir_percent: float
    spike_averted: bool
    hypoglycemia_risk_warning: bool
    clarke_safety_zone: Optional[str] = None
    simulation_method: str = "Assumption-based physiological sensitivity analysis; not a causal treatment model."
    clinically_validated: bool = False
    simulated_trajectory: List[TrajectoryPoint]
    clinical_rationale: str
    biophysical_mechanism: str


class SimulationRequest(BaseModel):
    """Request to evaluate baseline state and multiple in-silico 'What-If' scenarios."""

    person_id: Optional[str] = Field("P001")
    decision_time: Optional[str] = None
    features: Optional[ClinicalFeatures] = Field(None)
    threshold: Optional[float] = Field(None, description="Optional custom probability decision threshold")
    alert_mode: Optional[str] = Field(None, description="Optional operating mode: standard, high_sensitivity, high_specificity")
    interventions: List[InterventionSpec] = Field(
        default_factory=lambda: [
            InterventionSpec(
                intervention_type="postprandial_walk",
                parameters={"duration_minutes": 20, "intensity": "brisk"},
            ),
            InterventionSpec(
                intervention_type="carb_reduction",
                parameters={"carb_reduction_g": 35},
            ),
            InterventionSpec(
                intervention_type="food_sequencing",
                parameters={"preload_type": "fiber_protein", "delay_carbs_minutes": 15},
            ),
            InterventionSpec(
                intervention_type="compound_lifestyle",
                parameters={"duration_minutes": 20, "carb_reduction_g": 25},
            ),
            InterventionSpec(
                intervention_type="confirm_medication",
                parameters={"drug": "metformin", "dose_mg": 500},
            ),
        ]
    )


class SimulationResponse(BaseModel):
    """Full in-silico simulation response with baseline and branching counterfactuals."""

    person_id: str
    decision_time: str
    baseline: PredictionResponse
    counterfactual_branches: List[SimulationBranchResult]
    optimal_recommended_action: str
