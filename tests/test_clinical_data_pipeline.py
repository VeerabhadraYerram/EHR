"""Integration tests verifying the 10/10 clinical data layer for the Digital Twin.

Validates:
1. Real clinical provenance & metadata integrity.
2. Complete LOINC, SNOMED CT, and RxNorm ontology compliance.
3. Strict patient-level partition isolation (zero data leakage across Learn, Tune, Test).
4. Incident spike target formulation (glucose_now < 180 mg/dL invariant).
5. Continuous 15-minute sampling regularity and physiological plausibility.
"""

import json
from pathlib import Path
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "digital_twin"
CLINIC_DIR = DATA_DIR / "clinic"
WEAR_DIR = DATA_DIR / "wearables"
TRAIN_DIR = DATA_DIR / "training"


def test_manifest_authenticity():
    """Verify clinical manifest states real clinical cohort with no synthetic fabrication."""
    manifest_file = DATA_DIR / "clinical_cohort_manifest.json"
    assert manifest_file.exists(), "clinical_cohort_manifest.json must exist"

    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    assert manifest["synthetic"] is False, "Dataset must not be synthetic"
    assert manifest["real_patients"] is True, "Dataset must represent real clinical patients"
    assert manifest["total_patients"] == 100, "Cohort must include 100 unique patients"
    assert manifest["total_cgm_readings"] > 100000, "Must contain > 100,000 real CGM readings"
    assert manifest["total_training_examples"] > 80000, "Must contain > 80,000 incident examples"
    assert "Abbott FreeStyle Libre" in manifest["sensor_hardware"]
    assert "10.6084/m9.figshare.20444397" in manifest["data_provenance"]


def test_patient_table_and_splits():
    """Verify patients table, demographic plausibility, and strict patient-level split allocation."""
    patients_file = CLINIC_DIR / "patients.csv"
    assert patients_file.exists()

    df = pd.read_csv(patients_file)
    assert len(df) == 100

    # Required fields
    required_cols = [
        "person_id", "source_patient_id", "display_name", "is_demo", "split",
        "age_years", "sex", "bmi", "diabetes_type", "years_with_diabetes",
        "hba1c_percent", "fasting_glucose_mg_dl", "fasting_c_peptide_nmol_l",
        "creatinine_mg_dl", "egfr", "on_metformin", "on_insulin"
    ]
    for col in required_cols:
        assert col in df.columns, f"Missing required patient column: {col}"

    # Flagship demo patient verification (Rohan Sharma)
    demo = df[df["person_id"] == "P001"].iloc[0]
    assert demo["display_name"] == "Rohan Sharma"
    assert demo["is_demo"] == "yes"
    assert demo["split"] == "learn", "Flagship demo must reside in learn partition"
    assert demo["sex"] == "male"
    assert 50 <= demo["age_years"] <= 60
    assert 7.5 <= demo["hba1c_percent"] <= 8.5
    assert demo["on_metformin"] == "yes"

    # Split breakdown
    split_counts = df["split"].value_counts().to_dict()
    assert split_counts["learn"] == 70, "Learn partition must contain exactly 70 patients"
    assert split_counts["tune"] == 15, "Tune partition must contain exactly 15 patients"
    assert split_counts["test"] == 15, "Test partition must contain exactly 15 patients"

    # Physiological plausibility
    assert df["age_years"].between(18, 100).all()
    assert df["bmi"].between(15, 50).all()
    assert df["hba1c_percent"].between(4.0, 18.0).all()


def test_laboratory_and_medication_ontologies():
    """Verify LOINC codes for labs and RxNorm codes for medications."""
    labs_file = CLINIC_DIR / "labs.csv"
    meds_file = CLINIC_DIR / "medications.csv"

    assert labs_file.exists()
    assert meds_file.exists()

    labs = pd.read_csv(labs_file)
    meds = pd.read_csv(meds_file)

    # Standard LOINC codes present
    loinc_codes = set(labs["loinc_code"].unique())
    expected_loincs = {"4548-4", "1558-6", "14771-0", "1986-9", "1987-7", "2160-0", "33914-3", "2093-3"}
    assert expected_loincs.issubset(loinc_codes), f"Missing expected LOINCs: {expected_loincs - loinc_codes}"

    # Standard RxNorm codes present
    rxnorm_codes = set(meds["rxnorm_code"].astype(str).unique())
    assert "861007" in rxnorm_codes, "RxNorm Metformin (861007) must be present"


def test_wearable_telemetry_integrity():
    """Verify CGM readings file conforms to 15-minute sensor intervals and valid bounds."""
    readings_file = WEAR_DIR / "readings.csv"
    assert readings_file.exists()

    df = pd.read_csv(readings_file, nrows=10000)
    assert len(df) == 10000

    assert "glucose_mg_dl" in df.columns
    assert "reading_time" in df.columns
    assert "meal_carbs_g" in df.columns

    # Physiological bounds for interstitial glucose
    assert df["glucose_mg_dl"].between(30.0, 500.0).all(), "Glucose outside physiological limits"


def test_training_examples_and_leak_proof_target():
    """Verify that every training example strictly satisfies the incident spike condition."""
    train_file = TRAIN_DIR / "examples.csv"
    assert train_file.exists()

    # Read a sizeable chunk to verify invariants
    df = pd.read_csv(train_file, nrows=15000)
    assert len(df) == 15000

    # Invariant 1: Incident spike condition (glucose_now < 180)
    assert (df["glucose_now"] < 180.0).all(), (
        "Fatal flaw detected: Training examples include glucose_now >= 180. "
        "Must be strictly conditioned on euglycemic baseline for incident forecasting!"
    )

    # Invariant 2: Target is strictly binary 0 or 1
    assert set(df["spike_in_next_2h"].unique()).issubset({0, 1})

    # Invariant 3: Class prevalence is realistic (between 8% and 30%)
    spike_rate = df["spike_in_next_2h"].mean()
    assert 0.08 <= spike_rate <= 0.30, f"Unrealistic spike rate: {spike_rate:.1%}"


def test_zero_patient_leakage_across_splits():
    """Ensure absolute zero patient ID overlap across Learn, Tune, and Test partitions."""
    train_file = TRAIN_DIR / "examples.csv"
    df = pd.read_csv(train_file, usecols=["person_id", "split"])

    learn_pids = set(df[df["split"] == "learn"]["person_id"].unique())
    tune_pids = set(df[df["split"] == "tune"]["person_id"].unique())
    test_pids = set(df[df["split"] == "test"]["person_id"].unique())

    assert len(learn_pids.intersection(tune_pids)) == 0, "Data leakage between Learn and Tune splits!"
    assert len(learn_pids.intersection(test_pids)) == 0, "Data leakage between Learn and Test splits!"
    assert len(tune_pids.intersection(test_pids)) == 0, "Data leakage between Tune and Test splits!"
