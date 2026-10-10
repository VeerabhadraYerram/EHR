# Digital Twin Clinical Cohort: Data Dictionary & Ontology Specifications

This document defines the data architecture, clinical ontologies, physiological variables, and transformation rules for the **Type 2 Diabetes Digital Twin Clinical Cohort**.

---

## 1. Clinical Data Provenance & Study Design

* **Dataset Origin:** Shanghai Clinical Center for Endocrine and Metabolic Diseases / Nature Scientific Data.
* **Identifier / DOI:** [`10.6084/m9.figshare.20444397`](https://doi.org/10.6084/m9.figshare.20444397)
* **Cohort Population:** 100+ adult patients diagnosed with Type 2 Diabetes Mellitus (T2DM) undergoing real-world outpatient continuous glucose telemetry.
* **Sensor Hardware:** Abbott FreeStyle Libre Continuous Glucose Monitoring (CGM) system (interstitial fluid glucose enzyme sensor, factory-calibrated, 15-minute interval logging).
* **Demographics & Biochemistry:** Complete institutional EHR extraction including baseline demographics, duration of diabetes, baseline HbA1c, fasting/postprandial glucose, fasting/postprandial C-peptide, lipid panel, and renal function.
* **Naturalistic Telemetry:** Ambulatory continuous time-series logging across 14 consecutive days including naturalistic meal records (with food items and gram portions) and subcutaneous insulin administration.

---

## 2. Standardized Clinical Ontologies

| Domain | Coding Standard | Standard Code | Clinical Concept Display |
| :--- | :--- | :--- | :--- |
| **Primary Diagnosis** | SNOMED CT | `44054006` | Type 2 diabetes mellitus |
| **Primary Diagnosis** | ICD-10-CM | `E11.9` | Type 2 diabetes mellitus without complications |
| **Laboratory: HbA1c** | LOINC | `4548-4` | Hemoglobin A1c/Hemoglobin.total in Blood |
| **Laboratory: Fasting Glucose** | LOINC | `1558-6` | Fasting glucose [Mass/volume] in Serum or Plasma |
| **Laboratory: 2h Postprandial Glucose** | LOINC | `14771-0` | Glucose 2 hours post meal [Mass/volume] in Serum or Plasma |
| **Laboratory: Fasting C-Peptide** | LOINC | `1986-9` | C-peptide [Moles/volume] in Serum or Plasma (Fasting) |
| **Laboratory: 2h Postprandial C-Peptide**| LOINC | `1987-7` | C-peptide 2 hours post meal [Moles/volume] in Serum or Plasma |
| **Laboratory: Creatinine** | LOINC | `2160-0` | Creatinine [Mass/volume] in Serum or Plasma |
| **Laboratory: eGFR** | LOINC | `33914-3` | Glomerular filtration rate/1.73 sq M.predicted [Volume Rate] |
| **Laboratory: Total Cholesterol** | LOINC | `2093-3` | Cholesterol [Mass/volume] in Serum or Plasma |
| **Laboratory: Triglycerides** | LOINC | `2571-8` | Triglyceride [Mass/volume] in Serum or Plasma |
| **Laboratory: HDL Cholesterol** | LOINC | `2085-9` | Cholesterol in HDL [Mass/volume] in Serum or Plasma |
| **Laboratory: LDL Cholesterol** | LOINC | `13457-7` | Cholesterol in LDL [Mass/volume] in Serum or Plasma |
| **Telemetry: CGM Glucose** | LOINC | `15074-8` | Glucose [Mass/volume] in Interstitial fluid |
| **Medication: Metformin** | RxNorm | `861007` | Metformin hydrochloride 500 MG Oral Tablet |
| **Medication: Insulin Glargine** | RxNorm | `274783` | Insulin glargine 100 UNT/ML Injectable Solution |
| **Medication: Insulin Aspart** | RxNorm | `285018` | Insulin aspart 100 UNT/ML Injectable Solution |
| **Medication: Insulin Degludec** | RxNorm | `1373458` | Insulin degludec 100 UNT/ML Injectable Solution |
| **Medication: Acarbose** | RxNorm | `161` | Acarbose 50 MG Oral Tablet |
| **Medication: Sitagliptin** | RxNorm | `63639` | Sitagliptin 100 MG Oral Tablet |
| **Medication: Empagliflozin** | RxNorm | `1545653` | Empagliflozin 10 MG Oral Tablet |

---

## 3. Dataset Schemas & Variable Definitions

### 3.1 Patients Table (`clinic/patients.csv`)
* `person_id` *(string, PK)*: Unique de-identified patient identifier (`P001` through `P100`).
* `source_patient_id` *(string)*: De-identified clinical study identifier (`2015_0_20210203`, etc.).
* `display_name` *(string)*: Pseudonym for presentation (`Rohan Sharma` for flagship demo case `P001`).
* `is_demo` *(string)*: `'yes'` for `P001`, `'no'` for all others.
* `split` *(string)*: Patient-level partition allocation (`learn`, `tune`, or `test`).
* `age_years` *(integer)*: Age in years at time of sensor placement.
* `sex` *(string)*: Biological sex (`male` or `female`).
* `bmi` *(float)*: Body Mass Index in $\text{kg/m}^2$.
* `diabetes_type` *(integer)*: Classification (`2` for Type 2 Diabetes).
* `years_with_diabetes` *(float)*: Elapsed years since formal clinical diagnosis.
* `diagnosis_name` *(string)*: Descriptive diagnosis name.
* `icd10_code` *(string)*: ICD-10 diagnostic code (`E11.9`).
* `snomed_code` *(string)*: SNOMED CT diagnostic concept (`44054006`).
* `hba1c_percent` *(float)*: Standard DCCT/NGSP glycated hemoglobin percentage ($\%$, standard normal $<5.7\%$, diabetic target $<7.0\%$).
* `hba1c_ifcc_mmol_mol` *(float)*: IFCC standardized glycated hemoglobin ($\text{mmol/mol}$).
* `fasting_glucose_mg_dl` *(float)*: Baseline fasting plasma glucose ($\text{mg/dL}$).
* `postprandial_glucose_mg_dl` *(float)*: Baseline 2-hour postprandial glucose ($\text{mg/dL}$).
* `fasting_c_peptide_nmol_l` *(float)*: Fasting serum C-peptide ($\text{nmol/L}$, direct clinical proxy for endogenous beta-cell insulin secretion reserve).
* `postprandial_c_peptide_nmol_l` *(float)*: 2-hour postprandial serum C-peptide ($\text{nmol/L}$).
* `creatinine_mg_dl` *(float)*: Serum creatinine standardized to $\text{mg/dL}$ ($\mu\text{mol/L} / 88.42$).
* `egfr` *(float)*: Estimated Glomerular Filtration Rate ($\text{mL/min/1.73m}^2$).
* `total_cholesterol_mg_dl` *(float)*: Total serum cholesterol standardized to $\text{mg/dL}$ ($\text{mmol/L} \times 38.67$).
* `triglycerides_mg_dl` *(float)*: Serum triglycerides standardized to $\text{mg/dL}$ ($\text{mmol/L} \times 88.57$).
* `hdl_mg_dl` *(float)*: High-density lipoprotein cholesterol ($\text{mg/dL}$).
* `ldl_mg_dl` *(float)*: Low-density lipoprotein cholesterol ($\text{mg/dL}$).
* `on_metformin` *(string)*: Active metformin therapy (`yes` / `no`).
* `on_insulin` *(string)*: Active exogenous insulin therapy (`yes` / `no`).
* `on_acarbose` *(string)*: Active alpha-glucosidase inhibitor therapy (`yes` / `no`).
* `on_dpp4` *(string)*: Active dipeptidyl peptidase-4 inhibitor therapy (`yes` / `no`).
* `on_sglt2` *(string)*: Active sodium-glucose cotransporter-2 inhibitor therapy (`yes` / `no`).
* `hypoglycemic_agents_raw` *(string)*: Complete unparsed medication regimen.
* `comorbidities` *(string)*: Secondary clinical diagnoses (hypertension, CAD, fatty liver, etc.).

---

### 3.2 Wearables & Telemetry Table (`wearables/readings.csv`)
* `person_id` *(string, FK)*: Foreign key reference to patient.
* `reading_time` *(string)*: ISO 8601 timestamp (`YYYY-MM-DDTHH:MM:SS`).
* `glucose_mg_dl` *(float)*: Interstitial continuous glucose reading from FreeStyle Libre sensor ($\text{mg/dL}$).
* `meal_carbs_g` *(float or empty)*: Estimated carbohydrate grams consumed at this timestamp.
* `meal_description` *(string)*: Naturalistic food log items and portions.
* `insulin_units` *(float or empty)*: Subcutaneous insulin dosage administered.
* `minutes_since_meal` *(float)*: Elapsed minutes since most recent logged meal ($-1.0$ if none in past 6 hours).
* `last_meal_carbs_g` *(float)*: Carbohydrate mass of the most recent meal event.

---

### 3.3 Training Examples Table (`training/examples.csv`)
Each row represents a decision point $t$ evaluating whether a patient currently in an acceptable range will experience an acute incident excursion.

#### Incident Spike Criterion:
$$\text{Inclusion Filter: } G(t) < 180\text{ mg/dL}$$
$$\text{Target Label } y \in \{0, 1\}: y = 1 \iff \exists k \in \{1,\dots,8\} \text{ such that } G(t + 15k\text{ min}) \ge 180\text{ mg/dL}$$

#### Features:
1. **Patient Demographics & Clinical Baseline:**
   * `age_years` *(int)*: Patient age.
   * `sex_male` *(float)*: Binary flag ($1.0$ if male, $0.0$ if female).
   * `bmi` *(float)*: Body mass index.
   * `years_with_diabetes` *(float)*: Disease duration.
   * `hba1c_percent` *(float)*: Baseline glycated hemoglobin.
   * `fasting_c_peptide` *(float)*: Endogenous insulin reserve.
   * `creatinine_mg_dl` *(float)*: Renal clearance marker.
   * `egfr` *(float)*: Estimated GFR.
   * `on_metformin` *(float)*: Active metformin prescription ($1.0$ or $0.0$).
   * `on_insulin` *(float)*: Active insulin therapy ($1.0$ or $0.0$).
2. **Dynamic Glycemic Status (Past 2 Hours):**
   * `glucose_now` *(float)*: Instantaneous sensor glucose $G(t)$.
   * `glucose_mean_30min` *(float)*: Mean glucose over past 30 minutes ($t-30\text{m}$ to $t$).
   * `glucose_mean_2h` *(float)*: Mean glucose over past 2 hours ($t-120\text{m}$ to $t$).
   * `glucose_min_2h` *(float)*: Minimum glucose over past 2 hours.
   * `glucose_max_2h` *(float)*: Maximum glucose over past 2 hours.
   * `glucose_std_2h` *(float)*: Standard deviation of glucose over past 2 hours (glycemic variability).
   * `glucose_velocity_per_hour` *(float)*: Rate of glycemic change $\frac{dG}{dt} = \frac{G(t) - G(t-30\text{m})}{0.5\text{ h}}$ in $\text{mg/dL/hr}$.
   * `glucose_acceleration` *(float)*: Second derivative of glucose $\frac{d^2G}{dt^2}$ (rate of velocity change).
3. **Nutritional History:**
   * `minutes_since_meal` *(float)*: Elapsed minutes since last meal.
   * `last_meal_carbs_g` *(float)*: Carbohydrates of last meal in grams.
   * `carbs_intake_last_2h` *(float)*: Total cumulative carbohydrate mass consumed in past 2 hours.
4. **Circadian Harmonics:**
   * `hour_of_day` *(float)*: Continuous hour of day ($0.0$ to $23.75$).
   * `sin_hour` *(float)*: $\sin(2\pi \cdot \text{hour} / 24)$.
   * `cos_hour` *(float)*: $\cos(2\pi \cdot \text{hour} / 24)$.
