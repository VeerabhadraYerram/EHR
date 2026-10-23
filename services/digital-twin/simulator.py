"""Biophysical & Machine Learning In-Silico Counterfactual Simulation Engine.

Simulates physiological 'What-If' metabolic interventions:
1. Postprandial Exercise / Brisk Walk: Non-insulin-mediated GLUT4 translocation.
2. Carbohydrate Attenuation: Gut absorption kinetics (Hovorka/Bergman appearance attenuation).
3. Medication Adherence / Titration: Hepatic gluconeogenesis suppression & insulin sensitivity.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Tuple
import numpy as np

try:
    from .models import (
        ClinicalFeatures,
        InterventionSpec,
        PredictionResponse,
        SimulationBranchResult,
        TrajectoryPoint,
    )
except ImportError:
    from models import (
        ClinicalFeatures,
        InterventionSpec,
        PredictionResponse,
        SimulationBranchResult,
        TrajectoryPoint,
    )

HIGH_THRESHOLD = 180.0


def compute_auc(curve: np.ndarray, horizons: List[int]) -> float:
    """Trapezoidal numerical integration compatible with NumPy 1.x and 2.x."""
    fn = getattr(np, "trapezoid", getattr(np, "trapz", None))
    if fn is not None:
        return float(fn(curve, horizons))
    total = 0.0
    for i in range(len(horizons) - 1):
        dx = float(horizons[i + 1] - horizons[i])
        total += 0.5 * float(curve[i] + curve[i + 1]) * dx
    return float(total)


class MetabolicDigitalTwinSimulator:
    """In-Silico Simulation Engine for Counterfactual Glycemic Trajectories."""

    def __init__(self, engine: Any):
        """Bind to the trained dual-head machine learning engine."""
        self.engine = engine

    def simulate_interventions(
        self,
        features: ClinicalFeatures,
        interventions: List[InterventionSpec],
        decision_time: str,
        person_id: str = "P001",
    ) -> Tuple[PredictionResponse, List[SimulationBranchResult], str]:
        """Compute baseline forecast and compare all candidate in-silico branches."""
        # 1. Evaluate unmanaged baseline
        baseline = self.engine.predict(features, decision_time=decision_time, person_id=person_id)

        branches: List[SimulationBranchResult] = []
        best_branch = None
        max_score = -1.0

        for spec in interventions:
            branch = self._simulate_single_branch(features, baseline, spec)
            branches.append(branch)

            # Preference: Spike averted without hypoglycemia, maximizing risk reduction
            if not branch.hypoglycemia_risk_warning:
                score = branch.risk_reduction_percentage_points + (25.0 if branch.spike_averted else 0.0)
                if score > max_score:
                    max_score = score
                    best_branch = branch

        # Determine optimal clinical recommendation
        if best_branch and (best_branch.spike_averted or best_branch.risk_reduction_percentage_points > 10.0):
            rec = (
                f"Illustrative scenario to discuss with a clinician: {best_branch.intervention_label}. "
                f"Reduces projected peak by {best_branch.peak_reduction_mg_dl:.1f} mg/dL "
                f"({best_branch.baseline_peak_mg_dl:.1f} -> {best_branch.simulated_peak_mg_dl:.1f} mg/dL), "
                f"improves 2h Time-in-Range to {best_branch.simulated_tir_percent:.0f}%, "
                f"and drops spike risk from {baseline.calibrated_spike_probability:.1%} to {best_branch.simulated_risk_probability:.1%}."
            )
        else:
            rec = "No modeled scenario met the illustrative comparison threshold. This does not establish clinical stability or prescribe treatment."

        return baseline, branches, rec

    def _simulate_single_branch(
        self,
        base_features: ClinicalFeatures,
        baseline: PredictionResponse,
        spec: InterventionSpec,
    ) -> SimulationBranchResult:
        """Simulate one specific intervention using personalized biophysical kinetics."""
        itype = spec.intervention_type
        params = spec.parameters

        # Extract baseline trajectory
        horizons = [p.horizon_minutes for p in baseline.continuous_trajectory]
        base_curve = np.array([p.projected_glucose_mg_dl for p in baseline.continuous_trajectory], dtype=np.float32)

        sim_curve = base_curve.copy()
        label = ""
        rationale = ""
        mechanism = ""
        risk_attenuation_factor = 1.0

        # Patient-specific physiological conditioning factors
        # 1. BMI modifier: peripheral adiposity attenuates GLUT4 translocation efficiency
        bmi_modifier = 1.0 / (1.0 + 0.015 * max(0.0, float(base_features.bmi) - 25.0))
        # 2. C-peptide modifier: endogenous beta-cell reserve modulates endogenous recovery
        cpeptide_modifier = min(1.25, max(0.75, float(base_features.fasting_c_peptide) / 0.55))

        if itype == "postprandial_walk":
            duration = float(params.get("duration_minutes", 20))
            intensity = str(params.get("intensity", "brisk")).lower()
            intensity_multiplier = 1.25 if intensity == "brisk" else 0.90

            label = f"{int(duration)}-Minute {intensity.capitalize()} Walk"
            rationale = (
                f"Acute {int(duration)}-min {intensity} ambulation stimulates non-insulin-mediated "
                f"GLUT4 muscle uptake, blunting postprandial glycemic surge."
            )
            mechanism = (
                f"Biophysical GLUT4 Translocation: Skeletal muscle contraction accelerates peripheral "
                f"glucose disposal rate Rd(t) via AMPK phosphorylation (onset tau=25m, clearance efficiency={bmi_modifier:.2f}x based on BMI)."
            )

            for idx, h in enumerate(horizons):
                tau_onset = 25.0
                tau_decay = 40.0
                magnitude = 36.0 * (duration / 20.0) * intensity_multiplier * bmi_modifier

                if h >= 10:
                    delta = h - 10
                    shape = (1.0 - math.exp(-delta / tau_onset)) * math.exp(-max(0.0, delta - duration) / tau_decay)
                    sim_curve[idx] = max(70.0, sim_curve[idx] - (magnitude * shape))

            risk_attenuation_factor = max(0.15, 1.0 - (0.032 * duration * intensity_multiplier * bmi_modifier))

        elif itype == "carb_reduction":
            carb_diff = float(params.get("carb_reduction_g", 35))
            label = f"Reduce Meal Carbs by {int(carb_diff)}g"
            rationale = (
                f"Substitutes refined starches for protein/fiber, reducing glucose appearance rate "
                f"Ra(t) by approximately {carb_diff:.0f}g carbohydrate."
            )
            mechanism = (
                f"Two-Compartment Gut Kinetics (Hovorka): Gut glucose absorption Ra(t) = (D*t/tau^2)*exp(1-t/tau). "
                f"Cutting {carb_diff:.0f}g reduces peak excursion magnitude by {carb_diff * 0.95:.1f} mg/dL."
            )

            for idx, h in enumerate(horizons):
                tau_gut = 40.0
                shape = (h / tau_gut) * math.exp(1.0 - (h / tau_gut))
                reduction = carb_diff * 0.95 * shape
                sim_curve[idx] = max(70.0, sim_curve[idx] - reduction)

            risk_attenuation_factor = max(0.20, 1.0 - (0.015 * carb_diff))

        elif itype == "food_sequencing":
            delay_mins = float(params.get("delay_carbs_minutes", 15))
            label = "Food Sequencing (Fiber & Protein First)"
            rationale = (
                f"Consuming vegetables/protein {int(delay_mins)} mins prior to carbohydrates slows gastric emptying "
                f"and stimulates incretin (GLP-1) secretion without caloric restriction."
            )
            mechanism = (
                f"Gastric Emptying Delay: assumed {delay_mins:.0f}m sequencing delay changes absorption time "
                f"constant from 40m to {40.0 + delay_mins * 5.0 / 3.0:.1f}m; "
                f"illustrative attenuation magnitude {24.0 * delay_mins / 15.0:.1f} mg/dL before reserve modifier."
            )

            for idx, h in enumerate(horizons):
                tau_delayed = 40.0 + delay_mins * 5.0 / 3.0
                shape_delayed = (h / tau_delayed) * math.exp(1.0 - (h / tau_delayed))
                # Flattens early surge
                delta_blunt = 24.0 * (delay_mins / 15.0) * shape_delayed * cpeptide_modifier
                sim_curve[idx] = max(70.0, sim_curve[idx] - delta_blunt)

            risk_attenuation_factor = max(0.15, 1.0 - delay_mins / 30.0)

        elif itype == "compound_lifestyle":
            walk_dur = float(params.get("duration_minutes", 20))
            carb_cut = float(params.get("carb_reduction_g", 25))
            label = f"Compound Intervention ({int(walk_dur)}m Walk + {int(carb_cut)}g Carb Cut)"
            rationale = (
                f"Synergistic dual lifestyle intervention: simultaneous gut absorption attenuation "
                f"and muscle GLUT4 clearance acceleration."
            )
            mechanism = (
                f"Multi-Target Metabolic Synergy: Simultaneous suppression of gut Ra(t) appearance (-{carb_cut * 0.9:.0f} mg/dL) "
                f"and enhancement of skeletal muscle disposal Rd(t) (-{32.0 * bmi_modifier:.0f} mg/dL peak)."
            )

            for idx, h in enumerate(horizons):
                # Carb effect
                shape_carb = (h / 40.0) * math.exp(1.0 - (h / 40.0))
                red_carb = carb_cut * 0.90 * shape_carb

                # Walk effect
                red_walk = 0.0
                if h >= 10:
                    delta = h - 10
                    shape_walk = (1.0 - math.exp(-delta / 25.0)) * math.exp(-max(0.0, delta - walk_dur) / 40.0)
                    red_walk = 32.0 * (walk_dur / 20.0) * bmi_modifier * shape_walk

                sim_curve[idx] = max(70.0, sim_curve[idx] - (red_carb + red_walk))

            risk_attenuation_factor = max(0.10, (1.0 - min(0.85, 0.025 * walk_dur * bmi_modifier)) * (1.0 - min(0.80, 0.015 * carb_cut)))

        elif itype == "confirm_medication":
            drug = str(params.get("drug", "metformin")).lower()
            dose = float(params.get("dose_mg", 500))
            label = f"Confirm {drug.capitalize()} ({int(dose)} mg)"
            rationale = (
                f"Restores hepatic gluconeogenesis suppression and enhances peripheral insulin "
                f"sensitivity via AMPK activation."
            )
            mechanism = (
                f"Hepatic EGP Suppression: Downregulates PEPCK/G6Pase gene transcription, reducing "
                f"endogenous glucose production outflow by 18 mg/dL over forward 2 hours."
            )

            suppression = 18.0 if dose >= 500 else 10.0
            for idx, h in enumerate(horizons):
                sim_curve[idx] = max(70.0, sim_curve[idx] - suppression * (1.0 - math.exp(-h / 30.0)))

            risk_attenuation_factor = 0.55

        elif itype == "insulin_bolus":
            units = float(params.get("units", 2.0))
            isf = float(params.get("isf_mg_dl_per_unit", 30.0))
            label = f"Correction Insulin Bolus ({units:.1f} Units)"
            rationale = (
                f"Subcutaneous rapid-acting insulin bolus with expected total drop of "
                f"{units * isf:.0f} mg/dL over a 2-hour action profile."
            )
            mechanism = (
                f"Pharmacodynamic Insulin-On-Board: Exponential subcutaneous uptake with patient-specific "
                f"ISF of {isf:.0f} mg/dL/unit."
            )

            for idx, h in enumerate(horizons):
                fraction_action = 1.0 - math.exp(-h / 45.0)
                sim_curve[idx] = max(60.0, sim_curve[idx] - (units * isf * fraction_action))

            risk_attenuation_factor = max(0.10, 1.0 - (0.35 * units))

        # Recompute peak metrics and risk
        base_peak = float(np.max(base_curve))
        sim_peak = float(np.max(sim_curve))
        peak_drop = max(0.0, base_peak - sim_peak)

        # Trapezoidal numerical integration for 2h continuous Area Under the Curve (AUC)
        base_auc = compute_auc(np.insert(base_curve, 0, base_features.glucose_now), [0] + horizons)
        sim_auc = compute_auc(np.insert(sim_curve, 0, base_features.glucose_now), [0] + horizons)
        auc_reduction_pct = max(0.0, (base_auc - sim_auc) / max(1.0, base_auc) * 100.0)

        # Time-in-Range (70 - 180 mg/dL)
        base_tir = float(np.mean((base_curve >= 70.0) & (base_curve <= HIGH_THRESHOLD)) * 100.0)
        sim_tir = float(np.mean((sim_curve >= 70.0) & (sim_curve <= HIGH_THRESHOLD)) * 100.0)

        # Hypoglycemia safety guardrails
        hypo_risk = bool(np.any(sim_curve < 70.0))
        # Clarke error grid requires paired forecast/reference observations.
        # It cannot determine the safety of an unobserved counterfactual.
        clarke_zone = None

        base_p = baseline.calibrated_spike_probability
        sim_p = float(np.clip(base_p * risk_attenuation_factor, 0.0, 1.0))
        risk_drop_pct = (base_p - sim_p) * 100.0
        spike_averted = (base_peak >= HIGH_THRESHOLD) and (sim_peak < HIGH_THRESHOLD)

        # Illustrative sensitivity envelope; not calibrated counterfactual uncertainty.
        sim_trajectory: List[TrajectoryPoint] = []
        for idx, h in enumerate(horizons):
            val = round(float(sim_curve[idx]), 1)
            sigma = 4.0 + (idx * 2.2)
            sim_trajectory.append(
                TrajectoryPoint(
                    horizon_minutes=h,
                    projected_glucose_mg_dl=val,
                    lower_bound_p10_mg_dl=round(max(40.0, val - 1.645 * sigma), 1),
                    upper_bound_p90_mg_dl=round(val + 1.645 * sigma, 1),
                )
            )

        return SimulationBranchResult(
            intervention_type=itype,
            intervention_label=label,
            baseline_peak_mg_dl=round(base_peak, 1),
            simulated_peak_mg_dl=round(sim_peak, 1),
            peak_reduction_mg_dl=round(peak_drop, 1),
            baseline_risk_probability=round(base_p, 3),
            simulated_risk_probability=round(sim_p, 3),
            risk_reduction_percentage_points=round(risk_drop_pct, 1),
            baseline_auc_mg_min_dl=round(base_auc, 1),
            simulated_auc_mg_min_dl=round(sim_auc, 1),
            auc_reduction_percent=round(auc_reduction_pct, 1),
            baseline_tir_percent=round(base_tir, 1),
            simulated_tir_percent=round(sim_tir, 1),
            spike_averted=spike_averted,
            hypoglycemia_risk_warning=hypo_risk,
            clarke_safety_zone=clarke_zone,
            simulated_trajectory=sim_trajectory,
            clinical_rationale="Assumption-based educational scenario. " + rationale + " Effects and risk multipliers are not learned causal estimates; do not change treatment based on this simulation.",
            biophysical_mechanism=mechanism,
        )
