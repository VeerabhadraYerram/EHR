"""Evaluate frozen predictions without training or inventing external outcomes.

CSV: patient_id, decision_time, outcome (0/1), probability (0..1).
Optional subgroup columns: sex, age_group, site. Bootstrap unit is the patient.
"""

import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.metrics import (
    roc_auc_score,
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
)


def scores(frame, threshold):
    y = frame.outcome.to_numpy(dtype=int)
    p = frame.probability.to_numpy(dtype=float)
    tn, fp, fn, tp = confusion_matrix(y, p >= threshold, labels=[0, 1]).ravel()
    return {
        "rows": len(y),
        "patients": int(frame.patient_id.nunique()),
        "events": int(y.sum()),
        "roc_auc": float(roc_auc_score(y, p)) if len(set(y)) > 1 else None,
        "average_precision": float(average_precision_score(y, p)) if y.sum() else None,
        "brier": float(brier_score_loss(y, p)),
        "sensitivity": float(tp / (tp + fn)) if tp + fn else None,
        "specificity": float(tn / (tn + fp)) if tn + fp else None,
        "precision": float(tp / (tp + fp)) if tp + fp else None,
        "alerts_per_100_decisions": float((tp + fp) / len(y) * 100),
        "confusion": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
    }


def evaluate(frame, threshold, bootstrap=200):
    needed = {"patient_id", "decision_time", "outcome", "probability"}
    if not needed.issubset(frame.columns):
        raise ValueError(
            "Missing required columns: " + str(sorted(needed - set(frame.columns)))
        )
    if frame.empty or frame[list(needed)].isna().any().any():
        raise ValueError("Empty or missing required observations")
    if not frame.outcome.isin([0, 1]).all():
        raise ValueError("Outcome must be observed binary 0/1 labels")
    if (
        not np.isfinite(frame.probability).all()
        or not frame.probability.between(0, 1).all()
    ):
        raise ValueError("Probability must be finite and between 0 and 1")
    if not 0 < threshold < 1:
        raise ValueError("Use a frozen threshold between 0 and 1")
    pd.to_datetime(frame.decision_time, errors="raise")
    if frame.duplicated(["patient_id", "decision_time"]).any():
        raise ValueError("Duplicate patient/decision rows would bias evaluation")
    result = scores(frame, threshold)
    result["threshold"] = threshold
    calibration = []
    for index in range(10):
        low = index / 10
        high = (index + 1) / 10 if index < 9 else 1.01
        group = frame[(frame.probability >= low) & (frame.probability < high)]
        if len(group):
            calibration.append(
                {
                    "lower": round(float(low), 1),
                    "n": len(group),
                    "mean_probability": float(group.probability.mean()),
                    "observed_rate": float(group.outcome.mean()),
                }
            )
    result["calibration"] = calibration
    result["subgroups"] = {}
    for column in ("sex", "age_group", "site"):
        if column in frame:
            result["subgroups"][column] = {
                str(name): (
                    scores(group, threshold)
                    if len(group) >= 10 and group.patient_id.nunique() >= 3
                    else {
                        "rows": len(group),
                        "suppressed": "Too few observations/patients for subgroup estimates",
                    }
                )
                for name, group in frame.groupby(column)
            }
    rng = np.random.default_rng(2026)
    ids = frame.patient_id.unique()
    sampled = []
    groups = {pid: frame[frame.patient_id == pid] for pid in ids}
    if len(ids) >= 3:
        for _ in range(bootstrap):
            sample = pd.concat(
                [groups[pid] for pid in rng.choice(ids, len(ids), replace=True)],
                ignore_index=True,
            )
            sampled.append(scores(sample, threshold))
    result["patient_bootstrap_95_ci"] = {}
    for metric in (
        "roc_auc",
        "average_precision",
        "brier",
        "sensitivity",
        "specificity",
        "precision",
    ):
        values = [r[metric] for r in sampled if r[metric] is not None]
        if values:
            result["patient_bootstrap_95_ci"][metric] = [
                float(np.percentile(values, 2.5)),
                float(np.percentile(values, 97.5)),
            ]
    result["evaluation_limits"] = (
        "Uses supplied frozen predictions and observed labels; does not establish prospective benefit, Indian generalizability, causality or independence of supplied data. Repeated windows remain correlated; bootstrap resamples patients."
    )
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--predictions", type=Path, required=True)
    p.add_argument("--manifest", type=Path, required=True)
    p.add_argument("--threshold", type=float, required=True)
    p.add_argument("--output", type=Path, required=True)
    args = p.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf8"))
    required = {
        "cohort_kind",
        "source",
        "model_sha256",
        "endpoint_definition",
        "outcome_ascertainment",
        "independence_statement",
    }
    if not required.issubset(manifest) or any(not manifest[k] for k in required):
        raise ValueError("Manifest requires: " + ", ".join(sorted(required)))
    if manifest["cohort_kind"] not in (
        "synthetic-demo",
        "external-retrospective",
        "silent-prospective",
    ):
        raise ValueError("Unknown cohort kind")
    result = evaluate(pd.read_csv(args.predictions), args.threshold)
    result.update(
        manifest=manifest,
        predictions_sha256=hashlib.sha256(args.predictions.read_bytes()).hexdigest(),
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(result, indent=2, allow_nan=False), encoding="utf8"
    )
    print(
        f'Wrote {args.output}; cohort type: {manifest["cohort_kind"]}. No training performed.'
    )


if __name__ == "__main__":
    main()
