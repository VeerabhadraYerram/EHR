import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Layers3,
  Maximize2,
  RotateCcw,
} from "lucide-react";
import { OrganVisual } from "./OrganVisuals";
import BodyTwinVisual from "./BodyTwinVisual";
import OrganScans from "./OrganScans";
import PancreasTwinDeepDive from "./PancreasTwinDeepDive";
import KidneysTwinDeepDive from "./KidneysTwinDeepDive";
import HeartTwinDeepDive from "./HeartTwinDeepDive";
import BrainTwinDeepDive from "./BrainTwinDeepDive";
import {
  organInfo,
  twinViews,
  type Organ,
  type TwinView,
} from "./organDefinitions";
import type { Patient, Reading } from "./types";
import type { KineticTelemetry } from "./kineticEngine";
function Panel({
  title,
  tag,
  className,
  children,
}: {
  title: string;
  tag?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`dx-panel ${className || ""}`}>
      <header className="dx-panel-heading">
        <h2>{title}</h2>
        <span>{tag}</span>
      </header>
      {children}
    </section>
  );
}
const structureNotes: Record<Organ, string[]> = {
  pancreas: [
    "Broad head at the anatomical right.",
    "Central body across the upper abdomen.",
    "Tapered tail toward the anatomical left.",
  ],
  kidneys: [
    "Right kidney in the anterior illustration.",
    "Left kidney in the anterior illustration.",
    "Medial entrance for vessels and ureter.",
  ],
  heart: [
    "Major vessel emerging from the superior heart.",
    "External ventricular surface.",
    "Inferior tip formed by the left ventricle.",
  ],
  brain: [
    "Folded outer cerebral surface.",
    "Cerebellum behind and below the cerebrum.",
    "Connection between brain and spinal cord.",
  ],
};
export default function AnatomyWorkspace({
  patient: currentPatient,
  reading: currentReading,
  telemetry,
}: {
  patient: Patient;
  reading: Reading | null;
  telemetry: KineticTelemetry;
}) {
  const selectedPatientId = currentPatient.person_id;
  const [view, setView] = useState<TwinView>("body"),
    [angle, setAngle] = useState(0),
    [zoom, setZoom] = useState(false),
    [labels, setLabels] = useState(true),
    [structure, setStructure] = useState(0);
  const chooseView = (next: TwinView) => {
    setView(next);
    setAngle(0);
    setZoom(false);
    setStructure(0);
  };
  const cycle = (direction: number) =>
    chooseView(
      twinViews[
        (twinViews.indexOf(view) + direction + twinViews.length) %
          twinViews.length
      ],
    );
  return (
    <div className="anatomy-layout">
      <div className="anatomy-preserved ot-workstation">
        {/* CENTER STACK: ANATOMICAL & BIOPHYSICAL DIGITAL TWIN */}
        <Panel
          title={
            view === "body"
              ? "ANATOMICAL DIGITAL TWIN"
              : `${organInfo[view].name.toUpperCase()} DIGITAL TWIN`
          }
          tag={view === "body" ? "MULTI-ORGAN" : "BIOPHYSICAL"}
          className="dx-anatomy ot-twin-panel"
        >
          <div className="ot-twin-navigation">
            <button onClick={() => cycle(-1)} aria-label="Previous twin">
              <ArrowLeft size={17} />
            </button>
            <div aria-live="polite">
              <span>
                {view === "body"
                  ? "COMPLETE ANATOMY"
                  : organInfo[view].system.toUpperCase()}
              </span>
              <strong>
                {view === "body" ? "Body twin" : `${organInfo[view].name} twin`}
              </strong>
            </div>
            <button onClick={() => cycle(1)} aria-label="Next twin">
              <ArrowRight size={17} />
            </button>
          </div>

          <div
            className={`ot-central-stage ${view === "body" ? "body-view" : "organ-view"} ${zoom ? "magnified" : ""}`}
          >
            <div className="ot-stage-orbit orbit-a" />
            <div className="ot-stage-orbit orbit-b" />
            <div className="ot-stage-ruler" aria-hidden="true">
              {Array.from({ length: 15 }, (_, i) => (
                <i key={i} />
              ))}
            </div>

            <div
              className="ot-view-art"
              style={{
                transform: `perspective(1000px) rotateY(${angle}deg)`,
              }}
              key={view}
            >
              {view === "body" ? (
                <BodyTwinVisual
                  patient={currentPatient}
                  reading={currentReading || undefined}
                  telemetry={telemetry}
                  labels={labels}
                  onSelectOrgan={(organ) => chooseView(organ)}
                />
              ) : (
                <div className={`ot-isolated-organ ${view}`}>
                  <OrganVisual
                    organ={view}
                    patient={currentPatient}
                    reading={currentReading || undefined}
                    telemetry={telemetry}
                  />
                  {labels &&
                    organInfo[view].structures.map((name, i) => (
                      <button
                        key={name}
                        className={`ot-landmark ${structure === i ? "active" : ""}`}
                        style={{
                          left: `${organInfo[view].landmarks[i][0]}%`,
                          top: `${organInfo[view].landmarks[i][1]}%`,
                        }}
                        onClick={() => setStructure(i)}
                        aria-label={`Inspect ${name.toLowerCase()}`}
                        aria-pressed={structure === i}
                      >
                        <i />
                        <span>{name}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>

            <div className="ot-stage-provenance">
              <span className="ot-online-dot" />
              {view === "body"
                ? "ANTERIOR WHOLE-BODY ATLAS"
                : `${organInfo[view].name.toUpperCase()} BIOPHYSICAL ATLAS`}
              <span>
                PATIENT {selectedPatientId} · C-PEP{" "}
                {currentPatient?.fasting_c_peptide_nmol_l} nmol/L · eGFR{" "}
                {currentPatient?.egfr}
              </span>
            </div>
          </div>

          {view !== "body" && (
            <div className="ot-organ-insight" aria-live="polite">
              <span>
                {organInfo[view].structures[structure]?.toUpperCase()}
              </span>
              <p>{structureNotes[view][structure]}</p>
            </div>
          )}

          {view !== "body" && (
            <div className="ot-view-toolbar">
              <label>
                ANGLE
                <input
                  type="range"
                  aria-label="Anatomy viewing angle"
                  min="-30"
                  max="30"
                  value={angle}
                  onChange={(e) => setAngle(Number(e.target.value))}
                />
              </label>
              <button aria-pressed={labels} onClick={() => setLabels(!labels)}>
                <Layers3 size={12} /> Labels
              </button>
              <button
                aria-label="Magnify anatomy"
                aria-pressed={zoom}
                onClick={() => setZoom(!zoom)}
              >
                <Maximize2 size={13} />
              </button>
              <button
                aria-label="Reset anatomy view"
                onClick={() => {
                  setAngle(0);
                  setZoom(false);
                  setLabels(true);
                  setStructure(0);
                }}
              >
                <RotateCcw size={13} />
              </button>
            </div>
          )}

          <div
            className="ot-twin-dots"
            role="group"
            aria-label="Choose anatomy twin"
          >
            {twinViews.map((t) => (
              <button
                key={t}
                aria-pressed={view === t}
                onClick={() => chooseView(t)}
              >
                {t === "body" ? "Body" : organInfo[t].name}
              </button>
            ))}
          </div>
        </Panel>
      </div>
      <aside className="anatomy-side">
        <section className="paper-card">
          <span className="eyebrow">Patient context</span>
          <h3>
            {view === "body" ? "Whole-body overview" : organInfo[view].name}
          </h3>
          <dl className="facts-list">
            <div>
              <dt>Glucose</dt>
              <dd>{currentReading?.glucose_mg_dl ?? "—"} mg/dL</dd>
            </div>
            <div>
              <dt>C-peptide</dt>
              <dd>{currentPatient.fasting_c_peptide_nmol_l} nmol/L</dd>
            </div>
            <div>
              <dt>eGFR</dt>
              <dd>{currentPatient.egfr} mL/min/1.73m²</dd>
            </div>
            <div>
              <dt>HbA1c</dt>
              <dd>{currentPatient.hba1c_percent}%</dd>
            </div>
          </dl>
          <p className="caption">
            Organ physiology values are illustrative estimates based on these
            inputs. The anatomy artwork and animations are preserved.
          </p>
        </section>
        <OrganScans key={currentPatient.person_id} view={view} />
        <section className="paper-card">
          <span className="eyebrow">Explore an organ</span>
          <p>
            Select a hotspot or organ tab to inspect labels, tilt the atlas,
            magnify it and open a local scan.
          </p>
        </section>
      </aside>
      {view !== "body" && (
        <details className="paper-card anatomy-deep">
          <summary>
            Open {organInfo[view].name.toLowerCase()} physiological deep dive
          </summary>
          <p className="caption">
            Educational estimates, not measured organ function or diagnostic
            findings.
          </p>
          <div className="anatomy-preserved ot-workstation">
            {view === "pancreas" ? (
              <PancreasTwinDeepDive
                patient={currentPatient}
                reading={currentReading || undefined}
                telemetry={telemetry}
              />
            ) : view === "kidneys" ? (
              <KidneysTwinDeepDive
                patient={currentPatient}
                telemetry={telemetry}
              />
            ) : view === "heart" ? (
              <HeartTwinDeepDive
                patient={currentPatient}
                telemetry={telemetry}
              />
            ) : (
              <BrainTwinDeepDive
                patient={currentPatient}
                telemetry={telemetry}
              />
            )}
          </div>
        </details>
      )}
    </div>
  );
}
