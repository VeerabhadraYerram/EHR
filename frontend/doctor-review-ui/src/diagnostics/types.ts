export interface Patient {
  person_id: string;
  source_patient_id?: string;
  display_name: string;
  is_demo?: string | boolean;
  split?: string;
  age_years: number | string;
  sex: string;
  bmi: number | string;
  diabetes_type?: string | number;
  years_with_diabetes: number | string;
  diagnosis_name?: string;
  icd10_code?: string;
  snomed_code?: string;
  hba1c_percent: number | string;
  hba1c_ifcc_mmol_mol?: number | string;
  fasting_glucose_mg_dl: number | string;
  postprandial_glucose_mg_dl: number | string;
  fasting_c_peptide_nmol_l: number | string;
  postprandial_c_peptide_nmol_l?: number | string;
  creatinine_mg_dl: number | string;
  egfr: number | string;
  total_cholesterol_mg_dl?: number | string;
  triglycerides_mg_dl?: number | string;
  hdl_mg_dl?: number | string;
  ldl_mg_dl?: number | string;
  on_metformin?: string | number;
  on_insulin?: string | number;
  on_acarbose?: string | number;
  on_dpp4?: string | number;
  on_sglt2?: string | number;
  hypoglycemic_agents_raw?: string;
  comorbidities?: string;
  // Computed / live risk fields
  risk_status?: {
    tier: "HIGH" | "WATCH" | "CALM";
    spike_probability: number;
    projected_peak_mg_dl: number;
    reason_medical?: string;
    decision_time?: string;
  };
}

export interface Reading {
  person_id?: string;
  reading_time: string;
  time?: string;
  glucose_mg_dl: number;
  meal_carbs_g?: number | null;
  meal_description?: string;
  insulin_units?: number | null;
  minutes_since_meal?: number;
  last_meal_carbs_g?: number;
  is_spike?: boolean;
}

export interface TrajectoryPoint {
  horizon_minutes: number;
  projected_glucose_mg_dl: number;
  lower_bound_p10_mg_dl: number;
  upper_bound_p90_mg_dl: number;
}

export interface ShapDriver {
  feature: string;
  shap_value: number;
  direction: "increases_risk" | "decreases_risk" | string;
  clinical_explanation: string;
}

export interface SimulationBranch {
  intervention_type: string;
  intervention_label: string;
  baseline_peak_mg_dl: number;
  simulated_peak_mg_dl: number;
  peak_reduction_mg_dl: number;
  baseline_risk_probability: number;
  simulated_risk_probability: number;
  risk_reduction_percentage_points: number;
  baseline_auc_mg_min_dl?: number;
  simulated_auc_mg_min_dl?: number;
  auc_reduction_percent?: number;
  baseline_tir_percent?: number;
  simulated_tir_percent?: number;
  spike_averted?: boolean;
  hypoglycemia_risk_warning?: boolean;
  clarke_safety_zone?: string;
  simulated_trajectory: TrajectoryPoint[];
  clinical_rationale: string;
  biophysical_mechanism: string;
}

export interface PatientSimulation {
  person_id: string;
  decision_time: string;
  baseline: {
    person_id: string;
    decision_time: string;
    glucose_now_mg_dl: number;
    calibrated_spike_probability: number;
    risk_tier: "HIGH" | "WATCH" | "CALM" | string;
    optimal_decision_threshold: number;
    spike_predicted: boolean;
    predicted_peak_glucose_mg_dl: number;
    predicted_peak_time_minutes: number;
    continuous_trajectory: TrajectoryPoint[];
    top_shap_drivers: ShapDriver[];
    hypoglycemia_risk_warning?: boolean;
    clarke_safety_zone?: string;
    alert_operating_mode?: string;
    event_status?: string;
    model_applicable?: boolean;
    warnings?: string[];
    explanation?: Record<string, unknown>;
    model_provenance?: Record<string, unknown>;
    uncertainty_method?: string;
    features?: Record<string, number>;
    feature_provenance?: Record<string, unknown>;
  };
  counterfactual_branches: SimulationBranch[];
  optimal_recommended_action: string;
  features?: Record<string, number>;
  feature_provenance?: Record<string, unknown>;
  event_status?: string;
  explanation?: Record<string, unknown>;
  model_provenance?: Record<string, unknown>;
  uncertainty_method?: string;
  assumptions?: string[];
}

export interface InterventionSpec {
  intervention_type: string;
  parameters: Record<string, number | string>;
}
