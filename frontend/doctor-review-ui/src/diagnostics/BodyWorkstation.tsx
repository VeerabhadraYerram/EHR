import { useState, type ReactNode } from "react";
import {
  ArrowRight,
  Activity,
  Dna,
  FlaskConical,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { BodyFallback, DnaHelix } from "./MedicalVisuals";
import GlucoseForecastPanel from "./GlucoseForecastPanel";
import type { Patient, Reading, PatientSimulation } from "./types";

function Panel({
  title,
  tag,
  children,
  className = "",
}: {
  title: string;
  tag?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`dx-panel ws-panel ${className}`}>
      <header className="dx-panel-heading">
        <h2>{title}</h2>
        {tag && <span className="dx-panel-tag">{tag}</span>}
      </header>
      {children}
      <i className="dx-panel-decoration" />
    </section>
  );
}
const value = (v: unknown) =>
  v === null || v === undefined || v === "" ? "—" : String(v);

export function BodyStage({
  patient,
  reading,
}: {
  patient: Patient;
  reading: Reading | null;
}) {
  const [ready, setReady] = useState(true);
  const [expanded, setExpanded] = useState(false);
  return (
    <Panel
      title="ANATOMICAL DIGITAL TWIN"
      tag="WHOLE BODY"
      className={`ws-body-panel ${expanded ? "ws-body-expanded" : ""}`}
    >
      <div className="ws-body-caption">
        <span>ANTERIOR VIEW / ANATOMICAL REFERENCE</span>
        <button
          className="icon-button"
          aria-label={expanded ? "Restore body view" : "Expand body view"}
          aria-pressed={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>
      <div className="ot-central-stage body-view ws-body-stage">
        <div className="ot-stage-orbit orbit-a" />
        <div className="ot-stage-orbit orbit-b" />
        <div className="ot-stage-ruler" aria-hidden="true">
          {Array.from({ length: 15 }, (_, i) => (
            <i key={i} />
          ))}
        </div>
        <div className="ot-view-art">
          <div className="ot-body-registration">
            <div className="ot-body-art">
              {ready ? (
                <img
                  src="/diagnostics/anatomy.png"
                  alt="Whole-body anatomical reference, not a patient scan"
                  onError={() => setReady(false)}
                />
              ) : (
                <BodyFallback />
              )}
            </div>
          </div>
        </div>
        <span className="ws-body-side left">
          SYSTEMIC VIEW
          <br />
          TYPE 2 DIABETES
        </span>
        <span className="ws-body-side right">
          {patient.person_id}
          <br />
          {reading?.time || "NO READING"}
        </span>
      </div>
      <div className="ws-body-readouts">
        <div>
          <span>RECORDED GLUCOSE</span>
          <strong>
            {reading ? Math.round(reading.glucose_mg_dl) : "—"}{" "}
            <small>mg/dL</small>
          </strong>
        </div>
        <div>
          <span>HbA1c</span>
          <strong>
            {value(patient.hba1c_percent)} <small>%</small>
          </strong>
        </div>
        <div>
          <span>eGFR</span>
          <strong>
            {value(patient.egfr)} <small>mL/min/1.73m²</small>
          </strong>
        </div>
      </div>
      <p className="ws-body-source">
        <i /> SHARED PATIENT RECORD{" "}
        <span>Atlas artwork · measured values shown separately</span>
      </p>
    </Panel>
  );
}

export default function BodyWorkstation({
  patient,
  reading,
  simulation,
  historical,
  future,
  predicting,
  navigate,
}: {
  patient: Patient;
  reading: Reading | null;
  simulation: PatientSimulation | null;
  historical: Reading[];
  future: Reading[];
  predicting: boolean;
  navigate: (
    page: "patients" | "forecast" | "scenarios" | "genomics" | "evidence",
  ) => void;
}) {
  const drivers = simulation?.baseline.top_shap_drivers.slice(0, 3) || [];
  const maxContribution = Math.max(
    ...drivers.map((d) => Math.abs(d.shap_value)),
    0.001,
  );
  return (
    <div className="ws-diagnostic-grid">
      <div className="ws-left-stack">
        <Panel title="PATIENT PROFILE" tag={patient.person_id}>
          <div className="ws-panel-content">
            <span className="eyebrow">RESEARCH COHORT / TYPE 2 DIABETES</span>
            <h3 className="ws-patient-name">{patient.display_name}</h3>
            <p className="muted">
              {patient.age_years} years · {patient.sex} ·{" "}
              {patient.years_with_diabetes} years with diabetes
            </p>
            <div className="ws-glucose">
              <strong>
                {reading ? Math.round(reading.glucose_mg_dl) : "—"}
              </strong>
              <span>
                mg/dL
                <small>
                  Recorded glucose ·{" "}
                  {reading?.reading_time.replace("T", " ") || "—"}
                </small>
              </span>
            </div>
            <p className="ws-small-note">
              Baseline clinical snapshot · historical research data
            </p>
            <dl className="facts-list">
              {[
                ["HbA1c", `${value(patient.hba1c_percent)} %`],
                ["BMI", value(patient.bmi)],
                [
                  "C-peptide",
                  `${value(patient.fasting_c_peptide_nmol_l)} nmol/L`,
                ],
                ["Creatinine", `${value(patient.creatinine_mg_dl)} mg/dL`],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <button
              className="text-button"
              onClick={() => navigate("patients")}
            >
              View patient record <ArrowRight size={13} />
            </button>
          </div>
        </Panel>
        <Panel title="MODEL EXPLANATION" tag="TreeSHAP">
          <div className="ws-panel-content">
            <p className="caption">
              Factors contributing to the selected forecast.
            </p>
            <div className="ws-drivers">
              {drivers.length ? (
                drivers.map((d) => (
                  <div key={d.feature}>
                    <span>{d.feature.replaceAll("_", " ")}</span>
                    <strong className={d.shap_value > 0 ? "ws-warm" : ""}>
                      {d.shap_value > 0 ? "+" : ""}
                      {d.shap_value.toFixed(3)}
                    </strong>
                    <div className="ws-driver-track">
                      <i
                        style={{
                          width: `${(Math.abs(d.shap_value) / maxContribution) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="muted">
                  {predicting
                    ? "Calculating contributions…"
                    : "No explanation available for this reading."}
                </p>
              )}
            </div>
            <button
              className="text-button"
              onClick={() => navigate("forecast")}
            >
              Inspect all model inputs <ArrowRight size={13} />
            </button>
          </div>
        </Panel>
        <Panel title="RECORDING & PROVENANCE" tag="CGM">
          <div className="ws-panel-content">
            <Activity size={22} />
            <p>Historical sensor replay</p>
            <p className="caption">
              {historical.length} readings available up to this moment. Atlas
              anatomy is illustrative; measurements come from the selected
              patient record.
            </p>
            <button
              className="text-button"
              onClick={() => navigate("evidence")}
            >
              Data & model evidence <ArrowRight size={13} />
            </button>
          </div>
        </Panel>
      </div>
      <BodyStage patient={patient} reading={reading} />
      <div className="ws-right-stack">
        <div className="ws-overview-forecast">
          <GlucoseForecastPanel
            simulation={simulation}
            currentReading={reading}
            historicalReadings={historical}
            futureReadings={future}
            loading={predicting}
            compact
          />
          <button
            className="text-button ws-open-forecast"
            onClick={() => navigate("forecast")}
          >
            Open full forecast <ArrowRight size={13} />
          </button>
        </div>
        <Panel title="WHAT-IF SCENARIOS" tag="SIMULATION">
          <div className="ws-panel-content">
            <FlaskConical size={23} />
            <h3>Explore a different trajectory.</h3>
            <p className="caption">
              Compare walking, carbohydrate reduction and meal sequencing
              against the same baseline forecast.
            </p>
            <div className="ws-scenario-tags">
              <span>Walking</span>
              <span>Meal portions</span>
              <span>Meal timing</span>
            </div>
            <button
              className="button primary"
              onClick={() => navigate("scenarios")}
            >
              Ask your twin <ArrowRight size={14} />
            </button>
            <p className="ws-small-note">
              Assumption-based scenarios · not validated treatment effects
            </p>
          </div>
        </Panel>
        <Panel title="GENOMIC PROFILE" tag="DNA">
          <button
            className="ws-genomic-link"
            onClick={() => navigate("genomics")}
          >
            <div className="ws-dna">
              <DnaHelix active={0} />
            </div>
            <div>
              <Dna size={17} />
              <h3>Variant explorer</h3>
              <p className="caption">
                Inspect patient-linked sequencing, annotations and source
                evidence.
              </p>
              <span className="text-button">
                Open genomics <ArrowRight size={13} />
              </span>
            </div>
          </button>
        </Panel>
      </div>
    </div>
  );
}
