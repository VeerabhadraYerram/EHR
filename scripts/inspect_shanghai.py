"""Inspect Shanghai T2DM dataset to select candidates for demo patient."""

import os
import sys
import pandas as pd

base = r"C:\Users\saiko\OneDrive\Desktop\EHR\EHR\data\raw_clinical\shanghai"
subfolder = [d for d in os.listdir(base) if os.path.isdir(os.path.join(base, d))][0]
summary_path = os.path.join(base, subfolder, "Shanghai_T2DM_Summary.xlsx")
df = pd.read_excel(summary_path)

def to_hba1c(v):
    try:
        return round((0.09148 * float(v)) + 2.152, 1)
    except:
        return None

df["HbA1c_pct"] = df["HbA1c (mmol/mol)"].apply(to_hba1c)

matches = df[
    (df["Gender (Female=1, Male=2)"] == 2)
    & (df["Age (years)"].between(45, 65))
    & (df["Hypoglycemic Agents"].str.contains("metformin", case=False, na=False))
]

print("Found", len(matches), "matching patients:")
for _, row in matches.iterrows():
    p_num = row["Patient Number"]
    age = row["Age (years)"]
    hba1c = row["HbA1c_pct"]
    bmi = round(row["BMI (kg/m2)"], 1)
    dur = row["Duration of diabetes (years)"]
    meds = row["Hypoglycemic Agents"]
    print(f"ID: {p_num} | Age: {age} | HbA1c: {hba1c}% | BMI: {bmi} | Dur: {dur}y | Meds: {meds}")
