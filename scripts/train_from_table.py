"""Write one training table, train from that table, and export the doctor day.

The table has one row per moment. The model is fit only on rows whose split
is learn. The warning line is chosen on tune. The score is taken once on test.
The doctor screen uses the same saved model on 9 August 2026.
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from train_glucose_warning import (  # noqa: E402
    FEATURE_NAMES,
    FUTURE,
    HIGH,
    PAST,
    best_threshold,
    features_at,
    load_people,
    load_series,
    rates,
    rule_scores,
)
from sklearn.metrics import average_precision_score, roc_auc_score
from xgboost import XGBClassifier

DATA = ROOT / "data" / "digital_twin"
TABLE = DATA / "training" / "examples.csv"
MODEL_DIR = DATA / "model"
DAY = "2026-08-09"
UI_JSON = ROOT / "frontend" / "doctor-review-ui" / "public" / "digital-twin-day.json"


def write_table(people: dict, series: dict) -> int:
    TABLE.parent.mkdir(parents=True, exist_ok=True)
    fields = ["person_id", "decision_time", "split", "spike_in_next_2h", *FEATURE_NAMES]
    count = 0
    with TABLE.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(fields)
        for person_id, rows in series.items():
            person = people[person_id]
            last = len(rows) - FUTURE
            for index in range(PAST - 1, last):
                future = [
                    int(rows[index + step]["glucose_mg_dl"]) for step in range(1, FUTURE + 1)
                ]
                label = 1 if any(value >= HIGH for value in future) else 0
                feats = features_at(person, rows, index)
                writer.writerow(
                    [person_id, rows[index]["reading_time"], person["split"], label, *feats]
                )
                count += 1
    return count


def read_table() -> dict[str, tuple[np.ndarray, np.ndarray]]:
    buckets: dict[str, list] = {"learn": [], "tune": [], "test": []}
    labels: dict[str, list] = {"learn": [], "tune": [], "test": []}
    with TABLE.open(encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            split = row["split"]
            buckets[split].append([float(row[name]) for name in FEATURE_NAMES])
            labels[split].append(int(row["spike_in_next_2h"]))
    return {
        split: (
            np.asarray(buckets[split], dtype=np.float32),
            np.asarray(labels[split], dtype=np.int32),
        )
        for split in buckets
    }


def export_day(model: XGBClassifier, people: dict, series: dict, line: float, report: dict) -> None:
    patients = []
    for person_id, rows in series.items():
        person = people[person_id]
        indexes = [
            index
            for index, row in enumerate(rows)
            if row["reading_time"].startswith(DAY) and index >= PAST - 1
        ]
        if not indexes:
            continue
        matrix = np.asarray(
            [features_at(person, rows, index) for index in indexes], dtype=np.float32
        )
        probabilities = model.predict_proba(matrix)[:, 1]
        points = []
        for index, chance in zip(indexes, probabilities):
            row = rows[index]
            feat = features_at(person, rows, index)
            by_name = dict(zip(FEATURE_NAMES, feat))
            points.append(
                {
                    "t": row["reading_time"][11:16],
                    "g": int(row["glucose_mg_dl"]),
                    "steps": int(row["steps_in_this_interval"]),
                    "hr": int(row["heart_rate_bpm"]),
                    "meal": int(row["meal_carbs_g"]) if row["meal_carbs_g"] else None,
                    "sleep": float(row["sleep_hours_last_night"]),
                    "dose": row["morning_dose_status"],
                    "p": round(float(chance), 3),
                    "rise": round(float(by_name["glucose_rise_per_hour"]), 1),
                    "minutes_since_meal": int(by_name["minutes_since_meal"]),
                    "last_meal_carbs": int(by_name["last_meal_carbs_g"]),
                    "steps_2h": int(by_name["steps_last_2h"]),
                }
            )
        patients.append(
            {
                "person_id": person_id,
                "display_name": person["display_name"] or person_id,
                "is_demo": person["is_demo"],
                "age_years": int(person["age_years"]),
                "sex": person["sex"],
                "years_with_diabetes": int(person["years_with_diabetes"]),
                "hba1c_percent": float(person["hba1c_percent"]),
                "on_insulin": person["on_insulin"],
                "metformin_dose_mg_per_day": int(person["metformin_dose_mg_per_day"]),
                "split": person["split"],
                "points": points,
            }
        )
    patients.sort(key=lambda item: (item["is_demo"] != "yes", item["person_id"]))
    UI_JSON.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "day": DAY,
        "high_line": HIGH,
        "warning_line": line,
        "metrics": report["test_people_only"]["model"],
        "patients": patients,
    }
    UI_JSON.write_text(json.dumps(payload), encoding="utf-8")


def main() -> None:
    people = load_people()
    series = load_series()
    count = write_table(people, series)
    data = read_table()
    x_learn, y_learn = data["learn"]
    x_tune, y_tune = data["tune"]
    x_test, y_test = data["test"]

    pos = max(int(y_learn.sum()), 1)
    neg = max(int(len(y_learn) - pos), 1)
    model = XGBClassifier(
        n_estimators=500,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.85,
        colsample_bytree=0.85,
        min_child_weight=8,
        reg_lambda=2.0,
        objective="binary:logistic",
        eval_metric="auc",
        scale_pos_weight=neg / pos,
        early_stopping_rounds=40,
        random_state=7,
        n_jobs=4,
    )
    model.fit(x_learn, y_learn, eval_set=[(x_tune, y_tune)], verbose=False)

    tune_proba = model.predict_proba(x_tune)[:, 1]
    test_proba = model.predict_proba(x_test)[:, 1]
    line = best_threshold(y_tune, tune_proba)
    rule_line = best_threshold(y_tune, rule_scores(x_tune))

    report = {
        "trained_on": str(TABLE.relative_to(ROOT)).replace("\\", "/"),
        "table_rows": count,
        "question": "Will sugar be at or above 180 mg/dL at any reading in the next 2 hours?",
        "rows": {
            "learn": int(len(y_learn)),
            "tune": int(len(y_tune)),
            "test": int(len(y_test)),
        },
        "test_people_only": {
            "model": {
                "roc_auc": round(float(roc_auc_score(y_test, test_proba)), 3),
                "average_precision": round(float(average_precision_score(y_test, test_proba)), 3),
                **rates(y_test, test_proba, line),
            },
            "simple_rule_current_sugar": {
                "roc_auc": round(float(roc_auc_score(y_test, rule_scores(x_test))), 3),
                "average_precision": round(
                    float(average_precision_score(y_test, rule_scores(x_test))), 3
                ),
                **rates(y_test, rule_scores(x_test), rule_line),
            },
        },
        "warning_line_chosen_on_tune_people": round(line, 3),
        "trees_used": int(model.best_iteration) + 1,
    }
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    model.save_model(MODEL_DIR / "glucose_warning.json")
    (MODEL_DIR / "metrics.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    export_day(model, people, series, line, report)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
