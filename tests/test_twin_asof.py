"""Decision-time isolation and honest inference/export contracts."""
import importlib.util
import sys
from pathlib import Path
import numpy as np
import pytest
from fastapi.testclient import TestClient
ROOT = Path(__file__).resolve().parents[1]
SERVICE = ROOT / 'services' / 'digital-twin'
# Unique namespace prevents cross-service `main` module collection collisions.
spec = importlib.util.spec_from_file_location('twin_under_test', SERVICE / '__init__.py', submodule_search_locations=[str(SERVICE)])
pkg = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = pkg
spec.loader.exec_module(pkg)
from twin_under_test import main, cohort
client = TestClient(main.app)


def test_asof_contract_and_additivity():
    rows = cohort.patient_readings(main.DATA_DIR, 'P001')
    timestamp = rows[40]['reading_time']
    response = client.get('/api/v1/twin/patients/P001/predict', params={'decision_time': timestamp})
    assert response.status_code == 200, response.text
    pred = response.json()
    assert pred['decision_time'] == timestamp
    assert pred['glucose_now_mg_dl'] == float(rows[40]['glucose_mg_dl'])
    assert pred['features']['age_years'] == float(main.get_patient('P001')['age_years'])
    assert pred['features']['minutes_since_meal'] == float(rows[40]['minutes_since_meal'])
    assert pred['feature_provenance']['history_end'] == timestamp
    exp = pred['explanation']
    assert len(exp['all_contributions']) == 24
    assert abs(exp['additivity_residual']) < 1e-4
    assert 1 / (1 + np.exp(-exp['raw_margin'])) == pytest.approx(exp['raw_probability'], abs=1e-6)
    sim = client.post('/api/v1/twin/simulate/P001', params={'decision_time': timestamp}, json=[]).json()
    assert sim['baseline'] == pred


def test_future_readings_do_not_change_feature_state(monkeypatch):
    rows = cohort.patient_readings(main.DATA_DIR, 'P001')
    timestamp = rows[40]['reading_time']
    expected = cohort.build_features(main.DATA_DIR, 'P001', timestamp)
    changed = [dict(row, glucose_mg_dl='999') if row['reading_time'] > timestamp else row for row in rows]
    monkeypatch.setattr(cohort, 'patient_readings', lambda *args: changed)
    actual = cohort.build_features(main.DATA_DIR, 'P001', timestamp)
    assert actual == expected


def test_missing_history_and_unknown_patients_fail():
    rows = cohort.patient_readings(main.DATA_DIR, 'P001')
    assert client.get('/api/v1/twin/patients/P001/predict', params={'decision_time': rows[0]['reading_time']}).status_code == 422
    assert client.get('/api/v1/twin/patients/UNKNOWN/predict').status_code == 404
    assert client.get('/api/v1/twin/patients/P001/predict', params={'decision_time': '2099-01-01T00:00:00'}).status_code == 422


def test_dates_and_date_readings():
    dates = client.get('/api/v1/twin/patients/P001/dates').json()
    assert dates['default_date'] in dates['dates']
    rows = client.get('/api/v1/twin/patients/P001/readings', params={'date': dates['default_date'], 'limit': 0}).json()
    assert all(row['reading_time'].startswith(dates['default_date']) for row in rows)
    assert 'last_meal_carbs_g' in rows[0]


def test_ongoing_hyperglycemia_is_outside_incident_domain():
    rows = cohort.patient_readings(main.DATA_DIR, 'P001')
    row = next(r for r in rows[8:] if float(r['glucose_mg_dl']) >= 180)
    pred = client.get('/api/v1/twin/patients/P001/predict', params={'decision_time': row['reading_time']}).json()
    assert pred['event_status'] == 'ongoing_hyperglycemia'
    assert pred['model_applicable'] is False
    assert pred['warnings']


def test_simulation_assumptions_and_parameter_validation():
    bad = [{'intervention_type': 'postprandial_walk', 'parameters': {'duration_minutes': -5}}]
    assert client.post('/api/v1/twin/simulate/P001', json=bad).status_code == 422
    sim = client.post('/api/v1/twin/simulate/P001', json=[{'intervention_type': 'postprandial_walk'}]).json()
    branch = sim['counterfactual_branches'][0]
    assert branch['clarke_safety_zone'] is None
    assert branch['clinically_validated'] is False
    assert 'Assumption-based' in branch['simulation_method']


def test_fhir_export_has_patient_provenance_and_local_validation():
    bundle = client.get('/api/v1/twin/fhir/bundle/P001').json()
    resources = {entry['resource']['resourceType']: entry['resource'] for entry in bundle['entry']}
    assert set(resources) == {'Patient', 'Observation', 'RiskAssessment', 'CarePlan', 'Provenance'}
    assert resources['CarePlan']['status'] == 'draft'
    assert resources['CarePlan']['intent'] == 'proposal'
    assert 'condition' not in resources['RiskAssessment']
    outcome = client.get('/api/v1/twin/fhir/validate/P001').json()
    assert outcome['resourceType'] == 'OperationOutcome'
    assert not any(issue['severity'] == 'error' for issue in outcome['issue'])
    assert 'Official HL7' in outcome['issue'][-1]['diagnostics']



