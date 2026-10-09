"""Train the two-hour high-sugar warning and score it once.

Plan
1. Build one row per moment from the clinic file plus only the readings known
   at that moment. The answer uses the next two hours and is never an input.
2. Learn on the 70 people marked learn.
3. Choose the warning line on the 10 tune people.
4. Score the 20 test people a single time.
5. Compare with a simple rule: warn when the current sugar is already high.

People stay whole. A person in test is never used to learn or to pick the line.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

import numpy as np
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    roc_auc_score,
)
from xgboost import XGBClassifier

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "digital_twin"
OUT = DATA / "model"

FEATURE_NAMES = [
    "age_years",
    "sex_male",
    "years_with_diabetes",
    "hba1c_percent",
    "on_insulin",
    "metformin_dose_mg_per_day",
    "glucose_now",
    "glucose_mean_30min",
    "glucose_mean_2h",
    "glucose_min_2h",
    "glucose_max_2h",
    "glucose_rise_per_hour",
    "minutes_since_meal",
    "last_meal_carbs_g",
    "steps_last_2h",
    "sleep_hours_last_night",
    "dose_missed",
    "dose_unknown",
    "hour_of_day",
]
HIGH = 180
PAST = 8
FUTURE = 8


def load_people() -> dict[str, dict]:
    people = {}
    with (DATA / "clinic" / "patients.csv").open(encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            people[row["person_id"]] = row
    return people


def load_series() -> dict[str, list[dict]]:
    series: dict[str, list[dict]] = {}
    with (DATA / "wearables" / "readings.csv").open(encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            series.setdefault(row["person_id"], []).append(row)
    for rows in series.values():
        rows.sort(key=lambda item: item["reading_time"])
    return series


def features_at(person: dict, rows: list[dict], index: int) -> list[float]:
    window = rows[index - PAST + 1 : index + 1]
    glucose = [int(item["glucose_mg_dl"]) for item in window]
    now = glucose[-1]
    last_30 = glucose[-2:]
    rise = (now - glucose[0]) / 2.0
    steps = sum(int(item["steps_in_this_interval"]) for item in window)
    minutes_since = -1.0
    last_carbs = 0.0
    for back in range(0, min(index + 1, 96)):
        carbs = rows[index - back]["meal_carbs_g"]
        if carbs:
            minutes_since = float(back * 15)
            last_carbs = float(carbs)
            break
    dose = rows[index]["morning_dose_status"]
    hour = int(rows[index]["reading_time"][11:13])
    return [
        float(person["age_years"]),
        1.0 if person["sex"] == "male" else 0.0,
        float(person["years_with_diabetes"]),
        float(person["hba1c_percent"]),
        1.0 if person["on_insulin"] == "yes" else 0.0,
        float(person["metformin_dose_mg_per_day"]),
        float(now),
        float(np.mean(last_30)),
        float(np.mean(glucose)),
        float(min(glucose)),
        float(max(glucose)),
        float(rise),
        minutes_since,
        last_carbs,
        float(steps),
        float(rows[index]["sleep_hours_last_night"]),
        1.0 if dose == "missed" else 0.0,
        1.0 if dose == "unknown" else 0.0,
        float(hour),
    ]


def build_examples(people: dict[str, dict], series: dict[str, list[dict]]):
    buckets = {name: [] for name in ("learn", "tune", "test")}
    labels = {name: [] for name in ("learn", "tune", "test")}
    for person_id, rows in series.items():
        person = people[person_id]
        split = person["split"]
        for index in range(PAST - 1, len(rows) - FUTURE):
            future = [int(rows[index + step]["glucose_mg_dl"]) for step in range(1, FUTURE + 1)]
            buckets[split].append(features_at(person, rows, index))
            labels[split].append(1 if any(value >= HIGH for value in future) else 0)
    arrays = {}
    for split in buckets:
        arrays[split] = (np.asarray(buckets[split], dtype=np.float32), np.asarray(labels[split], dtype=np.int32))
    return arrays


def rates(y_true: np.ndarray, proba: np.ndarray, threshold: float) -> dict:
    pred = (proba >= threshold).astype(np.int32)
    tn, fp, fn, tp = confusion_matrix(y_true, pred, labels=[0, 1]).ravel()
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
    fpr = fp / (fp + tn) if (fp + tn) else 0.0
    return {
        "threshold": round(float(threshold), 3),
        "warnings_in_time_share": round(float(recall), 3),
        "precision": round(float(precision), 3),
        "f1": round(float(f1), 3),
        "false_alarm_share": round(float(fpr), 3),
        "true_warnings": int(tp),
        "missed_spikes": int(fn),
        "false_alarms": int(fp),
        "quiet_and_correct": int(tn),
    }


def best_threshold(y_true: np.ndarray, proba: np.ndarray) -> float:
    best_line = 0.5
    best_f1 = -1.0
    for line in np.linspace(0.15, 0.85, 71):
        score = rates(y_true, proba, float(line))["f1"]
        if score > best_f1:
            best_f1 = score
            best_line = float(line)
    return best_line


def rule_scores(x: np.ndarray) -> np.ndarray:
    """Higher current sugar means a higher chance of crossing 180."""
    glucose_now = x[:, FEATURE_NAMES.index("glucose_now")]
    return np.clip((glucose_now - 110.0) / 90.0, 0.0, 1.0)


def main() -> None:
    people = load_people()
    series = load_series()
    splits_seen = {row["split"] for row in people.values()}
    if splits_seen != {"learn", "tune", "test"}:
        raise SystemExit(f"Unexpected splits: {splits_seen}")
    data = build_examples(people, series)
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

    rule_tune = rule_scores(x_tune)
    rule_test = rule_scores(x_test)
    rule_line = best_threshold(y_tune, rule_tune)

    gain = model.get_booster().get_score(importance_type="gain")
    order = sorted(gain.items(), key=lambda item: item[1], reverse=True)
    top = []
    for key, value in order[:8]:
        feature_index = int(key[1:])
        top.append({"feature": FEATURE_NAMES[feature_index], "gain": round(float(value), 1)})

    report = {
        "question": "Will sugar be at or above 180 mg/dL at any reading in the next 2 hours?",
        "rows": {
            "learn": int(len(y_learn)),
            "tune": int(len(y_tune)),
            "test": int(len(y_test)),
        },
        "spike_share": {
            "learn": round(float(y_learn.mean()), 3),
            "tune": round(float(y_tune.mean()), 3),
            "test": round(float(y_test.mean()), 3),
        },
        "test_people_only": {
            "model": {
                "roc_auc": round(float(roc_auc_score(y_test, test_proba)), 3),
                "average_precision": round(float(average_precision_score(y_test, test_proba)), 3),
                **rates(y_test, test_proba, line),
            },
            "simple_rule_current_sugar": {
                "roc_auc": round(float(roc_auc_score(y_test, rule_test)), 3),
                "average_precision": round(float(average_precision_score(y_test, rule_test)), 3),
                **rates(y_test, rule_test, rule_line),
            },
        },
        "warning_line_chosen_on_tune_people": round(line, 3),
        "trees_used": int(model.best_iteration) + 1,
        "top_features": top,
        "note": "Scored once on the 20 people marked test. Threshold chosen only on the tune people.",
    }
    OUT.mkdir(parents=True, exist_ok=True)
    model.save_model(OUT / "glucose_warning.json")
    (OUT / "metrics.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    (OUT / "feature_names.json").write_text(json.dumps(FEATURE_NAMES, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
