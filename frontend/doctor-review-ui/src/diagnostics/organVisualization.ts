import type { Patient, PatientSimulation, Reading } from './types';
import { matchingOrganForecast } from './organEvidence.ts';

/** Select exact model horizons. Never interpolate or invent organ outcomes. */
export function organGlucoseState(patient: Patient, reading: Reading | null,
  simulation: PatientSimulation | null | undefined, horizon: number, branchType = '') {
  if (!reading || (reading.person_id && reading.person_id !== patient.person_id)) return null;
  const baseline = matchingOrganForecast(patient, reading, simulation);
  if (horizon === 0) return Number.isFinite(reading.glucose_mg_dl)
    ? { glucose: reading.glucose_mg_dl, baseline: reading.glucose_mg_dl, horizon: 0,
        source: 'Recorded glucose', label: 'Selected recording', lower: null, upper: null } : null;
  if (!baseline) return null;
  const base = baseline.continuous_trajectory?.find(p => p.horizon_minutes === horizon);
  const branch = branchType ? simulation?.counterfactual_branches?.find(b => b.intervention_type === branchType) : null;
  const point = branchType ? branch?.simulated_trajectory.find(p => p.horizon_minutes === horizon) : base;
  if (!point || !base || !Number.isFinite(point.projected_glucose_mg_dl)) return null;
  return { glucose: point.projected_glucose_mg_dl, baseline: base.projected_glucose_mg_dl,
    horizon, source: branch ? 'What-if estimate' : 'Model forecast',
    label: branch?.intervention_label || 'Baseline forecast',
    lower: Number.isFinite(point.lower_bound_p10_mg_dl) ? point.lower_bound_p10_mg_dl : null,
    upper: Number.isFinite(point.upper_bound_p90_mg_dl) ? point.upper_bound_p90_mg_dl : null };
}

/** A visible data legend, not a tissue-damage or organ-function model. */
export function glucoseOverlayColor(glucose: number) {
  if (!Number.isFinite(glucose)) return '#78918b';
  if (glucose < 70) return '#a68bc7';
  const t = Math.max(0, Math.min(1, (glucose - 100) / 150));
  const a = [79, 176, 149], b = [224, 137, 76];
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
