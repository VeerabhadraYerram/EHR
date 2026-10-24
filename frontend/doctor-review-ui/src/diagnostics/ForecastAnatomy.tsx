import { lazy, Suspense, useEffect, useState } from "react";
import { matchingOrganForecast } from './organEvidence';
import { organGlucoseState } from './organVisualization';
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
  useEffect(() => setHorizon(0), [patient.person_id, reading?.reading_time]);
  const matching = matchingOrganForecast(patient, reading, simulation);
  const matchingBranch = matching && simulation?.counterfactual_branches.includes(branch!) ? branch : null;
  const glucose = organGlucoseState(patient, reading, simulation, horizon,
    matchingBranch?.intervention_type)?.glucose;
  return (
    <section className="page-stack">
      <div className="paper-card">
        <span className="eyebrow">Forecast → physiological visualization</span>
        <h2>See the projected state, one step at a time.</h2>
        <p className="muted">
          The removable color overlay shows systemic glucose from the shared
          forecast. Tissue geometry and heart rhythm do not change with glucose;
          no organ damage or recovery is inferred.
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
            disabled={!matching}
            aria-label="3D forecast horizon"
            onChange={(e) => setHorizon(Number(e.target.value))}
          />
          <span>{glucose?.toFixed(1) ?? "—"} mg/dL</span>
        </div>
        {matchingBranch && (
          <p className="caption">
            Showing what-if branch: {matchingBranch.intervention_label}.
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
