# Metabolic Digital Twin Platform
## Dimension 3: Simulation Fidelity & Dimension 4: Software Architecture & APIs

This document serves as the technical specification and clinical validation record for **Dimension 3 (Digital Twin Simulation Fidelity)** and **Dimension 4 (Software Architecture & APIs)** of the **Type 2 Diabetes Metabolic Digital Twin Platform** submitted to the **Happiest Health Digital Twin Challenge 2026** (Bengaluru Summit, Nov 20, 2026).

---

## Part 1: Dimension 3 — Digital Twin Simulation Fidelity

### 1.1 In-Silico Counterfactual "What-If" Paradigm
Traditional glycemic forecasting tools merely project passive future trajectories without offering actionable metabolic levers. The Metabolic Digital Twin implements an **in-silico counterfactual simulation engine** that models the human body's biophysical response to acute lifestyle, dietary, and pharmacotherapeutic interventions.

```
       [ Current Patient State ]
        (Demographics, Labs, CGM)
                  │
                  ▼
      [ ML Trajectory Regressor ]
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
 [ Unmanaged Baseline ]   [ In-Silico Intervention Branches ]
 (Projected Spike: 212)    ├─ 20-min Brisk Walk (GLUT4 Uptake)  ──> Sim Peak: 168 mg/dL (Spike Averted)
                           ├─ 35g Carb Reduction (Gut Kinetics) ──> Sim Peak: 174 mg/dL (Spike Averted)
                           ├─ Food Sequencing (Gastric Delay)   ──> Sim Peak: 178 mg/dL (Spike Averted)
                           ├─ Compound Synergy (Walk + Cut)     ──> Sim Peak: 154 mg/dL (Spike Averted)
                           └─ Metformin Adherence (Hepatic EGP) ──> Sim Peak: 194 mg/dL (Attenuated)
```

---

### 1.2 Mechanistic Biophysical Equations & Kinetics

#### A. Acute Physical Activity: Skeletal Muscle GLUT4 Translocation
Contraction of large skeletal muscle groups during aerobic ambulation (e.g., 20-minute postprandial brisk walk) triggers 5'-AMP-activated protein kinase (AMPK) phosphorylation, causing insulin-independent translocation of glucose transporter type 4 (GLUT4) vesicles to the plasma membrane.

$$\Delta G_{\text{exercise}}(t) = M \cdot f_{\text{BMI}} \cdot \left(1 - e^{-(t - t_0)/\tau_{\text{onset}}}\right) \cdot e^{-\max(0, t - t_0 - D)/\tau_{\text{decay}}}$$

Where:
* $t_0 = 10\text{ min}$ (ambulation start delay).
* $\tau_{\text{onset}} = 25.0\text{ min}$ (intracellular signaling and capillary recruitment time constant).
* $\tau_{\text{decay}} = 40.0\text{ min}$ (post-exercise GLUT4 membrane internalization half-life).
* $D$: Exercise duration (e.g., 20 min).
* $M = 36.0 \cdot (D / 20.0) \cdot I$: Nominal excursion blunting magnitude ($I = 1.25$ for brisk intensity).
* $f_{\text{BMI}} = \frac{1}{1 + 0.015 \cdot \max(0, \text{BMI} - 25.0)}$: Patient-specific adiposity attenuation factor.

#### B. Dietary Modification: 2-Compartment Gut Absorption Kinetics (Hovorka Model)
Postprandial glucose appearance from meal carbohydrates follows a two-compartment gastrointestinal transit model:

$$R_a(t) = D_{\text{carbs}} \cdot k_{\text{abs}} \cdot \left(\frac{t}{\tau_{\text{gut}}}\right) e^{1 - t/\tau_{\text{gut}}}$$

When meal carbohydrates are reduced by $\Delta D$ grams:
$$\Delta G_{\text{carb}}(t) = \Delta D \cdot 0.95 \cdot \left(\frac{t}{\tau_{\text{gut}}}\right) e^{1 - t/\tau_{\text{gut}}}$$
Where $\tau_{\text{gut}} = 40.0\text{ min}$ represents the peak gastric emptying and jejunal glucose appearance horizon.

