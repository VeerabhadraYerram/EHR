"""Build two synthetic databases for the Type 2 diabetes digital twin.

Clinic file: 100 people, labs, and medicines, shaped like the Rohan Sharma
sample and coded with LOINC / ICD-10 / SNOMED / RxNorm from the seed workbook.
Wearable log: the same 100 people, 14 days, one row every 15 minutes.

The sugar line is a simple teaching generator, not a medical device and not
Synthea. Meals, walks, sleep, and missed tablets move the line. Some rises
are deliberately left unlogged so a later model can be wrong.

Split is by person, fixed before any score is computed:
70 learn, 10 tune, 20 test. Person P001 is the demo patient and stays in learn.
"""

from __future__ import annotations

import csv
import json
import math
import random
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "digital_twin"
CLINIC = OUT / "clinic"
WEAR = OUT / "wearables"

SEED = 20260809
N_PEOPLE = 100
N_LEARN = 70
N_TUNE = 10
N_TEST = 20
INTERVAL_MINUTES = 15
START = datetime(2026, 7, 27, 0, 0, 0)
N_DAYS = 14

# Codes taken from data/seed/Ontology_Seed_Data_Labs_Diagnoses_Pharma.xlsx
# and the Rohan Sharma lab sample.
LOINC_HBA1C = "4548-4"
LOINC_FASTING_GLUCOSE = "1558-6"
LOINC_CREATININE = "2160-0"
ICD10_T2DM = "E11.9"
SNOMED_T2DM = "44054006"
RXNORM_METFORMIN = "861007"
RXNORM_INSULIN_GLARGINE = "274783"


def eag_from_hba1c(hba1c: float) -> float:
    """Average sugar in mg/dL from HbA1c, the usual clinic conversion."""
    return 28.7 * hba1c - 46.7


def assign_splits(rng: random.Random) -> dict[str, str]:
    demo = "P001"
    others = [f"P{i:03d}" for i in range(2, N_PEOPLE + 1)]
    rng.shuffle(others)
    split = {demo: "learn"}
    learn_rest = N_LEARN - 1
    for index, person_id in enumerate(others):
        if index < learn_rest:
            split[person_id] = "learn"
        elif index < learn_rest + N_TUNE:
            split[person_id] = "tune"
        else:
            split[person_id] = "test"
    return split


def build_people(rng: random.Random, splits: dict[str, str]) -> list[dict]:
    people = []
    for i in range(1, N_PEOPLE + 1):
        person_id = f"P{i:03d}"
        if person_id == "P001":
            person = {
                "person_id": person_id,
                "display_name": "Rohan Sharma",
                "is_demo": "yes",
                "age_years": 54,
                "sex": "male",
                "diabetes_type": 2,
                "years_with_diabetes": 6,
                "hba1c_percent": 8.2,
                "on_metformin": "yes",
                "metformin_dose_mg_per_day": 1000,
                "on_insulin": "no",
                "creatinine_mg_dl": 1.1,
            }
        else:
            roll = rng.random()
            if roll < 0.60:
                hba1c = round(rng.uniform(6.6, 8.0), 1)
            elif roll < 0.90:
                hba1c = round(rng.uniform(8.0, 9.5), 1)
            else:
                hba1c = round(rng.uniform(9.5, 11.0), 1)
            on_insulin = "yes" if hba1c >= 9.0 and rng.random() < 0.55 else "no"
            creatinine = round(rng.uniform(0.6, 1.2), 2)
            if rng.random() < 0.08:
                creatinine = round(rng.uniform(1.3, 1.8), 2)
            person = {
                "person_id": person_id,
                "display_name": "",
                "is_demo": "no",
                "age_years": rng.randint(35, 75),
                "sex": "female" if rng.random() < 0.48 else "male",
                "diabetes_type": 2,
                "years_with_diabetes": rng.randint(1, 20),
                "hba1c_percent": hba1c,
                "on_metformin": "yes",
                "metformin_dose_mg_per_day": 1000 if rng.random() < 0.7 else 1500,
                "on_insulin": on_insulin,
                "creatinine_mg_dl": creatinine,
            }
        person["hba1c_source"] = "lab"
        person["split"] = splits[person_id]
        person["diagnosis_name"] = "Type 2 Diabetes Mellitus"
        person["icd10_code"] = ICD10_T2DM
        person["snomed_code"] = SNOMED_T2DM
        people.append(person)
    return people


