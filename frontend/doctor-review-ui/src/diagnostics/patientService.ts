import type {
  Patient,
  Reading,
  PatientSimulation,
  InterventionSpec,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function requestJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      message =
        typeof body.detail === "string"
          ? body.detail
          : JSON.stringify(body.detail || body);
    } catch {
      /* Proxy failures may not be JSON. */
    }
    throw new ApiError(message, response.status);
  }
  return response.json() as Promise<T>;
}
const numericFields = [
  "age_years",
  "bmi",
  "years_with_diabetes",
  "hba1c_percent",
  "fasting_glucose_mg_dl",
  "postprandial_glucose_mg_dl",
  "fasting_c_peptide_nmol_l",
  "creatinine_mg_dl",
  "egfr",
  "total_cholesterol_mg_dl",
  "triglycerides_mg_dl",
  "hdl_mg_dl",
  "ldl_mg_dl",
];
// Preserve the workstation's existing fictional aliases; clinical facts remain API-owned.
const displayAliases: Record<string, string> = {
  P001: "Rohan Sharma",
  P002: "Sunita Patel",
  P003: "Vikram Desai",
  P004: "Meera Nambiar",
  P005: "Arun Kumar",
  P006: "Kavita Rao",
  P007: "Rajesh Gupta",
  P008: "Deepa Joshi",
  P009: "Sanjay Verma",
  P010: "Pooja Hegde",
  P011: "Manoj Pillai",
  P012: "Geeta Swaminathan",
  P013: "Amitabh Sen",
  P014: "Ananya Roy",
  P015: "Suresh Reddy",
  P016: "Priyanka Nair",
  P017: "Karthik Iyer",
  P018: "Shalini Menon",
  P019: "Naveen Bhat",
  P020: "Asha Varma",
};
export async function fetchPatientsList(
  signal?: AbortSignal,
): Promise<Patient[]> {
  const rows = await requestJson<Patient[]>("/api/v1/twin/patients", {
    signal,
  });
  return rows
    .map((row) => {
      const patient = { ...row } as Patient & Record<string, unknown>;
      patient.display_name = displayAliases[row.person_id] || row.display_name;
      for (const field of numericFields) {
        const value = patient[field];
        if (value !== "" && value != null && Number.isFinite(Number(value)))
          patient[field] = Number(value);
      }
      return patient;
    })
    .sort((a, b) => a.person_id.localeCompare(b.person_id));
}
export interface PatientDates {
  dates: string[];
  default_date: string;
}
export async function fetchPatientDates(
  patientId: string,
  signal?: AbortSignal,
): Promise<PatientDates> {
  return requestJson<PatientDates>(
    `/api/v1/twin/patients/${encodeURIComponent(patientId)}/dates`,
    { signal },
  );
}
export async function fetchPatientReadings(
  patientId: string,
  date?: string,
  signal?: AbortSignal,
): Promise<Reading[]> {
  const query = new URLSearchParams({ limit: "0" });
  if (date) query.set("date", date);
  const rows = await requestJson<Array<Record<string, string | number | null>>>(
    `/api/v1/twin/patients/${encodeURIComponent(patientId)}/readings?${query}`,
    { signal },
  );
  return rows
    .map((r) => ({
      person_id: String(r.person_id),
      reading_time: String(r.reading_time),
      time: String(r.reading_time).slice(11, 16),
      glucose_mg_dl: Number(r.glucose_mg_dl),
      meal_description: String(r.meal_description || ""),
      meal_carbs_g:
        r.meal_carbs_g === "" || r.meal_carbs_g == null
          ? null
          : Number(r.meal_carbs_g),
      insulin_units:
        r.insulin_units === "" || r.insulin_units == null
          ? null
          : Number(r.insulin_units),
      minutes_since_meal:
        r.minutes_since_meal === "" || r.minutes_since_meal == null
          ? undefined
          : Number(r.minutes_since_meal),
      last_meal_carbs_g:
        r.last_meal_carbs_g === "" || r.last_meal_carbs_g == null
          ? undefined
          : Number(r.last_meal_carbs_g),
      is_spike: Number(r.glucose_mg_dl) >= 180,
    }))
    .filter((r) => Number.isFinite(r.glucose_mg_dl));
}
export async function fetchPatientSimulation(
  patientId: string,
  decisionTime: string,
  interventions?: InterventionSpec[],
  signal?: AbortSignal,
): Promise<PatientSimulation> {
  const query = new URLSearchParams({ decision_time: decisionTime });
  return requestJson<PatientSimulation>(
    `/api/v1/twin/simulate/${encodeURIComponent(patientId)}?${query}`,
    {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: interventions ? JSON.stringify(interventions) : undefined,
    },
  );
}
export function downloadJson(filename: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
