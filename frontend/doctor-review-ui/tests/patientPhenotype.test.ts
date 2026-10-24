import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phenotypeFor, recordedNumber } from '../src/diagnostics/patientPhenotype.ts';
import type { Patient } from '../src/diagnostics/types.ts';

test('recorded sex selects separate references; missing sex stays neutral',()=>{
  assert.equal(phenotypeFor({sex:'Female'} as Patient).sex,'female');
  assert.equal(phenotypeFor({sex:'M'} as Patient).sex,'male');
  assert.equal(phenotypeFor({} as Patient).sex,'neutral');
  for(const value of ['',null,undefined,'bad',Infinity]) assert.equal(recordedNumber(value),null);
});
test('BMI modifies habitus while reference comparison preserves clinical BMI',()=>{
  const patient={sex:'Female',age_years:40,bmi:36.7} as Patient;
  const fitted=phenotypeFor(patient),preview=phenotypeFor(patient,true);
  assert(fitted.morphWeights[1]>0.6);
  assert.equal(preview.morphWeights[1],0);
  assert.equal(preview.bmi,36.7);
  assert.equal(patient.bmi,36.7);
  assert.equal(preview.measuredOrganMorphology,false);
});
test('morphs remain convex and finite across adult ages and BMI extremes',()=>{
  for(const age_years of [18,30,55,80,120]) for(const bmi of [10,17,22,31,40,70]){
    const p=phenotypeFor({age_years,bmi} as Patient);
    assert(p.morphWeights.every(w=>Number.isFinite(w)&&w>=0&&w<=1));
    assert(p.morphWeights.reduce((a,b)=>a+b,0)<=1.000001);
  }
});
test('missing or unsupported measurements use reference defaults explicitly',()=>{
  const p=phenotypeFor({bmi:-2,age_years:10,sex:'unknown'} as Patient);
  assert.deepEqual(p.missing,['BMI','age','recorded sex']);
  assert(p.morphWeights.every(w=>w===0));
});
