// Fictional, frontend-only examples. No API or patient data is used.
export const demoProfiles = {
  "DEMO A": {
    label: "Diabetes review",
    hba1c: "7.8%",
    cPeptide: "0.62 nmol/L",
    egfr: "82 mL/min/1.73 m²",
    creatinine: "1.02 mg/dL",
    heartRate: "72 bpm",
    bloodPressure: "132/82 mmHg",
    ldl: "108 mg/dL",
  },
  "DEMO B": {
    label: "Cardiorenal review",
    hba1c: "8.2%",
    cPeptide: "0.48 nmol/L",
    egfr: "64 mL/min/1.73 m²",
    creatinine: "1.24 mg/dL",
    heartRate: "76 bpm",
    bloodPressure: "138/86 mmHg",
    ldl: "116 mg/dL",
  },
} as const;
export type DemoProfile = (typeof demoProfiles)[keyof typeof demoProfiles];
