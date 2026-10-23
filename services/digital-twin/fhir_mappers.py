"""HL7 FHIR R4 Mappers for Digital Twin Predictions, RiskAssessments, and CarePlans."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict
try:
    from .models import PredictionResponse, SimulationResponse
except ImportError:
    from models import PredictionResponse, SimulationResponse


def _fhir_time(value: str) -> str:
    dt = datetime.fromisoformat(value)
    # Source records do not encode timezone; preserve them as a date-only FHIR
    # value rather than inventing a UTC offset. Exact original recorded time is
    # retained in the prediction report and Provenance entity.
    return dt.isoformat() if dt.tzinfo else dt.date().isoformat()


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
        "code": {"text": "Interstitial glucose concentration by continuous glucose monitoring"},
        "subject": {"reference": f"Patient/{pid}"},
        "effectiveDateTime": _fhir_time(prediction.decision_time),
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
            "display": "Research-derived demonstration CGM replay; not a live connected device"
        },
    }


def to_fhir_risk_assessment(prediction: PredictionResponse) -> Dict[str, Any]:
    """Convert calibrated incident spike prediction to FHIR R4 RiskAssessment resource."""
    pid = prediction.person_id or "P001"

    if not prediction.model_applicable:
        # A current high reading is an observed state, not a validated incident
        # forecast. Export no numerical/qualitative incident risk or SHAP rationale.
        return {
            "resourceType": "RiskAssessment",
            "id": f"risk-assess-{pid}-{int(datetime.now().timestamp())}",
            "status": "cancelled",
            "subject": {"reference": f"Patient/{pid}"},
            "occurrenceDateTime": _fhir_time(prediction.decision_time),
            "code": {"text": "Incident hyperglycemia forecast not applicable: baseline outside training domain"},
            "note": [{"text": (
                f"At recorded local time {prediction.decision_time}, glucose was already "
                f"{prediction.glucose_now_mg_dl:.1f} mg/dL (ongoing hyperglycemia). "
                "The incident model was trained only at baselines below 180 mg/dL. "
                "No validated incident probability, risk tier, model explanation or counterfactual treatment estimate is exported. "
                "Review the observed reading and patient context with a qualified clinician. Source timezone unspecified."
            )}],
        }

    # Compile TreeSHAP rationale
    shap_text = "; ".join([d.clinical_explanation for d in prediction.top_shap_drivers])

    return {
        "resourceType": "RiskAssessment",
        "id": f"risk-assess-{pid}-{int(datetime.now().timestamp())}",
        "status": "final",
        "subject": {"reference": f"Patient/{pid}"},
        "occurrenceDateTime": _fhir_time(prediction.decision_time),
        "prediction": [
            {
                "outcome": {"text": "Glucose >=180 mg/dL within two hours from a below-threshold baseline"},
                "probabilityDecimal": prediction.calibrated_spike_probability,
                "qualitativeRisk": {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/risk-probability",
                            "code": {"CALM": "low", "WATCH": "moderate", "HIGH": "high"}[prediction.risk_tier],
                            "display": f"{prediction.risk_tier} Risk",
                        }
                    ]
                },
                "rationale": f"Recorded local evaluation time {prediction.decision_time}; forecast horizon 120 minutes. Event status: {prediction.event_status}; model applicable: {prediction.model_applicable}. No timezone supplied by source. Digital Twin TreeSHAP Drivers: {shap_text}",
            }
        ],
        "mitigation": "Research decision support only. Review with a qualified clinician; no autonomous treatment recommendation.",
    }


def to_fhir_care_plan(simulation: SimulationResponse) -> Dict[str, Any]:
    """Convert in-silico simulation recommendations to FHIR R4 CarePlan resource."""
    pid = simulation.person_id
    if not simulation.baseline.model_applicable:
        return {
            "resourceType": "CarePlan", "id": f"careplan-twin-{pid}-{int(datetime.now().timestamp())}",
            "status": "draft", "intent": "proposal",
            "title": "Clinician review of an observed elevated glucose reading",
            "description": "Baseline is outside the incident model training domain. No model-based intervention comparison or treatment recommendation is exported. Review observed glucose and the clinical context with a qualified clinician.",
            "subject": {"reference": f"Patient/{pid}"},
            "created": _fhir_time(simulation.decision_time),
        }
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
                    "status": "not-started",
                    "doNotPerform": False,
                }
            }
        )

    return {
        "resourceType": "CarePlan",
        "id": f"careplan-twin-{pid}-{int(datetime.now().timestamp())}",
        "status": "draft",
        "intent": "proposal",
        "title": "Metabolic Digital Twin Proactive Glycemic Management Plan",
        "description": simulation.optimal_recommended_action,
        "subject": {"reference": f"Patient/{pid}"},
        "created": _fhir_time(simulation.decision_time),
        "activity": activities,
    }


def to_fhir_patient(patient: dict) -> dict:
    return {"resourceType": "Patient", "id": patient["person_id"], "active": True,
            "identifier": [{"system": "urn:ehr:demo-cohort", "value": patient["person_id"]}],
            "name": [{"use": "anonymous", "text": patient["display_name"]}],
            "gender": patient["sex"] if patient["sex"] in ["male", "female", "other", "unknown"] else "unknown"}


def to_fhir_provenance(prediction: PredictionResponse, resources: list) -> dict:
    return {"resourceType": "Provenance", "id": f"twin-provenance-{prediction.person_id}",
            "target": [{"reference": f"{r['resourceType']}/{r['id']}"} for r in resources],
            "recorded": datetime.now(timezone.utc).isoformat(),
            "activity": {"text": "Research digital twin model inference; clinician approval pending"},
            "agent": [{"who": {"display": "Metabolic Digital Twin research service"}}],
            "entity": [{"role": "source", "what": {"display": f"Research-derived demonstration cohort and recorded CGM replay at local source time {prediction.decision_time}; timezone unspecified"}}]}


def validate_bundle(bundle: dict) -> dict:
    """Local structural and reference checks, never represented as official IG validation."""
    errors = []
    if bundle.get('resourceType') != 'Bundle' or bundle.get('type') != 'collection':
        errors.append('Expected a collection Bundle.')
    resources = [entry.get('resource', {}) for entry in bundle.get('entry', [])]
    references = {f"{r.get('resourceType')}/{r.get('id')}" for r in resources}
    required = {'Patient': ['id', 'identifier'], 'Observation': ['id', 'status', 'code', 'subject', 'valueQuantity'],
                'RiskAssessment': ['id', 'status', 'subject'],
                'CarePlan': ['id', 'status', 'intent', 'subject'],
                'Provenance': ['id', 'target', 'recorded', 'agent']}
    for resource in resources:
        kind = resource.get('resourceType')
        if kind not in required:
            errors.append(f'Unsupported resource type: {kind}')
            continue
        for field in required[kind]:
            if field not in resource:
                errors.append(f'{kind} missing {field}')
        for ref in ([resource['subject']] if 'subject' in resource else []) + resource.get('target', []):
            if ref.get('reference') not in references:
                errors.append(f'Unresolved internal reference: {ref.get("reference")}')
        if kind == 'Observation':
            quantity = resource.get('valueQuantity', {})
            if quantity.get('code') != 'mg/dL' or quantity.get('system') != 'http://unitsofmeasure.org':
                errors.append('Observation glucose quantity must use UCUM mg/dL.')
        if kind == 'RiskAssessment':
            if resource.get('status') == 'cancelled' and (resource.get('prediction') or not resource.get('note')):
                errors.append('Cancelled out-of-domain risk assessment must provide a narrative and no incident predictions.')
            if resource.get('status') != 'cancelled' and not resource.get('prediction'):
                errors.append('Applicable risk assessment must contain a prediction.')
            for prediction in resource.get('prediction', []):
                value = prediction.get('probabilityDecimal')
                if value is not None and (not isinstance(value, (int, float)) or not 0 <= value <= 1):
                    errors.append('RiskAssessment probability must be within [0,1].')
        if kind == 'CarePlan' and (resource.get('status') != 'draft' or resource.get('intent') != 'proposal'):
            errors.append('Unapproved research CarePlan must remain a draft proposal.')
    if bundle.get('total') != len(resources):
        errors.append('Bundle total does not match entry count.')
    if not any(r.get('resourceType') == 'Patient' for r in resources):
        errors.append('Bundle must include its referenced Patient.')
    issues = [{'severity': 'error', 'code': 'structure', 'diagnostics': e} for e in errors]
    issues.append({'severity': 'warning', 'code': 'informational', 'diagnostics': 'Local required-field and reference checks only. Official HL7 FHIR R4 validator and implementation-guide validation have not run. Export is a draft for clinician review; persistence is disabled.'})
    return {'resourceType': 'OperationOutcome', 'issue': issues}
