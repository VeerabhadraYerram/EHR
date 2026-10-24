import { lazy, Suspense, useState } from "react";
import type {
  Patient,
  Reading,
  PatientSimulation,
  SimulationBranch,
} from "./types";
const Anatomy3DViewer = lazy(() => import("./Anatomy3DViewer"));
export default function ForecastAnatomy({
  patient,
  reading,
  simulation,
  branch,
}: {
  patient: Patient;
  reading: Reading | null;
  simulation: PatientSimulation | null;
  branch?: SimulationBranch | null;
}) {
  const [horizon, setHorizon] = useState(0);
  const point = (
    branch?.simulated_trajectory || simulation?.baseline.continuous_trajectory
  )?.find((p) => p.horizon_minutes === horizon);
  const glucose =
    horizon === 0 ? reading?.glucose_mg_dl : point?.projected_glucose_mg_dl;
  return (
    <section className="page-stack">
      <div className="paper-card">
        <span className="eyebrow">Forecast → physiological visualization</span>
        <h2>See the projected state, one step at a time.</h2>
        <p className="muted">
          Glucose is the trained forecast endpoint. Organ color and rhythm are
          explanatory visual mappings of glucose and baseline clinical context;
          they are not additional validated organ forecasts.
        </p>
        <div className="forecast-anatomy-time">
          <strong>
            {horizon === 0 ? "Selected moment" : `+${horizon} minutes`}
          </strong>
          <input
            type="range"
            min="0"
            max="120"
            step="15"
            value={horizon}
            aria-label="3D forecast horizon"
            onChange={(e) => setHorizon(Number(e.target.value))}
          />
          <span>{glucose?.toFixed(1) ?? "—"} mg/dL</span>
        </div>
        {branch && (
          <p className="caption">
            Showing what-if branch: {branch.intervention_label}.
          </p>
        )}
      </div>
      {glucose !== undefined && (
        <Suspense
          fallback={
            <div className="paper-card">Loading anatomy projection…</div>
          }
        >
          <Anatomy3DViewer
            compact
            patient={patient}
            reading={reading}
            simulation={simulation}
            projectedGlucose={glucose}
            title={
              horizon === 0
                ? "Current state"
                : `Projected state · +${horizon} min`
            }
          />
        </Suspense>
      )}
    </section>
  );
}
