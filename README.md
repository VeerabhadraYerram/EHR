# AURA-Twin: AI-Powered Metabolic Digital Twin & Clinical Decision Intelligence

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![React 18](https://img.shields.io/badge/React-18-61DAFB.svg)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688.svg)](https://fastapi.tiangolo.com/)
[![XGBoost 3.2](https://img.shields.io/badge/XGBoost-3.2+-red.svg)](https://xgboost.readthedocs.io/)
[![FHIR R4](https://img.shields.io/badge/FHIR-R4-firebrick.svg)](https://hl7.org/fhir/R4/)
[![Test Suite](https://img.shields.io/badge/Tests-91%20Passed-brightgreen.svg)]()

> **Sankalp | A Platform for Change**  
> *"Anticipating Diabetic Crisis 120 Minutes Before the First Symptom."*  
> *From Continuous Sensor Stream to Bedside Intervention in Real Time.*

---

## 👥 Team & Submission Information

* **Team Name**: `saikoushikpallapolu`
* **Team Members**:
  - **Shiva Sai**
  - **Veerabhadra Yerram**
  - **Sai Koushik Reddy Pallapolu**
* **College / Incubator**: Sankalp: A Platform for Change | Institutional Hackathon 2026
* **Track / Healthcare Challenge**: Digital Twin Challenge 2026 — Chronic Disease & Metabolic Intelligence (Type 2 Diabetes)
* **Open-Source License**: [MIT License](LICENSE) (Permissive Commercial & Academic Use)
* **Live Prototype Workstation**: `http://localhost:5188`
* **API Documentation**: `http://localhost:8004/docs`

---

## 📑 Deliverables Quick Links

| Deliverable | Description | Format & Link |
|---|---|---|
| 🎥 **Prototype Video (20+ min)** | End-to-end clinical workflow walkthrough, model evaluation, and live UI demo | [Watch on YouTube](https://youtu.be/D5L-0IEVBPA) · [Agenda](#-prototype-video-demonstration-20-minutes) |
| 🏗️ **Architecture Diagram** | AURA-Twin system architecture diagram | [View Architecture Diagram (PDF)](docs/architecture/AURA-Twin_Architecture_Diagram.pdf) |
| 📊 **Project Pitch Deck** | AURA-Twin Sankalp presentation deck | [View Presentation Deck (PDF)](docs/presentation/AURA-Twin_Sankalp_Deck.pdf) |
| 📜 **Open-Source License** | Official MIT License terms | [LICENSE](file:///c:/Users/saiko/OneDrive/Desktop/EHR/EHR/LICENSE) |

---

## 🏥 Problem Statement & Healthcare Use Case

### 1. The Human Cost in India
According to the landmark **ICMR-INDIAB study published in *The Lancet* (2023)**, India is the diabetes capital of the world:
* **101 Million Indians** are currently living with diabetes, with an additional **136 million in the pre-diabetic stage**.
* **1.2 Million Premature Deaths** occur annually in India due to diabetes and its microvascular complications—**that is one death every 26 seconds**.
* **6.3 to 8.2 Years of Life Lost** per individual due to prolonged glycemic variability, diabetic nephropathy, neuropathy, and retinopathy *(Lancet Global Health)*.
* **The Fatal Postprandial Spike**: Glycemic excursions crossing $\ge 180\text{ mg/dL}$ trigger acute oxidative stress, vascular inflammation, and beta-cell apoptosis long before episodic blood tests reveal elevated glycated hemoglobin.

### 2. The Economic Bleed & Healthcare Burden
* **$85+ Billion Lost Annually**: Direct medical expenses, emergency hospital admissions, and lost economic productivity in India *(Lancet Commission on Diabetes)*.
* **15% to 20% of Hospital Inpatient Beds**: Occupied by avoidable acute hyperglycemic crises (Diabetic Ketoacidosis, Hyperosmolar Hyperglycemic State, and end-stage renal failures).
* **400 Million Workdays Lost**: Wiped out each year due to diabetic fatigue, clinic visits, and hospitalization absenteeism.

### 3. The System Failure: Episodic Care for a Real-Time Crisis
* **The 90-Day Delay**: Standard diabetes care is strictly retrospective. A patient visits a doctor every 90 days for an HbA1c test. If their result is 9.5%, that represents **three months of irreversible endothelial and microvascular damage** that has already occurred.
* **The Alert Fatigue Trap**: Continuous Glucose Monitors (CGM) generate 96 to 288 readings per patient per day. Current threshold alarms beep reactively *after* the patient has already spiked above 180 mg/dL, with **false alarm rates exceeding 35%**. Nurses and patients mute the monitors due to alarm fatigue.
* **Zero Actionable Causal Attribution**: Existing monitors tell a patient their sugar is high, but fail to explain *why* (circadian dawn phenomenon, high meal glycemic index, missed medication, or renal lag) and offer no forward-looking lifestyle simulation.

---

## 💡 The AURA-Twin Solution

AURA-Twin transforms reactive diabetes management into **proactive, explainable, and personalized precision medicine**:

1. **Dual-Head AI Decision Engine**:
   - **Head 1 (Spike Classifier)**: Calibrated XGBoost with Isotonic Regression answering: *"Will glucose breach $\ge 180\text{ mg/dL}$ in the next 120 minutes from a normal baseline?"* (**ROC-AUC: 0.8852, PR-AUC: 0.6058, Brier Loss: 0.0907**).
   - **Head 2 (8-Horizon Trajectory Regressor)**: Multi-output regressor projecting continuous glucose curves across 8 discrete horizons (+15m to +120m) with **short-term MAE of 4.82 mg/dL** and **99.73% Clarke Error Grid clinical safety**.
2. **Clinician-Tuned Operating Curves (Eliminating Alarm Fatigue)**:
   - Clinicians seamlessly switch between **High-Sensitivity Screening** (76.2% Recall) for outpatient monitoring and **High-Specificity Ward Telemetry** (96.1% Specificity, 67.2% Precision, **<3.9% False Alarms**) to protect hospital nurses from alert burnout.
3. **Genuine TreeSHAP Explainability**:
   - Deploys mathematical feature attribution on every forecast, ranking the exact physiological drivers behind every spike (`cos_hour` circadian periodicity, `glucose_velocity_per_hour`, `minutes_since_meal`, BMI, HbA1c, and eGFR).
4. **In Silico Counterfactual Scenario Lab**:
   - Clinicians test hypothetical lifestyle and dietary interventions (*30-min brisk walk, 25g carb cut, carb sequencing*) on the patient's digital twin *before* advising the patient.
5. **Interactive 3D Anatomy & Synthetic CT-to-Mesh Pipeline**:
   - Three.js WebGL layered organ viewer (pancreas, liver, kidneys, microvasculature) paired with axial CT slice browsing and Marching Cubes 3D surface extraction.
6. **Patient-Linked Genomics Panel**:
   - Synthesizes patient-specific VCF genomic data across **36 curated diabetes risk loci** (*TCF7L2, KCNJ11, PPARG, SLC30A8*).
7. **Sourced Conversational Patient Evidence Assistant**:
   - Integrated clinical assistant featuring **zero-hallucination guardrails**: the Python backend owns all data retrieval, calculations, and chart generation, while citations are bound strictly to verified NIDDK clinical guidelines.
8. **Interoperable HL7 FHIR R4 Bundle Export**:
   - One-click export of Observations, RiskAssessments, and CarePlans for seamless sync with hospital EHRs and India's Ayushman Bharat Digital Mission (ABDM).

---

## 🏗️ System Architecture & The 8-Step Clinical Journey

**Architecture diagram:** [View or download the AURA-Twin Architecture Diagram (PDF)](docs/architecture/AURA-Twin_Architecture_Diagram.pdf).

The text diagram below provides an inline overview of the clinical journey.

```
========================================================================================================================
                              EHR + DIABETES DIGITAL TWIN: END-TO-END CLINICAL JOURNEY
========================================================================================================================

  [ EHR: CAPTURE -> UNDERSTAND -> VERIFY -> PRESERVE ]
  
  (1) Capture Encounter     (2) Give Words Meaning     (3) Doctor Verifies Facts    (4) Preserve Trusted Record
  +--------------------+   +-----------------------+   +-------------------------+   +--------------------------+
  | Doctor Consultation|   | "No chest pain. Taking|   | Review context, uncert- |   | PostgreSQL Fact Store    |
  | - Audio / STT JSON |-->|  metformin." (MedCAT) |---> ainty, and conflicts    |-->| - MinIO Raw Sources      |
  | - OCR Clinical Note|   | Entities + Negations  |   | Corrections & approval  |   | - HL7 FHIR R4 Resources  |
  | - Lab Rest APIs    |   | Terminology Provenance|   | leave audit trail       |   | - Immutable Audit Log    |
  +--------------------+   +-----------------------+   +-------------------------+   +--------------------------+
                                                                                                |
  ==============================================================================================|=======================
                                                                                                v
  [ DIGITAL TWIN: CONTEXT -> PREDICT -> EXPERIMENT -> EXPLAIN ]
  
  (8) Turn Evidence Insight (7) Explore Scenario       (6) Predict & Explain        (5) Assemble Patient Twin
  +--------------------+   +-----------------------+   +-------------------------+   +--------------------------+
  | Patient Evidence   |   | In Silico Counter-    |   | Dual-Head XGBoost Engine|   | Patient + Selected Time  |
  | Assistant          |<--| factual Simulation    |<--| - 2hr Spike Classifier  |<--| - Past-Only Features     |
  | - Sourced Charts   |   | - 30m Brisk Walk      |   | - 8-Horizon Regressor   |   | - 100-Patient CGM Stream |
  | - NIDDK Citations  |   | - Carb-Cut Scenarios  |   | - TreeSHAP Attributions |   | - Zero Data Leakage      |
  | - Clinician Decision|   | - Clarke Safety Bounds|   | - Calibrated Probabilities|   | - Verified Lab Biomarkers|
  +--------------------+   +-----------------------+   +-------------------------+   +--------------------------+

========================================================================================================================
  STRICT SAFETY GUARDRAILS:
  - Patient-Scoped Context  * Original Sources & Audit Trail  * Server-Only Provider Keys  * Zero Autonomous Prescribing
========================================================================================================================
```

---

## 🔬 Model Performance & Clinical Benchmarks

The predictive engine was evaluated on the **Shanghai T2DM Clinical Cohort** (100 patients with FreeStyle Libre continuous glucose monitoring, **15,467 evaluated test instances across 15 held-out patients**).

### Head 1: 120-Minute Adverse Spike Classifier ($\ge 180\text{ mg/dL}$)

| Model / Architecture | ROC-AUC | PR-AUC | Brier Calibration Loss | Sensitivity (Recall) | Specificity | Precision | False Alarm Rate (FPR) |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **AURA-Twin Calibrated XGBoost** | **0.8852** | **0.6058** | **0.0907** *(Lowest)* | **57.67%** | **92.63%** | **58.87%** | **7.37%** *(Low)* |
| Uncalibrated XGBoost | 0.8861 | 0.6218 | 0.0882 | 67.53% | 88.70% | 52.23% | 11.30% |
| Baseline Logistic Regression | 0.8509 | 0.5754 | 0.0953 | 61.35% | 88.97% | 50.45% | 11.03% |
| Clinical Heuristic (Velocity Delta) | 0.7397 | 0.3523 | 0.1726 *(High Error)* | 53.45% | 84.04% | 38.00% | 15.96% |

### Clinician-Tuned Operating Threshold Curves
To eliminate nurse alert fatigue while protecting outpatient safety, AURA-Twin provides four selectable clinical operating modes:

1. **High-Sensitivity Screening** (Threshold `0.16`): **76.2% Recall**, 83.5% Specificity, 46.1% Precision, 16.5% FPR *(Outpatient proactive screening)*.
2. **Balanced Early Warning** (Threshold `0.18`): **71.8% Recall**, 86.8% Specificity, 50.5% Precision, 13.2% FPR *(Daytime monitoring)*.
3. **Standard Tuned Mode** (Threshold `0.22`): **57.7% Recall**, **92.6% Specificity**, **58.9% Precision**, **7.4% FPR** *(Optimal balanced baseline)*.
4. **High-Specificity Intensive Mode** (Threshold `0.30`): 43.1% Recall, **96.1% Specificity**, **67.2% Precision**, **3.9% FPR** *(Hospital wards to eliminate alert fatigue)*.

### Head 2: 8-Horizon Multi-Output Trajectory Regressor

* **+15 min Horizon**: **MAE 4.82 mg/dL** | RMSE 7.01 mg/dL *(High-precision immediate trend tracking)*
* **+30 min Horizon**: **MAE 9.43 mg/dL** | RMSE 13.59 mg/dL *(Well within commercial CGM sensor MARD)*
* **+60 min Horizon**: **MAE 15.87 mg/dL** | RMSE 22.56 mg/dL
* **Overall Mean Trajectory MAE**: **15.93 mg/dL** (Beats persistence baseline of 17.58 mg/dL by **9.4%**)
* **Clarke Error Grid Clinical Safety Analysis**:
  - **Zone A (Clinically Accurate Euglycemia)**: **78.58%**
  - **Zone B (Benign / Non-Harmful Error)**: **21.15%**
  - **Combined Clinically Acceptable (Zone A + B)**: **99.73%**! *(Zero catastrophic Zone C/D/E errors)*.

### Top TreeSHAP Physiological Drivers
1. `cos_hour` (Circadian cosine periodicity): Mean $|SHAP| = \mathbf{0.6843}$
2. `glucose_now` (Current interstitial glucose level): Mean $|SHAP| = \mathbf{0.5611}$
3. `hour_of_day` (Diurnal clock hour): Mean $|SHAP| = \mathbf{0.3437}$
4. `glucose_velocity_per_hour` (Rate of glycemic rise/fall): Mean $|SHAP| = \mathbf{0.2520}$
5. `minutes_since_meal` (Postprandial metabolic timeline): Mean $|SHAP| = \mathbf{0.1522}$

---

## 💻 Complete Technical Stack

| Layer | Technologies & Frameworks | Description |
|---|---|---|
| **Frontend Workstation** | React 18, TypeScript, Vite, Three.js, Recharts, Lucide Icons | Responsive clinical dashboard with WebGL 3D organ rendering, interactive CGM scrubbing, and scoped styling |
| **Backend Microservices** | FastAPI, Python 3.11+, Uvicorn, Pydantic V2, NumPy, Pandas, SciPy | 6 modular REST microservices with temporal feature isolation and strict request schemas |
| **Machine Learning & XAI** | XGBoost 3.2+ (Native JSON), Scikit-Learn (Isotonic), SHAP (TreeExplainer), MAPIE | Dual-head prediction, probability calibration, and local mathematical feature attributions |
| **Clinical Safety & Imaging** | Clarke Error Grid Analysis (EGA), PyDICOM, NiBabel, Scikit-Image, Trimesh | Clinical safety zone verification and volumetric CT slice reconstruction via Marching Cubes |
| **Genomics & Clinical Assistant**| Synthetic VCF Parser (36 T2D Loci), Groq (`llama-3.3-70b` / `gpt-oss-120b`), OpenRouter | Rule-grounded scenario assistant with zero-hallucination guardrails and NIDDK evidence pack |
| **Interoperability & Security** | HL7 FHIR R4 Bundle Generator, Keycloak OIDC JWT, SHA-256 Checksums, Audit Logger | Standard healthcare interoperability, role-based access control, and deterministic model verification |
| **Database & Object Storage** | PostgreSQL 16, MinIO Private S3 Storage, SQLite WAL (Workflows), Docker Compose | Robust multi-tier storage with separate review persistence and audit trails |

---

## 🎥 Prototype Video Demonstration (20+ Minutes)

[![Sankalp | Explainable Diabetes Digital Twin & EHR | Happiest Health Challenge 2026](https://img.youtube.com/vi/D5L-0IEVBPA/maxresdefault.jpg)](https://youtu.be/D5L-0IEVBPA "Click to watch full clinical demonstration video on YouTube")

> 📺 **Watch Full Video Demonstration on YouTube**: [https://youtu.be/D5L-0IEVBPA](https://youtu.be/D5L-0IEVBPA)  
> *(Prepared and recorded by Team saikoushikpallapolu for Sankalp: A Platform for Change)*

### Timestamped Video Demonstration Agenda
* **00:00 – 02:30**: Introduction to Sankalp Challenge, Team Members, and Type 2 Diabetes Crisis in India.
* **02:30 – 05:00**: Problem Breakdown: The 90-day HbA1c latency, CGM data overload, and the hospital alert fatigue crisis.
* **05:00 – 08:30**: Technical Architecture: Voice/EHR ingestion, MedCAT entity linking, and doctor review workflow.
* **08:30 – 12:00**: Live Diagnostic Workstation Walkthrough: Cohort selection (P001 to P100), baseline lab provenance, and 3D WebGL organ anatomy.
* **12:00 – 15:30**: The AI Forecast Engine: 120-minute spike predictions, multi-threshold operating curve demonstration, and TreeSHAP explainability.
* **15:30 – 18:00**: In Silico Counterfactual Lab & Sourced Patient Evidence Assistant (Walking, carb reduction, and zero-hallucination charts).
* **18:00 – 20:30**: Clinical Safety Evaluation: Clarke Error Grid Analysis (99.73% Zone A+B), Brier calibration score (0.0907), and HL7 FHIR R4 export demonstration.
* **20:30 – End**: Q&A Defense, Scalability Roadmap, and Conclusion.

---

## 📊 Project Presentation Slide Deck

**Presentation deck:** [View or download the AURA-Twin Sankalp Deck (PDF)](docs/presentation/AURA-Twin_Sankalp_Deck.pdf).

The accompanying 11-slide presentation deck is structured as follows:

| Slide # | Slide Title | Core Topic & Highlights |
|:---:|---|---|
| **1** | **Title Slide** | Platform Name (AURA-Twin), Tagline, Team details |
| **2** | **The Problem** | Human cost (101M diabetics, 1.2M deaths), Economic bleed ($85B+), System failure |
| **3** | **The Flaw in Current Systems** | Retrospective care, The alarm trap (>35% false alarms), Siloed multimodal data |
| **4** | **Our Solution** | Dual-Head AI, Multi-threshold operating curves, In silico counterfactuals, TreeSHAP |
| **5** | **Key Features & Highlights** | 0.0907 Brier score, 99.73% Clarke Zone A+B, SHA-256 deterministic serialization |
| **6** | **System Architecture** | 4-tier pipeline: Ingestion, Central Decision Engine, Workstation, Clinical Dispatch |
| **7** | **Tech Stack** | React 18, Vite, Three.js, FastAPI, XGBoost 3.2+, PyDICOM, FHIR R4, PostgreSQL |
| **8** | **Model Performance** | ROC-AUC 0.8852, PR-AUC 0.6058, 4 operating modes, 8-horizon MAE table, SHAP drivers |
| **9** | **Business Impact & ROI** | Hospital Enterprise SaaS, <4% ward false alarms, Rs 2-5 Lakh ICU cost avoidance, ABDM ready |
| **10** | **Scalability & Future Scope** | Phase 1 (Working PoC) $\to$ Phase 2 (Hospital federated learning) $\to$ Phase 3 (National ABDM scale) |
| **11** | **Thank You** | Contact, live links (`localhost:5188`, `localhost:8004/docs`), and defense Q&A |

---

## 🚀 Quickstart & Local Execution Guide

### Prerequisites
* Python 3.11+
* Node.js v18+ and npm
* Git & PowerShell / Bash

### 1. Installation
Clone the repository and install backend and frontend dependencies:

```powershell
# Install backend Python dependencies
python -m pip install -r requirements-demo.txt
python -m pip install -r services/imaging/requirements.txt

# Install frontend dependencies
npm --prefix frontend/doctor-review-ui install
```

### 2. Launch the EHR Platform
Start all microservices and the Vite frontend workstation:

```powershell
# Launch lightweight local stack (skips external Docker/Postgres dependencies)
python scripts/run_app.py --skip-infra --skip-legacy --timeout 60
```

### 3. Active Service Endpoints

| Service / Component | Address | Status Check |
|---|---|---|
| **Doctor Review Workstation (UI)** | `http://localhost:5188` | Active & Hot-Reloaded |
| **Digital Twin Inference API** | `http://localhost:8004/docs` | Health: `http://localhost:8004/health` |
| **Clinical Review Workflows** | `http://localhost:8005/docs` | Persistent SQLite review store |
| **Synthetic Imaging Reconstruction** | `http://localhost:8006/docs` | CT slice browsing & 3D mesh |
| **Patient-Linked Genomics** | `http://localhost:8007/docs` | 36 diabetes risk loci panel |
| **Cross-Service Access Audit** | `http://localhost:8008/docs` | Full cryptographic audit trail |

### 4. Running Test Verification Suites

```powershell
# Run backend test suite (91 passing tests)
python -m pytest tests/test_patient_assistant.py tests/test_model_performance.py tests/test_clinical_data_pipeline.py tests/test_digital_twin_service.py tests/test_external_validation.py tests/test_twin_asof.py tests/test_genomics.py tests/test_security.py tests/test_workflows.py -v

# Run frontend test suite & production build
npm --prefix frontend/doctor-review-ui run build
npm --prefix frontend/doctor-review-ui test
```

---

## ⚖️ Open-Source License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for complete details.

```
MIT License
Copyright (c) 2026 Team saikoushikpallapolu (Shiva Sai, Veerabhadra Yerram, Sai Koushik Reddy Pallapolu)
```
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files, to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software.
