import type { Patient, Reading, PatientSimulation } from "./types";
import { recordedNumber } from "./patientPhenotype.ts";
export function organMetrics(
  organ: string,
  patient: Patient,
  reading: Reading | null,
) {
  const metric = (
    label: string,
    value: unknown,
    unit: string,
    source = "Cohort profile · collection time unavailable",
  ) => ({ label, value: recordedNumber(value), unit, source });
  if (organ === "pancreas")
    return [
      metric(
        "Glucose",
        reading?.glucose_mg_dl,
        "mg/dL",
        reading?.reading_time
          ? `Sensor replay · ${reading.reading_time}`
          : "No recording selected",
      ),
      metric("HbA1c", patient.hba1c_percent, "%"),
      metric("Fasting C-peptide", patient.fasting_c_peptide_nmol_l, "nmol/L"),
    ];
  if (organ === "kidneys")
    return [
      metric("eGFR", patient.egfr, "mL/min/1.73 m²"),
      metric("Creatinine", patient.creatinine_mg_dl, "mg/dL"),
    ];
  if (organ === "heart")
    return [
      metric("LDL cholesterol", patient.ldl_mg_dl, "mg/dL"),
      metric("HDL cholesterol", patient.hdl_mg_dl, "mg/dL"),
      metric("Triglycerides", patient.triglycerides_mg_dl, "mg/dL"),
    ];
  if (organ === "body")
    return [
      metric("BMI", patient.bmi, "kg/m²"),
      metric("Age", patient.age_years, "years"),
    ];
  return [];
}

export function matchingOrganForecast(
  patient: Patient,
  reading: Reading | null,
  simulation?: PatientSimulation | null,
) {
  if (
    !reading ||
    !simulation ||
    simulation.person_id !== patient.person_id ||
    simulation.baseline.person_id !== patient.person_id ||
    (reading.person_id && reading.person_id !== patient.person_id) ||
    simulation.decision_time !== reading.reading_time ||
    simulation.baseline.decision_time !== reading.reading_time ||
    !Number.isFinite(simulation.baseline.predicted_peak_glucose_mg_dl)
  )
    return null;
  return simulation.baseline;
}
