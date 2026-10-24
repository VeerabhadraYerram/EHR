import pandas as pd
import pytest
from scripts.validate_external_cohort import evaluate


def fixture():
    return pd.DataFrame(
        [
            {
                "patient_id": f"P{i//2}",
                "decision_time": f"2026-01-01T0{i%2}:00:00",
                "outcome": i % 2,
                "probability": 0.8 if i % 2 else 0.2,
                "sex": "demo",
            }
            for i in range(12)
        ]
    )


def test_observed_metrics_and_patient_bootstrap():
    result = evaluate(fixture(), 0.5, bootstrap=10)
    assert result["roc_auc"] == 1 and result["brier"] == pytest.approx(0.04)
    assert result["patients"] == 6 and result["confusion"] == {
        "tn": 6,
        "fp": 0,
        "fn": 0,
        "tp": 6,
    }
    assert result["patient_bootstrap_95_ci"]["roc_auc"] == [1, 1]


@pytest.mark.parametrize("invalid", ["duplicate", "probability", "label"])
def test_invalid_evaluation_data_rejected(invalid):
    frame = fixture()
    if invalid == "duplicate":
        frame = pd.concat([frame, frame.iloc[:1]])
    if invalid == "probability":
        frame.loc[0, "probability"] = 1.5
    if invalid == "label":
        frame.loc[0, "outcome"] = 2
    with pytest.raises(ValueError):
        evaluate(frame, 0.5, bootstrap=2)