def write_clinic(people: list[dict]) -> tuple[int, int]:
    CLINIC.mkdir(parents=True, exist_ok=True)
    patient_fields = [
        "person_id",
        "display_name",
        "is_demo",
        "split",
        "age_years",
        "sex",
        "diabetes_type",
        "years_with_diabetes",
        "diagnosis_name",
        "icd10_code",
        "snomed_code",
        "hba1c_percent",
        "hba1c_source",
        "on_metformin",
        "metformin_dose_mg_per_day",
        "on_insulin",
    ]
    with (CLINIC / "patients.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=patient_fields)
        writer.writeheader()
        for person in people:
            writer.writerow({key: person[key] for key in patient_fields})

    lab_fields = [
        "person_id",
        "lab_time",
        "loinc_code",
        "test_name",
        "value",
        "unit",
        "ref_low",
        "ref_high",
    ]
    med_fields = [
        "person_id",
        "rxnorm_code",
        "drug_name",
        "dose_text",
        "frequency",
        "route",
    ]
    n_labs = 0
    n_meds = 0
    with (CLINIC / "labs.csv").open("w", newline="", encoding="utf-8") as lab_handle, (
        CLINIC / "medications.csv"
    ).open("w", newline="", encoding="utf-8") as med_handle:
        labs = csv.DictWriter(lab_handle, fieldnames=lab_fields)
        meds = csv.DictWriter(med_handle, fieldnames=med_fields)
        labs.writeheader()
        meds.writeheader()
        for person in people:
            pid = person["person_id"]
            labs.writerow(
                {
                    "person_id": pid,
                    "lab_time": "2026-08-09T08:30:00",
                    "loinc_code": LOINC_HBA1C,
                    "test_name": "Hemoglobin A1c",
                    "value": person["hba1c_percent"],
                    "unit": "%",
                    "ref_low": 4.0,
                    "ref_high": 5.6,
                }
            )
            fasting = round(eag_from_hba1c(person["hba1c_percent"]) * 0.82)
            labs.writerow(
                {
                    "person_id": pid,
                    "lab_time": "2026-08-09T08:30:00",
                    "loinc_code": LOINC_FASTING_GLUCOSE,
                    "test_name": "Fasting Glucose",
                    "value": fasting,
                    "unit": "mg/dL",
                    "ref_low": 70,
                    "ref_high": 99,
                }
            )
            labs.writerow(
                {
                    "person_id": pid,
                    "lab_time": "2026-08-09T08:30:00",
                    "loinc_code": LOINC_CREATININE,
                    "test_name": "Creatinine",
                    "value": person["creatinine_mg_dl"],
                    "unit": "mg/dL",
                    "ref_low": 0.6,
                    "ref_high": 1.3,
                }
            )
            n_labs += 3
            if person["person_id"] == "P001":
                labs.writerow(
                    {
                        "person_id": pid,
                        "lab_time": "2026-07-15T14:30:00",
                        "loinc_code": LOINC_HBA1C,
                        "test_name": "Hemoglobin A1c",
                        "value": 8.1,
                        "unit": "%",
                        "ref_low": 4.0,
                        "ref_high": 5.6,
                    }
                )
                n_labs += 1
            dose = person["metformin_dose_mg_per_day"]
            meds.writerow(
                {
                    "person_id": pid,
                    "rxnorm_code": RXNORM_METFORMIN,
                    "drug_name": "Metformin 500 MG Oral Tablet",
                    "dose_text": "500 mg",
                    "frequency": "twice daily" if dose == 1000 else "three times daily",
                    "route": "oral",
                }
            )
            n_meds += 1
            if person["on_insulin"] == "yes":
                meds.writerow(
                    {
                        "person_id": pid,
                        "rxnorm_code": RXNORM_INSULIN_GLARGINE,
                        "drug_name": "Insulin Glargine 100 UNT/ML",
                        "dose_text": "10 units",
                        "frequency": "once daily at night",
                        "route": "subcutaneous",
                    }
                )
                n_meds += 1
    return n_labs, n_meds


def day_plan(rng: random.Random, person: dict, day_index: int) -> dict:
    """Events for one day. The demo day is fixed so the screen has a story."""
    demo_day = person["person_id"] == "P001" and day_index == N_DAYS - 1
    if demo_day:
        return {
            "breakfast_min": 8 * 60 + 15,
            "breakfast_carbs": 45,
            "lunch_min": 12 * 60 + 30,
            "lunch_carbs": 95,
            "dinner_min": 20 * 60 + 15,
            "dinner_carbs": 55,
            "walk_start": None,
            "sleep_hours": 4.5,
            "dose_status": "missed",
            "hidden_snack_min": 16 * 60 + 45,
        }
    def meal(hour_lo: float, hour_hi: float, carb_lo: int, carb_hi: int, skip_p: float):
        if rng.random() < skip_p:
            return None, 0
        minute = int(rng.uniform(hour_lo, hour_hi) * 60)
        return minute, rng.randint(carb_lo, carb_hi)

    breakfast_min, breakfast_carbs = meal(7.0, 9.5, 25, 70, 0.08)
    lunch_min, lunch_carbs = meal(12.0, 14.5, 40, 110, 0.05)
    dinner_min, dinner_carbs = meal(19.5, 21.5, 35, 100, 0.08)
    walk_start = None
    if rng.random() < 0.55:
        walk_start = int(rng.uniform(16.0, 18.5) * 60)
    sleep_hours = round(rng.uniform(4.5, 8.5), 1)
    roll = rng.random()
    if roll < 0.78:
        dose_status = "taken"
    elif roll < 0.93:
        dose_status = "missed"
    else:
        dose_status = "unknown"
    hidden = int(rng.uniform(15.0, 18.0) * 60) if rng.random() < 0.28 else None
    return {
        "breakfast_min": breakfast_min,
        "breakfast_carbs": breakfast_carbs,
        "lunch_min": lunch_min,
        "lunch_carbs": lunch_carbs,
        "dinner_min": dinner_min,
        "dinner_carbs": dinner_carbs,
        "walk_start": walk_start,
        "sleep_hours": sleep_hours,
        "dose_status": dose_status,
        "hidden_snack_min": hidden,
    }


def bump(minutes_since: float, height: float, width: float = 150.0) -> float:
    if minutes_since < 0 or minutes_since > width:
        return 0.0
    if minutes_since <= 50:
        shape = minutes_since / 50.0
    else:
        shape = 1.0 - (minutes_since - 50.0) / (width - 50.0)
    return height * max(shape, 0.0)


def simulate_person(person: dict, writer: csv.DictWriter) -> dict:
    rng = random.Random(f"{SEED}-{person['person_id']}")
    fasting = eag_from_hba1c(person["hba1c_percent"]) * 0.82
    insulin_damp = 0.72 if person["on_insulin"] == "yes" else 1.0
    readings = 0
    at_or_above_180 = 0
    windows = 0
    spike_windows = 0
    # Keep a short future buffer so we can mark 2-hour spike windows.
    series: list[tuple[datetime, int]] = []
    rows: list[dict] = []

    for day_index in range(N_DAYS):
        plan = day_plan(rng, person, day_index)
        day_start = START + timedelta(days=day_index)
        dose = plan["dose_status"]
        # Unknown is generated as a coin flip so the column is not a perfect clue.
        taken_effect = dose == "taken" or (dose == "unknown" and rng.random() < 0.5)
        miss_boost = 1.0 if taken_effect else 1.4
        sleep_penalty = 18.0 if plan["sleep_hours"] < 5.5 else 0.0
        logged_meals = [
            (plan["breakfast_min"], plan["breakfast_carbs"]),
            (plan["lunch_min"], plan["lunch_carbs"]),
            (plan["dinner_min"], plan["dinner_carbs"]),
        ]

        for step in range(0, 24 * 60, INTERVAL_MINUTES):
            moment = day_start + timedelta(minutes=step)
            hour = step / 60.0
            circadian = 8.0 * math.sin((hour - 8.0) / 24.0 * 2 * math.pi)
            dawn = 12.0 * math.exp(-((hour - 6.5) ** 2) / 4.0)
            value = fasting + circadian + dawn
            if 6.0 <= hour <= 12.0:
                value += sleep_penalty
            if not taken_effect:
                value += 12.0

            meal_carbs = ""
            for meal_min, carbs in logged_meals:
                if meal_min is None:
                    continue
                since = step - meal_min
                if 0 <= since < INTERVAL_MINUTES:
                    meal_carbs = carbs
                value += bump(since, carbs * 0.85 * miss_boost * insulin_damp, 180)

            if plan["hidden_snack_min"] is not None:
                value += bump(step - plan["hidden_snack_min"], 42 * miss_boost, 140)

            if plan["walk_start"] is not None:
                since_walk = step - plan["walk_start"]
                if 0 <= since_walk <= 75:
                    value -= 22.0 * (1.0 - since_walk / 90.0)

            value += rng.gauss(0, 7.0)
            glucose = int(round(min(360, max(55, value))))

            if plan["walk_start"] is not None and 0 <= step - plan["walk_start"] < 45:
                steps = rng.randint(700, 1400)
            elif 7.0 <= hour <= 21.0:
                steps = rng.randint(20, 280)
            else:
                steps = rng.randint(0, 30)
            if person["person_id"] == "P001" and day_index == N_DAYS - 1 and 12 <= hour <= 16:
                steps = rng.randint(0, 40)

            heart = int(round(min(140, max(52, 66 + steps / 40.0 + rng.gauss(0, 3)))))
            rows.append(
                {
                    "moment": moment,
                    "glucose": glucose,
                    "meal_carbs": meal_carbs,
                    "steps": steps,
                    "heart": heart,
                    "sleep": plan["sleep_hours"],
                    "dose": dose,
                }
            )
            series.append((moment, glucose))

    # Label is not written into the wearable file. Count it only for the manifest.
    for index, (moment, glucose) in enumerate(series):
        readings += 1
        if glucose >= 180:
            at_or_above_180 += 1
        future = [g for t, g in series[index : index + 9] if t <= moment + timedelta(hours=2)]
        if series[index + 8 : index + 9] and (series[min(index + 8, len(series) - 1)][0] - moment) >= timedelta(hours=1, minutes=45):
            windows += 1
            if any(g >= 180 for g in future):
                spike_windows += 1

    for row in rows:
        moment = row["moment"]
        writer.writerow(
            {
                "person_id": person["person_id"],
                "reading_time": moment.strftime("%Y-%m-%dT%H:%M:%S"),
                "glucose_mg_dl": row["glucose"],
                "meal_carbs_g": row["meal_carbs"],
                "steps_in_this_interval": row["steps"],
                "heart_rate_bpm": row["heart"],
                "sleep_hours_last_night": row["sleep"],
                "morning_dose_status": row["dose"],
            }
        )
    return {
        "readings": readings,
        "share_at_or_above_180": round(at_or_above_180 / readings, 3),
        "spike_window_rate": round(spike_windows / windows, 3) if windows else None,
    }


def main() -> None:
    rng = random.Random(SEED)
    splits = assign_splits(rng)
    people = build_people(rng, splits)
    n_labs, n_meds = write_clinic(people)
    WEAR.mkdir(parents=True, exist_ok=True)
    fields = [
        "person_id",
        "reading_time",
        "glucose_mg_dl",
        "meal_carbs_g",
        "steps_in_this_interval",
        "heart_rate_bpm",
        "sleep_hours_last_night",
        "morning_dose_status",
    ]
    stats = []
    with (WEAR / "readings.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for person in people:
            stats.append({"person_id": person["person_id"], "split": person["split"], **simulate_person(person, writer)})

    by_split: dict[str, int] = {"learn": 0, "tune": 0, "test": 0}
    for person in people:
        by_split[person["split"]] += 1
    readings = sum(item["readings"] for item in stats)
    manifest = {
        "kind": "synthetic",
        "not_real_patients": True,
        "generator": "scripts/generate_digital_twin_data.py",
        "synthea_used": False,
        "reason_synthea_not_used": "Synthea builds clinic charts. It does not build a sugar reading every 15 minutes.",
        "seed": SEED,
        "people": N_PEOPLE,
        "days_each": N_DAYS,
        "interval_minutes": INTERVAL_MINUTES,
        "window": {"start": START.isoformat(), "days": N_DAYS},
        "split_people": by_split,
        "clinic_rows": {"patients": N_PEOPLE, "labs": n_labs, "medications": n_meds},
        "wearable_rows": readings,
        "demo_person_id": "P001",
        "demo_day": "2026-08-09",
        "codes_from": "data/seed/Ontology_Seed_Data_Labs_Diagnoses_Pharma.xlsx and data/samples JSON",
        "columns_for_the_model_later": [
            "age_years",
            "sex",
            "years_with_diabetes",
            "hba1c_percent",
            "on_metformin",
            "metformin_dose_mg_per_day",
            "on_insulin",
            "glucose_now and summaries of the last two hours",
            "minutes_since_meal",
            "meal_carbs_g",
            "steps_last_2h",
            "sleep_hours_last_night",
            "morning_dose_status",
            "hour_of_day",
        ],
        "do_not_train_on": ["heart_rate_bpm until a test shows it helps", "creatinine", "display_name"],
        "hidden_events": "Some sugar rises have no meal_carbs_g. That is intentional.",
        "mean_spike_window_rate": round(
            sum(item["spike_window_rate"] for item in stats) / len(stats), 3
        ),
    }
    (OUT / "generation_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
