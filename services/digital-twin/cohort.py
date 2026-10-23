"""As-of-time cohort feature assembly, aligned with the training pipeline."""
from __future__ import annotations
import csv
import math
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path
import numpy as np
try:
    from .models import ClinicalFeatures
except ImportError:
    from models import ClinicalFeatures

@lru_cache(maxsize=8)
def _read_table(path: str, modified: int):
    with open(path, encoding="utf-8") as handle:
        return list(csv.DictReader(handle))

def table(path: Path):
    return _read_table(str(path), path.stat().st_mtime_ns)

def patient_readings(data_dir: Path, patient_id: str):
    return sorted((row for row in table(data_dir / 'wearables' / 'readings.csv') if row['person_id'] == patient_id), key=lambda row: row['reading_time'])

def build_features(data_dir: Path, patient_id: str, decision_time: str | None):
    patients = [p for p in table(data_dir / 'clinic' / 'patients.csv') if p['person_id'] == patient_id]
    if not patients:
        raise LookupError(f'Patient {patient_id} not found.')
    patient = patients[0]
    readings = patient_readings(data_dir, patient_id)
    if not readings:
        raise ValueError('Patient has no sensor history.')
    selected = decision_time or readings[-1]['reading_time']
    try:
        end = datetime.fromisoformat(selected)
        selected = end.isoformat()
        # Cohort timestamps are local, timezone-naive recorded times.
        if end.tzinfo is not None:
            raise ValueError('Use the recorded reading_time without a timezone suffix.')
    except ValueError as exc:
        raise ValueError(f'Invalid decision_time: {exc}') from exc
    past = [r for r in readings if datetime.fromisoformat(r['reading_time']) <= end]
    if not past or datetime.fromisoformat(past[-1]['reading_time']) != end:
        raise ValueError('decision_time must match an existing patient reading_time.')
    window = [r for r in past if datetime.fromisoformat(r['reading_time']) >= end - timedelta(hours=2)]
    if len(window) != 9 or any((datetime.fromisoformat(window[i]['reading_time']) - datetime.fromisoformat(window[i-1]['reading_time'])).total_seconds() != 900 for i in range(1, len(window))):
        raise ValueError('Insufficient history: nine consecutive 15-minute readings (two hours) are required.')
    g = np.array([float(r['glucose_mg_dl']) for r in window])
    cur = window[-1]
    hour = end.hour + end.minute / 60
    # Baseline covariates intentionally mirror the training cohort snapshot. Labs
    # dated after CGM are never silently described as contemporaneous measurements.
    required = ['age_years', 'bmi', 'years_with_diabetes', 'hba1c_percent', 'fasting_c_peptide_nmol_l', 'creatinine_mg_dl', 'egfr', 'sex', 'on_metformin', 'on_insulin']
    missing = [key for key in required if patient.get(key, '') == '']
    if missing:
        raise ValueError('Missing patient baseline facts: ' + ', '.join(missing))
    if patient['sex'] not in ['male', 'female']:
        raise ValueError('Unsupported or missing recorded sex; no default applied.')
    if any(patient[key] not in ['yes', 'no'] for key in ['on_metformin', 'on_insulin']):
        raise ValueError('Medication exposure flags must be recorded yes/no; no default applied.')
    velocity = (g[-1] - g[-3]) / .5
    previous_velocity = (g[-3] - g[-5]) / .5
    features = ClinicalFeatures(
        age_years=float(patient['age_years']), sex_male=float(patient['sex'] == 'male'),
        bmi=float(patient['bmi']), years_with_diabetes=float(patient['years_with_diabetes']),
        hba1c_percent=float(patient['hba1c_percent']), fasting_c_peptide=float(patient['fasting_c_peptide_nmol_l']),
        creatinine_mg_dl=float(patient['creatinine_mg_dl']), egfr=float(patient['egfr']),
        on_metformin=float(patient['on_metformin'] == 'yes'), on_insulin=float(patient['on_insulin'] == 'yes'),
        glucose_now=float(g[-1]), glucose_mean_30min=round(float(g[-3:].mean()), 1),
        glucose_mean_2h=round(float(g.mean()), 1), glucose_min_2h=float(g.min()), glucose_max_2h=float(g.max()),
        glucose_std_2h=round(float(g.std()), 1), glucose_velocity_per_hour=round(float(velocity), 1),
        glucose_acceleration=round(float(velocity-previous_velocity), 1),
        minutes_since_meal=float(cur['minutes_since_meal']), last_meal_carbs_g=float(cur['last_meal_carbs_g']),
        carbs_intake_last_2h=sum(float(r['meal_carbs_g'] or 0) for r in window),
        hour_of_day=round(hour, 2), sin_hour=round(math.sin(2*math.pi*hour/24), 4), cos_hour=round(math.cos(2*math.pi*hour/24), 4))
    provenance = {
        'source': 'Research-derived demonstration cohort; anonymized/derived profiles are not clinically validated patient twins.',
        'history_start': window[0]['reading_time'], 'history_end': cur['reading_time'], 'history_count': len(window),
        'sensor_features': 'Recorded CGM and meal context at or before decision_time only; no future readings used.',
        'baseline_covariates': 'Fixed cohort baseline snapshot used during training; not time-varying EHR reconstruction.',
        'meal_context': {key: cur[key] for key in ['minutes_since_meal', 'last_meal_carbs_g', 'meal_description']},
        'baseline_columns': required,
    }
    return features, selected, provenance
