import { lazy, Suspense, useState } from "react";
import type { Patient, Reading, PatientSimulation } from "./types";
import type { KineticTelemetry } from "./kineticEngine";
import ReconstructionPanel from "./ReconstructionPanel";
import LegacyAnatomyWorkspace from "./LegacyAnatomyWorkspace";
const Anatomy3DViewer = lazy(() => import("./Anatomy3DViewer"));
export default function AnatomyWorkspace({
  patient,
  reading,
  telemetry,
  simulation,
  active = true,
}: {
  patient: Patient;
  reading: Reading | null;
  telemetry: KineticTelemetry;
  simulation?: PatientSimulation | null;
  active?: boolean;
}) {
  const [mode, setMode] = useState("3d");
  return (
    <div className="page-stack">
      <div
        className="button-row"
        role="group"
        aria-label="Anatomy representation"
      >
        <button
          className={`button ${mode === "3d" ? "primary" : "secondary"}`}
          aria-pressed={mode === "3d"}
          onClick={() => setMode("3d")}
        >
          Interactive 3D anatomy
        </button>
        <button
          className={`button ${mode === "reconstruction" ? "primary" : "secondary"}`}
          aria-pressed={mode === "reconstruction"}
          onClick={() => setMode("reconstruction")}
        >
          Scan reconstruction
        </button>
        <button
          className={`button ${mode === "atlas" ? "primary" : "secondary"}`}
          aria-pressed={mode === "atlas"}
          onClick={() => setMode("atlas")}
        >
          Original atlas & scan previews
        </button>
      </div>
      {mode === "3d" && active && (
        <Suspense
          fallback={
            <section className="paper-card">Loading 3D engine…</section>
          }
        >
          <Anatomy3DViewer
            patient={patient}
            reading={reading}
            simulation={simulation}
            active={active}
          />
        </Suspense>
      )}
      {active && mode === "reconstruction" && (
        <ReconstructionPanel patient={patient} reading={reading} />
      )}
      <div hidden={mode !== "atlas"}>
        <LegacyAnatomyWorkspace
          patient={patient}
          reading={reading}
          telemetry={telemetry}
        />
      </div>
    </div>
  );
}
