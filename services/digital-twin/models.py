"""Pydantic schemas and data contracts for the Digital Twin Simulation & Prediction Service."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class ClinicalFeatures(BaseModel):
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
    lower_bound_p10_mg_dl: float = Field(..., description="10th percentile confidence bound")
    upper_bound_p90_mg_dl: float = Field(..., description="90th percentile confidence bound")


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
    clarke_safety_zone: Literal["Zone A (Safe)", "Zone B (Benign)", "Zone C/D/E (Unsafe)"]
    simulated_trajectory: List[TrajectoryPoint]
    clinical_rationale: str
    biophysical_mechanism: str


class SimulationRequest(BaseModel):
    """Request to evaluate baseline state and multiple in-silico 'What-If' scenarios."""

    person_id: Optional[str] = Field("P001")
    features: Optional[ClinicalFeatures] = Field(None)
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