def test_portable_manifest_and_stale_source_guard(tmp_path):
    from twin_under_test.portable import load_portable_models, SOURCE_FILES, MANIFEST_NAME
    import json
    import shutil
    manifest = json.loads((main.DATA_DIR / 'model' / MANIFEST_NAME).read_text())
    assert main.engine.serialization_format == 'native_xgboost_json_and_numpy_isotonic'
    assert manifest['parity_verification']['patients'] == 100
    assert manifest['parity_verification']['clinical_vectors'] >= 500
    model_dir = main.DATA_DIR / 'model'
    for name in list(SOURCE_FILES) + list(manifest['export_sha256']) + [MANIFEST_NAME]:
        shutil.copyfile(model_dir / name, tmp_path / name)
    load_portable_models(tmp_path)
    with (tmp_path / 'feature_names.json').open('a') as handle:
        handle.write(' ')
    with pytest.raises(ValueError, match='stale'):
        load_portable_models(tmp_path)


def test_sequencing_and_compound_parameters_affect_scenarios():
    specs = [
        {'intervention_type': 'food_sequencing', 'parameters': {'delay_carbs_minutes': 0}},
        {'intervention_type': 'food_sequencing', 'parameters': {'delay_carbs_minutes': 30}},
        {'intervention_type': 'compound_lifestyle', 'parameters': {'duration_minutes': 10, 'carb_reduction_g': 5}},
        {'intervention_type': 'compound_lifestyle', 'parameters': {'duration_minutes': 30, 'carb_reduction_g': 35}},
    ]
    result = client.post('/api/v1/twin/simulate/P001', json=specs).json()
    branches = result['counterfactual_branches']
    baseline = result['baseline']['continuous_trajectory']
    assert [p['projected_glucose_mg_dl'] for p in branches[0]['simulated_trajectory']] == [p['projected_glucose_mg_dl'] for p in baseline]
    assert branches[0]['simulated_trajectory'] != branches[1]['simulated_trajectory']
    assert branches[0]['simulated_risk_probability'] > branches[1]['simulated_risk_probability']
    assert branches[2]['simulated_trajectory'] != branches[3]['simulated_trajectory']
    assert branches[2]['simulated_risk_probability'] > branches[3]['simulated_risk_probability']


def test_cohort_risk_summary_matches_selected_model_state():
    response = client.get('/api/v1/twin/cohort/risk-summaries')
    assert response.status_code == 200, response.text
    cohort_result = response.json()
    summaries = cohort_result['summaries']
    assert len(summaries) == 100
    assert len({p['person_id'] for p in summaries}) == 100
    assert all(p['model_applicable'] for p in summaries)
    for summary in summaries[::20]:
        individual = client.get(f"/api/v1/twin/patients/{summary['person_id']}/predict", params={'decision_time': summary['decision_time']}).json()
        assert summary['risk_tier'] == individual['risk_tier']
        assert summary['calibrated_spike_probability'] == individual['calibrated_spike_probability']
        assert summary['predicted_peak_glucose_mg_dl'] == individual['predicted_peak_glucose_mg_dl']
    repeated = client.get('/api/v1/twin/cohort/risk-summaries').json()
    assert repeated['evaluated_at'] == cohort_result['evaluated_at']



def test_fhir_custom_scenario_matches_current_simulation():
    rows = cohort.patient_readings(main.DATA_DIR, 'P001')
    timestamp = rows[40]['reading_time']
    specs = [{'intervention_type': 'carb_reduction', 'parameters': {'carb_reduction_g': 25}}]
    simulation = client.post('/api/v1/twin/simulate/P001', params={'decision_time': timestamp}, json=specs).json()
    response = client.post('/api/v1/twin/fhir/bundle/P001', params={'decision_time': timestamp}, json=specs)
    assert response.status_code == 200, response.text
    resources = {entry['resource']['resourceType']: entry['resource'] for entry in response.json()['entry']}
    activities = resources['CarePlan']['activity']
    assert len(activities) == 1
    branch = simulation['counterfactual_branches'][0]
    description = activities[0]['detail']['description']
    assert branch['intervention_label'] in description
    assert f"{branch['baseline_peak_mg_dl']:.1f} -> {branch['simulated_peak_mg_dl']:.1f}" in description
    assert timestamp in resources['RiskAssessment']['prediction'][0]['rationale']



def test_fhir_ongoing_high_glucose_omits_invalid_incident_claims():
    rows = cohort.patient_readings(main.DATA_DIR, 'P001')
    row = next(r for r in rows[8:] if float(r['glucose_mg_dl']) >= 180)
    response = client.post('/api/v1/twin/fhir/bundle/P001', params={'decision_time': row['reading_time']}, json=[])
    assert response.status_code == 200, response.text
    resources = {entry['resource']['resourceType']: entry['resource'] for entry in response.json()['entry']}
    risk = resources['RiskAssessment']
    assert risk['status'] == 'cancelled'
    assert 'prediction' not in risk
    assert 'probabilityDecimal' not in str(risk)
    assert 'qualitativeRisk' not in str(risk)
    assert 'ongoing hyperglycemia' in risk['note'][0]['text']
    assert 'below 180' in risk['note'][0]['text']
    assert resources['Observation']['valueQuantity']['value'] >= 180
    assert 'activity' not in resources['CarePlan']
    assert 'No model-based intervention' in resources['CarePlan']['description']
    from twin_under_test.fhir_mappers import validate_bundle
    assert not any(issue['severity'] == 'error' for issue in validate_bundle(response.json())['issue'])
