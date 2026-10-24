import type { InterventionSpec, PatientSimulation } from "./types";
export interface Evidence {
  id: string;
  kind: string;
  label: string;
  value: unknown;
  unit?: string;
  source?: string;
  url?: string;
  timestamp?: string;
}
export interface Claim {
  kind: string;
  text: string;
  evidence_ids: string[];
}
export interface ChartSeries {
  label: string;
  kind: string;
  points: { x: number; y: number; label?: string }[];
}
export interface AnswerVisual {
  type: "metrics" | "history" | "trajectory" | "explanation" | "scan";
  title: string;
  note?: string;
  unit?: string;
  metrics?: Evidence[];
  series?: ChartSeries[];
  steps?: { title: string; text: string }[];
  study?: {
    patient_id: string;
    synthetic: boolean;
    image_url: string;
    mask_url: string;
    slices: number;
  } | null;
}
export interface AssistantAnswer {
  patient_id: string;
  decision_time: string;
  title: string;
  claims: Claim[];
  followups: string[];
  evidence: Evidence[];
  visual: AnswerVisual;
  simulation: PatientSimulation | null;
  interventions: InterventionSpec[];
  provider: { provider: string; model: string };
  notices: string[];
  disclosure: string;
}
