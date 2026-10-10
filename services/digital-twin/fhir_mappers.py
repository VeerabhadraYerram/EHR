"""HL7 FHIR R4 Mappers for Digital Twin Predictions, RiskAssessments, and CarePlans."""

from __future__ import annotations

from datetime import datetime
try:
    from .models import PredictionResponse, SimulationResponse
except ImportError:
    from models import PredictionResponse, SimulationResponse


def to_fhir_observation(prediction: PredictionResponse) -> Dict[str, Any]:
    """Convert instantaneous interstitial glucose reading to FHIR R4 Observation."""
    pid = prediction.person_id or "P001"
    return {
        "resourceType": "Observation",
        "id": f"cgm-obs-{pid}-{int(datetime.now().timestamp())}",
        "status": "final",
        "category": [
            {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                        "code": "vital-signs",
                        "display": "Vital Signs",
                    }
                ]
            }
        ],
        "code": {
            "coding": [
                {
                    "system": "http://loinc.org",
                    "code": "15074-8",
                    "display": "Glucose [Mass/volume] in Interstitial fluid",
                }
            ],
            "text": "Continuous Glucose Monitor Interstitial Reading",
        },
        "subject": {"reference": f"Patient/{pid}"},
        "effectiveDateTime": prediction.decision_time,
        "valueQuantity": {
            "value": prediction.glucose_now_mg_dl,
            "unit": "mg/dL",
            "system": "http://unitsofmeasure.org",
            "code": "mg/dL",
        },
        "referenceRange": [
            {
                "low": {"value": 70.0, "unit": "mg/dL"},
                "high": {"value": 180.0, "unit": "mg/dL"},
                "type": {"text": "Target Ambulatory Glucose Range"},
            }
        ],
        "device": {
            "display": "Abbott FreeStyle Libre Continuous Glucose Monitoring System"
        },
    }


def to_fhir_risk_assessment(prediction: PredictionResponse) -> Dict[str, Any]:
    """Convert calibrated incident spike prediction to FHIR R4 RiskAssessment resource."""
    pid = prediction.person_id or "P001"

    # Compile TreeSHAP rationale
    shap_text = "; ".join([d.clinical_explanation for d in prediction.top_shap_drivers])

    return {
        "resourceType": "RiskAssessment",
        "id": f"risk-assess-{pid}-{int(datetime.now().timestamp())}",
        "status": "final",
        "subject": {"reference": f"Patient/{pid}"},
        "occurrenceDateTime": prediction.decision_time,
        "condition": {
            "coding": [
                {
                    "system": "http://snomed.info/sct",
                    "code": "44054006",
                    "display": "Acute postprandial hyperglycemic excursion >= 180 mg/dL",
                }
            ]
        },
        "prediction": [
            {
                "outcome": {
                    "coding": [
                        {
                            "system": "http://snomed.info/sct",
                            "code": "267036007",
                            "display": "Acute Hyperglycemia Excursion",
                        }
                    ]
                },
                "probabilityDecimal": prediction.calibrated_spike_probability,
                "qualitativeRisk": {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/risk-probability",
                            "code": prediction.risk_tier.lower(),
                            "display": f"{prediction.risk_tier} Risk",
                        }
                    ]
                },
                "whenPeriod": {
                    "start": prediction.decision_time,
                    "end": prediction.decision_time,  # spans 2h forward
                },
                "rationale": f"Digital Twin TreeSHAP Drivers: {shap_text}",
            }
        ],
        "mitigation": "Initiate non-insulin mediated glucose disposal (15-min brisk walk) or verify morning pharmacotherapy.",
    }


def to_fhir_care_plan(simulation: SimulationResponse) -> Dict[str, Any]:
    """Convert in-silico simulation recommendations to FHIR R4 CarePlan resource."""
    pid = simulation.person_id
    activities = []

    for branch in simulation.counterfactual_branches:
        activities.append(
            {
                "detail": {
                    "kind": "CommunicationRequest",
                    "description": (
                        f"In-Silico Simulation [{branch.intervention_label}]: "
                        f"Projected peak {branch.baseline_peak_mg_dl:.1f} -> {branch.simulated_peak_mg_dl:.1f} mg/dL "
                        f"(-{branch.peak_reduction_mg_dl:.1f} mg/dL, Risk reduced by {branch.risk_reduction_percentage_points:.1f}%). "
                        f"AUC2h drop: {branch.auc_reduction_percent:.1f}%, Target TIR: {branch.simulated_tir_percent:.0f}%. "
                        f"Spike Averted: {branch.spike_averted}. Mechanism: {branch.biophysical_mechanism}"
                    ),
                    "status": "scheduled" if branch.spike_averted else "in-progress",
                    "doNotPerform": False,
                }
            }
        )

    return {
        "resourceType": "CarePlan",
        "id": f"careplan-twin-{pid}-{int(datetime.now().timestamp())}",
        "status": "active",
        "intent": "plan",
        "title": "Metabolic Digital Twin Proactive Glycemic Management Plan",
        "description": simulation.optimal_recommended_action,
        "subject": {"reference": f"Patient/{pid}"},
        "created": simulation.decision_time,
        "goal": [
            {
                "description": {
                    "text": "Maintain postprandial interstitial glucose below 180 mg/dL target without hypoglycemia"
                }
            }
        ],
        "activity": activities,
    }
