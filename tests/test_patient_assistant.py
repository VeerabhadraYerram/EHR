"""Evidence, isolation and scenario guarantees; provider behavior is mocked, not trusted."""
import asyncio
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
SERVICE = ROOT / 'services/digital-twin'
spec = importlib.util.spec_from_file_location('assistant_under_test', SERVICE/'__init__.py', submodule_search_locations=[str(SERVICE)])
pkg = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = pkg
spec.loader.exec_module(pkg)
from assistant_under_test import assistant as a, portable
from assistant_under_test.models import InterventionSpec


def test_newline_hash_only_accepts_equivalent_metadata(tmp_path):
    file=tmp_path/'metrics.json';file.write_bytes(b'{\r\n"value": 5\r\n}\r\n')
    expected=hashlib.sha256(file.read_bytes()).hexdigest()
    file.write_bytes(file.read_bytes().replace(b'\r\n',b'\n'))
    assert portable.source_hash_matches(file,expected)
    file.write_bytes(b'{"value":6}')
    assert not portable.source_hash_matches(file,expected)
    binary=tmp_path/'calibrator.pkl';binary.write_bytes(b'a\nb')
    assert not portable.source_hash_matches(binary,hashlib.sha256(b'a\r\nb').hexdigest())


@pytest.mark.parametrize('text,minutes,grams',[
    ('walk thirty minutes',30,None),('walk twenty-five minutes',25,None),
    ('walk 0.5 hours',30,None),('reduce 25.5 grams',None,25.5),
    ('reduce 30 milligrams',None,None),('walk 30 miles',None,None),
])
def test_explicit_units(text,minutes,grams):
    values=a.explicit_amounts(text)
    if minutes is not None:assert minutes in values['minutes']
    else:assert not values['minutes']
    if grams is not None:assert grams in values['grams']
    else:assert not values['grams']


def plan(type='postprandial_walk',**parameters):
    return a.Plan(action='simulate',interventions=[InterventionSpec(intervention_type=type,parameters=parameters)])


@pytest.mark.parametrize('message,p',[
    ('The patient cannot walk for 30 minutes',plan(duration_minutes=30)),
    ('Do not reduce carbs by 20 grams',plan('carb_reduction',carb_reduction_g=20)),
    ('Increase carbs by 20 grams',plan('carb_reduction',carb_reduction_g=20)),
    ('What if the patient walks?',plan(duration_minutes=20)),
    ('What if the patient walks 30 miles?',plan(duration_minutes=30)),
    ('Give 5 units of insulin',plan('insulin_bolus',units=5,isf_mg_dl_per_unit=40)),
    ('What if the patient walks 30 minutes?',plan(duration_minutes=30,drug='metformin')),
])
def test_planner_cannot_invent_or_change_interventions(message,p):
    with pytest.raises(ValueError):a.validate_plan(p,a.ChatRequest(message=message,decision_time='2021-03-04T02:13:00'))


def test_valid_units_and_combined_request():
    p=plan('compound_lifestyle',duration_minutes=30,carb_reduction_g=20)
    assert a.validate_plan(p,a.ChatRequest(message='Walk for thirty minutes and reduce carbs by 20 grams',decision_time='2021-03-04T02:13:00')).action=='simulate'


def test_citations_and_numerical_grounding():
    evidence=[{'id':'hba1c','kind':'record','label':'HbA1c','value':8.1}]
    valid=a.Answer(title='Recorded evidence',claims=[a.Claim(kind='record',text='The patient’s HbA1c is 8.1%.',evidence_ids=['hba1c'])])
    assert a.validate_answer(valid,evidence).claims
    for claim in [a.Claim(kind='record',text='HbA1c is 9.4%',evidence_ids=['hba1c']),a.Claim(kind='record',text='A recorded result',evidence_ids=['invented']),a.Claim(kind='prediction',text='Expected result',evidence_ids=['hba1c'])]:
        with pytest.raises(ValueError):a.validate_answer(a.Answer(title='Test',claims=[claim]),evidence)


