"""Transparent cohort-neighbour baseline, not learned treatment recommendation."""

import csv
import math
from pathlib import Path
from ehr_security import assigned

ROOT = Path(__file__).resolve().parents[2]
FIELDS = {
    "age_years": ("Age", 15),
    "bmi": ("BMI", 6),
    "hba1c_percent": ("HbA1c", 2),
    "fasting_c_peptide_nmol_l": ("C-peptide", 0.5),
    "egfr": ("eGFR", 30),
}


def similar_profiles(patient_id, limit=5):
    with (ROOT / "data/digital_twin/clinic/patients.csv").open(encoding="utf8") as f:
        rows = list(csv.DictReader(f))
    target = next((r for r in rows if r["person_id"] == patient_id), None)
    if not target:
        raise LookupError("Unknown profile")
    results = []
    for row in rows:
        if row["person_id"] == patient_id or not assigned(row["person_id"]):
            continue
        differences = []
        distance = 0
        for field, (label, scale) in FIELDS.items():
            a, b = float(target[field]), float(row[field])
            delta = b - a
            distance += (delta / scale) ** 2
            differences.append(
                {
                    "feature": field,
                    "label": label,
                    "target": a,
                    "candidate": b,
                    "difference": round(delta, 3),
                    "normalizing_scale": scale,
                }
            )
        distance = math.sqrt(distance / len(FIELDS))
        results.append(
            {
                "patient_id": row["person_id"],
                "distance": round(distance, 4),
                "differences": differences,
                "diagnosis": row.get("diagnosis_name"),
                "source": "Research-derived synthetic demonstration cohort",
                "outcome_available": False,
            }
        )
    return {
        "patient_id": patient_id,
        "method": "Root-mean-square standardized clinical distance v1; fixed documented scales, not an embedding model",
        "cases": sorted(results, key=lambda r: r["distance"])[:limit],
        "limitations": "Similar cohort profiles only. No historical treatment outcomes or treatment efficacy are available. Not a recommendation to copy treatment.",
    }
