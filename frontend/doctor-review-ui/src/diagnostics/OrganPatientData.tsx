import { useState } from "react";
import type { Patient, Reading, PatientSimulation } from "./types";
import { organMetrics, matchingOrganForecast } from "./organEvidence";

export default function OrganPatientData({
  organ,
  patient,
  reading,
  simulation,
  source,
  reconstructed = false,
}: {
  organ: string;
  patient: Patient;
  reading: Reading | null;
  simulation?: PatientSimulation | null;
  source?: string;
  reconstructed?: boolean;
}) {
  const [tab, setTab] = useState<"recorded" | "prediction" | "anatomy">(
    "recorded",
  );
  const metrics = organMetrics(organ, patient, reading);
  // Never display another patient's or another decision-time's shared forecast.
  const baseline = matchingOrganForecast(patient, reading, simulation);
  const hasPrediction = organ === "pancreas" || organ === "body";
  const trajectory = baseline?.continuous_trajectory || [];
  return (
    <section
      className="organ-patient-data"
      aria-label={`${organ} patient data`}
    >
      <header>
        <span>{organ} · patient data</span>
        <b>{patient.person_id}</b>
      </header>
      <div
        className="organ-data-tabs"
        role="tablist"
        aria-label="Organ evidence type"
      >
        {(["recorded", "prediction", "anatomy"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
          >
            {t === "recorded"
              ? "Recorded"
              : t === "prediction"
                ? "Predicted"
                : "Anatomy"}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === "recorded" && (
          <>
            {metrics.length ? (
              metrics.map((m) => (
                <div className="organ-metric" key={m.label}>
                  <span>{m.label}</span>
                  <strong>
                    {m.value === null ? "Not available" : m.value}
                    <small>{m.value !== null ? m.unit : ""}</small>
                  </strong>
                  <small>{m.source}</small>
                </div>
              ))
            ) : (
              <p>
                No{" "}
                {organ === "lungs"
                  ? "respiratory"
                  : organ === "brain"
                    ? "neurological"
                    : organ === "liver"
                      ? "liver-specific"
                      : organ}{" "}
                measurements are available for this profile.
              </p>
            )}
            {organ === "heart" && (
              <p>
                Lipids provide cardiovascular context; they do not measure heart
                function.
              </p>
            )}
            <footer>
              Demonstration cohort · recorded values are separate from atlas
              appearance.
            </footer>
          </>
        )}
        {tab === "prediction" && (
          <>
            {hasPrediction && baseline ? (
              <>
                <div className="organ-metric">
                  <span>Shared glucose forecast peak</span>
                  <strong>
                    {baseline.predicted_peak_glucose_mg_dl.toFixed(1)}
                    <small>mg/dL</small>
                  </strong>
                  <small>
                    Within {baseline.predicted_peak_time_minutes} min ·{" "}
                    {simulation?.decision_time}
                  </small>
                </div>
                {trajectory.length > 1 && (
                  <svg
                    viewBox="0 0 240 65"
                    role="img"
                    aria-label="Shared predicted glucose trajectory"
                  >
                    <polyline
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      points={trajectory
                        .map(
                          (p, i) =>
                            `${8 + (i / (trajectory.length - 1)) * 224},${55 - ((p.projected_glucose_mg_dl - Math.min(...trajectory.map((p) => p.projected_glucose_mg_dl))) / Math.max(1, Math.max(...trajectory.map((p) => p.projected_glucose_mg_dl)) - Math.min(...trajectory.map((p) => p.projected_glucose_mg_dl)))) * 45}`,
                        )
                        .join(" ")}
                    />
                  </svg>
                )}
                <p>
                  {baseline.model_applicable === false
                    ? "Outside the model’s evaluated domain. "
                    : ""}
                  Glucose prediction from the shared model; no pancreatic
                  damage, fat or organ-shape forecast is inferred.
                </p>
              </>
            ) : (
              <p>
                {hasPrediction
                  ? "No matching forecast for the selected patient and recording."
                  : "No validated organ-specific prediction is available."}
              </p>
            )}
          </>
        )}
        {tab === "anatomy" && (
          <>
            <p>
              {reconstructed
                ? "Mesh reconstructed from an explicitly synthetic study."
                : "Reference organ geometry. Individual organ shape, fat and pathology have not been measured."}
            </p>
            <small>{source || "Shared atlas reference"}</small>
            <p>
              Viewing cutaways and tissue materials illustrate anatomy; they are
              not patient findings.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