#### C. Food Sequencing: Gastric Emptying Delay & Incretin Effect
Consuming dietary fiber and protein 10–15 minutes prior to carbohydrates delays gastric emptying rate and enhances GLP-1/GIP incretin secretion without caloric reduction (Shukla et al., *Diabetes Care*):
* Absorption time constant prolongs from $\tau_{\text{gut}} = 40\text{ min}$ to $\tau_{\text{gut}} = 65\text{ min}$.
* Flattens the acute absorption surge, lowering the peak excursion by $24.0 \text{ mg/dL} \cdot f_{\text{C-peptide}}$.
* Modulated by endogenous beta-cell reserve: $f_{\text{C-peptide}} = \min(1.25, \max(0.75, \text{C-peptide} / 0.55))$.

#### D. Metformin Pharmacodynamics: Hepatic Endogenous Glucose Production (EGP) Suppression
Metformin suppresses complex I of the mitochondrial respiratory chain, lowering intracellular ATP/AMP ratios and downregulating PEPCK and G6Pase gluconeogenic transcription:
$$\Delta G_{\text{metformin}}(t) = S_{\text{EGP}} \cdot \left(1 - e^{-t/\tau_{\text{met}}}\right)$$
Where $S_{\text{EGP}} = 18.0\text{ mg/dL}$ (for 500–1000 mg dose) and $\tau_{\text{met}} = 30.0\text{ min}$.

#### E. Multi-Target Compound Lifestyle Synergy
Simultaneously attenuates gastrointestinal absorption appearance $R_a(t)$ and accelerates peripheral muscle disposal $R_d(t)$, yielding superadditive blunting of postprandial glycemic excursions.

---

### 1.3 Quantitative Glycemic Metrics & Clinical Safety Guardrails

Every simulated counterfactual branch automatically calculates:
1. **Peak Excursion Reduction ($\Delta G_{\max}$):** Difference between baseline and simulated maximum glucose.
2. **Continuous 2-Hour Area Under the Curve ($\Delta \text{AUC}_{2\text{h}}$):** Computed via numerical trapezoidal integration across forward horizons:
   $$\text{AUC}_{2\text{h}} = \int_{15}^{120} G(t)\,dt = \sum_{i=1}^{7} \frac{G(t_i) + G(t_{i+1})}{2} (t_{i+1} - t_i)$$
3. **Time-in-Range (TIR 70–180 mg/dL %):** Percentage of the forward 2-hour window maintained within the international consensus target ambulatory range.
4. **Calibrated Incident Risk Reduction ($\Delta P(\text{Spike})$):** Decrease in the Isotonic calibrated risk probability.
5. **Clarke Error Grid Clinical Safety Verification:**
   * Automatic hypoglycemia guardrail: Any trajectory point dipping below $70\text{ mg/dL}$ triggers `hypoglycemia_risk_warning = True`.
   * Physiological clamping floor: Clamped to $70\text{ mg/dL}$ (or $60\text{ mg/dL}$ for insulin) to eliminate non-physiological negative values.
   * Safety classification:
     * **Zone A (Safe):** All points $\ge 70\text{ mg/dL}$, zero risk of hypoglycemia.
     * **Zone B (Benign):** Glucose between $54\text{ and }70\text{ mg/dL}$, transient borderline dip.
     * **Zone C/D/E (Unsafe):** Any point $< 54\text{ mg/dL}$, severe hypoglycemia warning.

---

## Part 2: Dimension 4 — Software Architecture & APIs

### 2.1 Microservice Architecture Topology