def test_provider_input_redacts_credentials_and_email():
    redacted=a.redact_provider_input({'question':'gsk_'+'a'*30+' user@example.com'})
    assert 'a'*30 not in redacted and 'user@example.com' not in redacted


def test_evidence_asof_no_other_patient():
    from assistant_under_test.main import get_patient,DATA_DIR
    evidence,history=a.evidence_context(DATA_DIR,get_patient('P001'),'2021-03-04T02:13:00',2)
    assert all(r['person_id']=='P001' and r['reading_time']<='2021-03-04T02:13:00' for r in history)
    assert len(history)==9
    assert not any(k in json.dumps(evidence) for k in ('Rohan Sharma','source_patient_id'))
    assert any(e['id']=='profile.hba1c_percent' and e['value']=='8.1' for e in evidence)
    with pytest.raises(ValueError):a.evidence_context(DATA_DIR,get_patient('P001'),'2021-03-04T02:14:00')


def test_offline_mode_and_cross_patient_guard(monkeypatch):
    from assistant_under_test.main import get_patient,DATA_DIR
    monkeypatch.setattr(a,'provider_options',lambda:[])
    req=a.ChatRequest(message='Explain the patient HbA1c',decision_time='2021-03-04T02:13:00')
    result=asyncio.run(a.answer_question(req,get_patient('P001'),DATA_DIR,None,'legacy'))
    assert result['provider']['provider']=='local'
    assert result['simulation'] is None
    assert any('8.1' in c['text'] for c in result['claims'])
    req.message='Show P002 instead'
    with pytest.raises(ValueError):asyncio.run(a.answer_question(req,get_patient('P001'),DATA_DIR,None,'legacy'))


def test_legacy_model_cannot_generate_scenario(monkeypatch):
    from assistant_under_test.main import get_patient,DATA_DIR
    monkeypatch.setattr(a,'provider_options',lambda:[('fake',)])
    async def fake(system,user,schema):
        if schema is a.Plan:return plan(duration_minutes=30),{'provider':'test','model':'mock'}
        return a.Answer(title='Model unavailable',claims=[a.Claim(kind='limitation',text='The forecast is unavailable.',evidence_ids=['availability'])]),{'provider':'test','model':'mock'}
    monkeypatch.setattr(a,'complete_json',fake)
    def must_not_run(*args):raise AssertionError('Legacy model was invoked')
    result=asyncio.run(a.answer_question(a.ChatRequest(message='Walk 30 minutes',decision_time='2021-03-04T02:13:00'),get_patient('P001'),DATA_DIR,must_not_run,'legacy'))
    assert result['simulation'] is None and any('blocked' in n for n in result['notices'])


def test_zero_scenario_is_identity_and_low_glucose_visible():
    from assistant_under_test.main import simulator,_cohort_features
    features,time,_=_cohort_features('P001','2021-03-04T02:13:00')
    base=simulator.engine.predict(features,decision_time=time,person_id='P001')
    base.continuous_trajectory=[p.model_copy(update={'projected_glucose_mg_dl':60.0}) for p in base.continuous_trajectory]
    zero=simulator._simulate_single_branch(features,base,InterventionSpec(intervention_type='carb_reduction',parameters={'carb_reduction_g':0}))
    assert all(p.projected_glucose_mg_dl==60 for p in zero.simulated_trajectory)
    assert zero.hypoglycemia_risk_warning
    assert zero.simulated_risk_probability==zero.baseline_risk_probability
    assert all(p.lower_bound_p10_mg_dl<=p.projected_glucose_mg_dl<=p.upper_bound_p90_mg_dl for p in zero.simulated_trajectory)


def test_unsubstantiated_stability_and_targets_are_not_accepted():
    evidence=[{'id':'egfr','kind':'record','label':'eGFR','value':102}]
    for text in ['The patient has stable kidney health.', 'The patient has normal kidney function.', 'Glucose is above target and could benefit from treatment.']:
        with pytest.raises(ValueError):
            a.validate_answer(a.Answer(title='Explanation',claims=[a.Claim(kind='explanation',text=text,evidence_ids=['egfr'])]),evidence)
