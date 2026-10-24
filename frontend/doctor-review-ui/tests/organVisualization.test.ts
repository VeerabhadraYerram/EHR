import { test } from 'node:test';
import assert from 'node:assert/strict';
import { organGlucoseState, glucoseOverlayColor } from '../src/diagnostics/organVisualization.ts';
import type { Patient, Reading, PatientSimulation } from '../src/diagnostics/types.ts';
const p = {person_id:'P1'} as Patient;
const r = {person_id:'P1', reading_time:'2021-01-01T10:00:00', glucose_mg_dl:120} as Reading;
const s = {person_id:'P1', decision_time:r.reading_time, baseline:{person_id:'P1', decision_time:r.reading_time, predicted_peak_glucose_mg_dl:210, continuous_trajectory:[{horizon_minutes:15,projected_glucose_mg_dl:200,lower_bound_p10_mg_dl:170,upper_bound_p90_mg_dl:230}]},counterfactual_branches:[{intervention_type:'walk',intervention_label:'Walking',simulated_trajectory:[{horizon_minutes:15,projected_glucose_mg_dl:160,lower_bound_p10_mg_dl:140,upper_bound_p90_mg_dl:190}]}]} as PatientSimulation;
test('organ overlay uses recorded value at zero and exact shared model/branch horizons',()=>{
  assert.equal(organGlucoseState(p,r,s,0,'walk')?.glucose,120);
  assert.equal(organGlucoseState(p,r,s,15)?.glucose,200);
  const branch=organGlucoseState(p,r,s,15,'walk');
  assert.equal(branch?.glucose,160); assert.equal(branch?.baseline,200);
  assert.equal(branch?.source,'What-if estimate'); assert.equal(branch?.lower,140);
  assert.equal(organGlucoseState(p,r,s,30),null);
  assert.equal(organGlucoseState(p,r,s,15,'missing'),null);
});
test('missing and mismatched data never produce invented or stale forecasts',()=>{
  assert.equal(organGlucoseState(p,r,null,15),null);
  assert.equal(organGlucoseState(p,r,{...s,person_id:'P2'},15),null);
  assert.equal(organGlucoseState(p,r,{...s,baseline:{...s.baseline,decision_time:'2021-01-02'}},15),null);
  assert.equal(organGlucoseState(p,{...r,reading_time:'2021-01-02'},s,15),null);
  assert.equal(organGlucoseState(p,{...r,person_id:'P2'},s,0),null);
  assert.equal(organGlucoseState(p,null,s,0),null);
});
test('legend colors vary with glucose and clamp safely without changing anatomy',()=>{
  assert.notEqual(glucoseOverlayColor(100),glucoseOverlayColor(200));
  assert.notEqual(glucoseOverlayColor(60),glucoseOverlayColor(100));
  assert.equal(glucoseOverlayColor(500),glucoseOverlayColor(250));
  assert.match(glucoseOverlayColor(NaN),/^#[0-9a-f]{6}$/);
});