```
                                  [ Web UI / Clinician Portal ]
                                                │
                                    (REST / HTTP / JSON)
                                                ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ FastAPI Digital Twin Microservice (Port 8004)                                                  │
│                                                                                                 │
│  ┌───────────────────────┐   ┌───────────────────────┐   ┌───────────────────────────────────┐  │
│  │ Dual-Head ML Engine   │   │ In-Silico Simulator   │   │ HL7 FHIR R4 Mappers               │  │
│  │  - XGBClassifier      │   │  - GLUT4 Kinetics     │   │  - Observation (LOINC 15074-8)    │  │
│  │  - IsotonicCalibrator │   │  - Hovorka Gut Model  │   │  - RiskAssessment (SNOMED 440540) │  │
│  │  - TrajectoryRegressor│   │  - Hepatic EGP        │   │  - CarePlan (In-Silico Actions)   │  │
│  │  - TreeSHAP Explainer │   │  - Safety Guardrails  │   │  - FHIR Transaction Bundle        │  │
│  └───────────────────────┘   └───────────────────────┘   └───────────────────────────────────┘  │
│                                           │                                                     │
│                                           ▼                                                     │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Patient Telemetry Data Layer (Shanghai T2DM Real Cohort: 100 Patients, 112k CGM Readings) │  │
│  └───────────────────────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 2.2 Complete RESTful API Catalog

| Method | Route | Description | Input / Parameters | Response Schema |
|---|---|---|---|---|
| `GET` | `/health` | Service health status, model registry, loaded cohort size | None | Health status, loaded models, threshold |
| `GET` | `/api/v1/twin/patients` | Virtual patient registry | `split`: learn / tune / test (optional) | Array of 100 patient profiles |
| `GET` | `/api/v1/twin/patients/{id}` | Patient profile with baseline labs and active medications | `id`: string (e.g. `P001`) | Patient record + labs + meds |
| `GET` | `/api/v1/twin/patients/{id}/readings` | Continuous 15-minute sensor telemetry | `id`: string, `limit`: integer (default 96) | Array of CGM telemetry entries |
| `POST` | `/api/v1/twin/predict` | Live dual-head ML inference + TreeSHAP explainability | `ClinicalFeatures` (24 variables) | `PredictionResponse` |
| `POST` | `/api/v1/twin/simulate` | In-silico counterfactual simulation across candidate interventions | `SimulationRequest` (features + interventions) | `SimulationResponse` |
| `POST` | `/api/v1/twin/simulate/{id}` | Automated in-silico simulation targeting cohort patient | `id`: string (e.g. `P001`) | `SimulationResponse` |
| `GET` | `/api/v1/twin/fhir/bundle/{id}` | HL7 FHIR R4 Collection Bundle | `id`: string (e.g. `P001`) | FHIR R4 Bundle (Observation, Risk, CarePlan) |
| `GET` | `/api/v1/twin/metrics` | Model performance validation & benchmark metrics | None | Full benchmark suite JSON |

---

### 2.3 HL7 FHIR R4 Interoperability Mappings

#### 1. FHIR `Observation` Resource
* **Coding:** LOINC `15074-8` (*Glucose [Mass/volume] in Interstitial fluid*).
* **Category:** Vital Signs (`vital-signs`).
* **Unit:** `mg/dL` (`http://unitsofmeasure.org`).
* **Reference Range:** $70.0 - 180.0\text{ mg/dL}$ (*Target Ambulatory Glucose Range*).
* **Device:** Abbott FreeStyle Libre Continuous Glucose Monitoring System.

#### 2. FHIR `RiskAssessment` Resource
* **Condition:** SNOMED CT `44054006` (*Acute postprandial hyperglycemic excursion $\ge 180\text{ mg/dL}$*).
* **Outcome:** SNOMED CT `267036007` (*Acute Hyperglycemia Excursion*).
* **Prediction:** Probability decimal (Isotonic calibrated) + Qualitative Risk tier (`calm`, `watch`, `high`).
* **Rationale:** Mathematical TreeSHAP risk drivers serialized into plain clinical language.

#### 3. FHIR `CarePlan` Resource
* **Intent:** `plan`. Status: `active`.
* **Title:** Metabolic Digital Twin Proactive Glycemic Management Plan.
* **Goal:** Maintain postprandial interstitial glucose below 180 mg/dL target without hypoglycemia.
* **Activities:** Structured `CommunicationRequest` objects detailing simulated peak drops, AUC percentage reductions, target TIR improvements, and biophysical mechanism descriptions.

---

### 2.4 Containerization & Production Deployment

* **Dockerfile:** Multi-stage Python 3.12-slim container with OpenMP runtime libraries (`libgomp1`, `build-essential`) for accelerated XGBoost and TreeSHAP inference.
* **Docker Compose:** Configured as `digital-twin` service in `docker-compose.yml` exposing port `8004`, mounting read-only cohort data volumes, and running automated container healthchecks.
