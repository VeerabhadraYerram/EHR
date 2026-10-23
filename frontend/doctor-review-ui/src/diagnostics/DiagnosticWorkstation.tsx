import { useEffect, useRef, useState, useMemo } from "react";
import type { ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Cross,
  Layers3,
  Maximize2,
  RotateCcw,
  X,
} from "lucide-react";
import {
  DnaHelix,
} from "./MedicalVisuals";
import { OrganVisual } from "./OrganVisuals";
import { organInfo, twinViews } from "./organDefinitions";
import type { Organ, TwinView } from "./organDefinitions";
import "./diagnostics.css";
import "./organ-twins.css";
import "./patient-workstation.css";

import BodyTwinVisual from "./BodyTwinVisual";
import { computeKineticTelemetry } from "./kineticEngine";

import type { Patient, Reading, PatientSimulation } from "./types";
import { fetchPatientsList, fetchPatientReadings, fetchPatientSimulation } from "./patientService";
import PatientRegistryPanel from "./PatientRegistryPanel";
import LiveWearablesPanel from "./LiveWearablesPanel";
import GlucoseForecastPanel from "./GlucoseForecastPanel";

const bases = "ATCGGATCGAGCTAGCATCGTAGCATGCGATC".split("");

const structureNotes: Record<Organ, string[]> = {
  pancreas: [
    "Broad part of the pancreas, shown at the anatomical right.",
    "Central portion of the gland, extending across the upper abdomen.",
    "Tapered end of the pancreas toward the anatomical left.",
  ],
  kidneys: [
    "Shown on the viewer’s left in this anterior illustration.",
    "Shown on the viewer’s right in this anterior illustration.",
    "Medial region where vessels enter and leave the kidney.",
  ],
  heart: [
    "Major vessel emerging from the superior part of the heart.",
    "External surface of the heart’s lower chambers.",
    "Inferior tip of the heart, formed by the left ventricle.",
  ],
  brain: [
    "Folded outer surface of the cerebral hemispheres.",
    "Structure behind and below the cerebrum.",
    "Connection between the brain and spinal cord.",
  ],
};

function Panel({
  title,
  tag,
  children,
  className = "",
  action,
}: {
  title: string;
  tag?: string;
  children: ReactNode;
  className?: string;
  action?: () => void;
}) {
  return (
    <section className={`dx-panel ${className}`}>
      <header className="dx-panel-heading">
        <h2>{title}</h2>
        {action ? (
          <button aria-label={`Expand ${title.toLowerCase()}`} onClick={action}>
            <Maximize2 size={12} />
          </button>
        ) : (
          <span className="dx-panel-tag">{tag}</span>
        )}
      </header>
      {children}
      <i className="dx-panel-decoration" />
    </section>
  );
}

export default function DiagnosticWorkstation() {
  // 100 Patient Cohort State
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("P012");
  const [readings, setReadings] = useState<Reading[]>([]);
  const [timelineIndex, setTimelineIndex] = useState<number>(0);
  const [simulation, setSimulation] = useState<PatientSimulation | null>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(true);
  const [streamSpeed, setStreamSpeed] = useState<number>(1);

  // Organ Twin & UI View States
  const [view, setView] = useState<TwinView>("body");
  const [tick, setTick] = useState(0);
  const [modal, setModal] = useState<"genomics" | "report" | null>(null);
  const [selectedBase, setSelectedBase] = useState(0);
  const [angle, setAngle] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [labels, setLabels] = useState(true);
  const [structure, setStructure] = useState(0);
  const [toast, setToast] = useState("");
  const modalRef = useRef<HTMLDivElement>(null);

  // Initialize 100 patients on load
  useEffect(() => {
    document.title = "EHR / 100-Patient Digital Twin Workstation";
    fetchPatientsList().then((list) => {
      setPatients(list);
      if (list.length > 0) {
        // Default to first high-risk patient or first patient
        const highRisk = list.find((p) => p.risk_status?.tier === "HIGH");
        setSelectedPatientId(highRisk ? highRisk.person_id : list[0].person_id);
      }
    });
  }, []);

  // When selected patient changes, load their real readings and ML simulation
  useEffect(() => {
    if (!selectedPatientId) return;

    fetchPatientReadings(selectedPatientId).then((rList) => {
      setReadings(rList);
      // Set timeline position to ~mid-day or 50% through day for immediate interesting view
      if (rList.length > 0) {
        setTimelineIndex(Math.min(52, rList.length - 1));
      }
    });

    fetchPatientSimulation(selectedPatientId).then((sim) => {
      setSimulation(sim);
    });
  }, [selectedPatientId]);

  // Selected patient object
  const currentPatient = useMemo(() => {
    return patients.find((p) => p.person_id === selectedPatientId) || patients[0];
  }, [patients, selectedPatientId]);

  // Current wearable reading at scrubber
  const currentReading = readings[timelineIndex] || readings[readings.length - 1] || null;
  const prevReading = timelineIndex >= 2 ? readings[timelineIndex - 2] : readings[0];

  // Dynamic Biophysical Kinetic Telemetry across all organs
  const telemetry = useMemo(() => {
    return computeKineticTelemetry(currentPatient, currentReading || undefined, prevReading || undefined);
  }, [currentPatient, currentReading, prevReading]);

  // Organ view navigation
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

  // Animation ticker for DNA helix
  useEffect(() => {
    if (!isStreaming) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [isStreaming]);

  // Toast auto-clear
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Modal keyboard accessibility
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modalRef.current?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", listener);
      previous?.focus();
    };
  }, [modal]);

  // Clinical report export
  const exportReport = () => {
    const report = {
      title: "Digital Twin Clinical Diagnostic Dossier",
      patient: currentPatient,
      telemetry: {
        current_glucose_mg_dl: currentReading?.glucose_mg_dl,
        reading_time: currentReading?.reading_time,
        total_readings_logged: readings.length,
        biophysical_kinetic_telemetry: telemetry,
      },
      ml_inference: simulation?.baseline,
      counterfactual_simulations: simulation?.counterfactual_branches,
      optimal_recommendation: simulation?.optimal_recommended_action,
      export_timestamp: new Date().toISOString(),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `digital-twin-clinical-${selectedPatientId.toLowerCase()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast(`Clinical Dossier for ${currentPatient?.display_name || selectedPatientId} exported.`);
  };

  // Organ twin context dynamic values from patient EHR and real-time kinetics
  const contextMetrics = useMemo(() => {
    if (!currentPatient) return [];
    if (view === "kidneys") {
      return [
        ["eGFR (RENAL CLEARANCE)", `${telemetry.kidneys.egfr} mL/min/1.73 m²`],
        ["SERUM CREATININE", `${telemetry.kidneys.creatinine} mg/dL`],
        ["SGLT-2 STATUS", telemetry.kidneys.sglt2Status],
        ["ACTIVE GLYCOSURIA", `${telemetry.kidneys.glycosuriaRate} mg/min`],
      ];
    }
    if (view === "heart") {
      return [
        ["SYMPATHETIC HEART RATE", `${telemetry.heart.heartRate} BPM`],
        ["VASCULAR SHEAR STRESS", `${telemetry.heart.vascularShearStress}%`],
        ["HEMODYNAMIC STATE", telemetry.heart.cardioStatus],
        ["LIPID PANEL (LDL)", `${currentPatient.ldl_mg_dl || 105} mg/dL`],
      ];
    }
    if (view === "brain") {
      return [
        ["CENTRAL GLUCOSE SENSOR", `${telemetry.brain.interstitialSensor} mg/dL Interstitial`],
        ["AUTONOMIC REGULATION", telemetry.brain.brainStatus],
        ["CIRCADIAN DAWN DRIVE", telemetry.brain.dawnPhenomenon ? "Active Surge (Cortisol)" : "Quiescent / Basal"],
      ];
    }
    if (view === "pancreas") {
      return [
        ["FASTING C-PEPTIDE", `${telemetry.pancreas.cPeptide} nmol/L`],
        ["BETA-CELL LOAD", `${telemetry.pancreas.betaDemandIndex}% Capacity`],
        ["ENDOCRINE STATUS", telemetry.pancreas.stressState],
        ["HOVORKA INSULIN APPEARANCE", `${telemetry.pancreas.insulinAppearance} mU/min`],
      ];
    }
    return [
      ["HbA1c", `${currentPatient.hba1c_percent}%`],
      ["FASTING C-PEPTIDE", `${telemetry.pancreas.cPeptide} nmol/L`],
      ["HEPATIC EGP", `${telemetry.liver.egpRate} mg/kg/min (${telemetry.liver.state})`],
      ["RENAL SGLT-2", telemetry.kidneys.sglt2Status],
    ];
  }, [view, currentPatient, telemetry]);

  return (
    <div className={`diagnostic-workstation ot-workstation ${isStreaming ? "dx-running" : "dx-paused"}`}>
      <div className="dx-frame-line" />
      <div className="ot-workstation-content" inert={modal ? true : undefined}>
        {/* WORKSTATION HEADER */}
        <header className="dx-header">
          <div className="dx-brand">
            <span className="dx-cross">
              <Cross size={31} strokeWidth={0.8} />
            </span>
            <div>
              <p>
                MEDICAL INTELLIGENCE <span>/</span> DIGITAL TWIN CLINICAL WORKSTATION
              </p>
              <h1>SHANGHAI T2DM CLINICAL COHORT</h1>
              <span>
                100 REAL PATIENTS <i>/</i> ABBOTT FREESTYLE LIBRE CGM <i>/</i> DUAL-HEAD CALIBRATED ML
              </span>
            </div>
          </div>

          {/* 100-Patient Dropdown Switcher */}
          <div className="dx-subject">
            <label htmlFor="dx-subject">SELECT CLINICAL PATIENT ({patients.length})</label>
            <div>
              <select
                id="dx-subject"
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
              >
                {patients.map((p) => (
                  <option key={p.person_id} value={p.person_id}>
                    {p.person_id} — {p.display_name} ({p.risk_status?.tier || "CALM"} · HbA1c {p.hba1c_percent}%)
                  </option>
                ))}
              </select>
              <ChevronDown size={10} />
            </div>
            <span>
              {currentPatient?.display_name.toUpperCase()} · {currentPatient?.age_years}Y · {currentPatient?.sex.toUpperCase()} · {currentPatient?.risk_status?.tier || "CALM"} RISK
            </span>
          </div>

          <div className="dx-header-actions">
            <div className="dx-mode-row">
              <span>
                <i /> DUAL-HEAD ML LIVE
              </span>
              <small>COHORT TELEMETRY CONNECTED</small>
            </div>
            <nav aria-label="Diagnostic views">
              <button
                className={!modal ? "active" : ""}
                onClick={() => chooseView("body")}
              >
                Overview
              </button>
              <button onClick={() => setModal("genomics")}>Genomics</button>
              <button onClick={() => setModal("report")}>Report</button>
            </nav>
          </div>
        </header>

        {/* HORIZONTAL LINE OF FEATURES (Top Diagnostic Strip) */}
        <div className="dx-horizontal-feature-strip">
          <div className="dx-feat-kpi">
            <span className="dx-feat-kpi-label">COHORT TELEMETRY</span>
            <div className="dx-feat-kpi-val">
              <strong>100</strong> Patients · FreeStyle Libre CGM
            </div>
          </div>

          <div className="dx-feat-kpi">
            <span className="dx-feat-kpi-label">SELECTED SUBJECT</span>
            <div className="dx-feat-kpi-val">
              <strong>{currentPatient?.person_id}</strong> {currentPatient?.display_name} ({currentPatient?.age_years}y, {currentPatient?.sex.charAt(0).toUpperCase()})
            </div>
          </div>

          <div className="dx-feat-kpi">
            <span className="dx-feat-kpi-label">CLINICAL PROFILE</span>
            <div className="dx-feat-kpi-val">
              HbA1c <strong>{currentPatient?.hba1c_percent}%</strong> · BMI {currentPatient?.bmi} · {currentPatient?.years_with_diabetes}y T2DM
            </div>
          </div>

          <div className="dx-feat-kpi">
            <span className="dx-feat-kpi-label">INTERSTITIAL GLUCOSE</span>
            <div className="dx-feat-kpi-val">
              <strong style={{ color: Number(currentReading?.glucose_mg_dl || 120) >= 180 ? "#f87171" : Number(currentReading?.glucose_mg_dl || 120) >= 140 ? "#fbbf24" : "#34d399" }}>
                {Math.round(currentReading?.glucose_mg_dl || 120)}
              </strong>{" "}
              mg/dL at {currentReading?.time || "12:00"}
            </div>
          </div>

          <div className="dx-feat-kpi">
            <span className="dx-feat-kpi-label">2H INCIDENT RISK</span>
            <div className={`dx-feat-kpi-val ${(simulation?.baseline.risk_tier || "calm").toLowerCase()}`}>
              {simulation?.baseline.risk_tier || "CALM"} ({Math.round((simulation?.baseline.calibrated_spike_probability || 0.12) * 100)}% Spike Prob)
            </div>
          </div>

          <div className="dx-feat-kpi">
            <span className="dx-feat-kpi-label">ORGAN & DRUG STATUS</span>
            <div className="dx-feat-kpi-val">
              C-Pep {currentPatient?.fasting_c_peptide_nmol_l} nmol/L · eGFR {currentPatient?.egfr} · {currentPatient?.on_metformin === "yes" ? "Metformin" : "Non-Metformin"}
            </div>
          </div>
        </div>

        {/* WORKSTATION GRID */}
        <main className="dx-grid">
          {/* LEFT STACK: PATIENT REGISTRY (100 COHORT) + EHR CLINICAL DOSSIER */}
          <PatientRegistryPanel
            patients={patients}
            selectedPatientId={selectedPatientId}
            onSelectPatient={(pid) => setSelectedPatientId(pid)}
          />

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
                  {view === "body"
                    ? "Body twin"
                    : `${organInfo[view].name} twin`}
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
                {view === "body" ? "ANTERIOR WHOLE-BODY ATLAS" : `${organInfo[view].name.toUpperCase()} BIOPHYSICAL ATLAS`}
                <span>
                  PATIENT {selectedPatientId} · C-PEP {currentPatient?.fasting_c_peptide_nmol_l} nmol/L · eGFR {currentPatient?.egfr}
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
                <button
                  aria-pressed={labels}
                  onClick={() => setLabels(!labels)}
                >
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

          {/* RIGHT STACK: LIVE WEARABLES + GENOMICS/CONTEXT + GLUCOSE FORECAST TRAJECTORY */}
          <div className="dx-right-stack">
            {/* 1. Live Physiology with real wearable CGM data, timeline scrubber slider, play/pause controls */}
            <LiveWearablesPanel
              readings={readings}
              currentIndex={timelineIndex}
              onIndexChange={setTimelineIndex}
              isRunning={isStreaming}
              onToggleRunning={() => setIsStreaming(!isStreaming)}
              playbackSpeed={streamSpeed}
              onSpeedChange={setStreamSpeed}
            />

            {/* 2. Middle Row: Genomic Profile & Twin Context (Preserved per user instructions) */}
            <div className="dx-right-middle">
              <Panel
                title="GENOMIC PROFILE"
                tag="DNA"
                className="dx-genomics"
                action={() => setModal("genomics")}
              >
                <div className="dx-subheading">DOUBLE-HELIX EXPLORER</div>
                <div className="dx-genomic-body">
                  <button
                    className="dx-visual-button"
                    onClick={() => setModal("genomics")}
                    aria-label="Explore genomic concept"
                  >
                    <DnaHelix active={tick % 30} />
                  </button>
                  <div className="dx-base-pairs">
                    <strong>BASE PAIRS</strong>
                    {[
                      ["A – T", "ADENINE"],
                      ["G – C", "GUANINE"],
                      ["T – A", "THYMINE"],
                      ["C – G", "CYTOSINE"],
                    ].map(([a, b]) => (
                      <div key={a}>
                        <span>
                          <i />
                          {a}
                        </span>
                        <small>{b}</small>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="dx-sequence">
                  <span>SAMPLE SEQUENCE</span>
                  <div>
                    {bases.slice(0, 26).map((b, i) => (
                      <button
                        key={i}
                        className={i === tick % 26 ? "active" : ""}
                        aria-label={`Base ${i + 1}: ${b}`}
                        onClick={() => {
                          setSelectedBase(i);
                          setModal("genomics");
                        }}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
              </Panel>

              <Panel
                title={
                  view === "body"
                    ? "TWIN CONTEXT"
                    : `${organInfo[view].system.toUpperCase()} CONTEXT`
                }
                tag="PATIENT DATA"
                className="dx-reconstruction ot-context-panel"
              >
                <div className="ot-context-status">
                  <span className="ot-online-dot" />
                  EHR TELEMETRY ACTIVE ({selectedPatientId})
                </div>
                <dl>
                  {contextMetrics.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="ot-model-note">
                  <span>METABOLIC DIGITAL TWIN</span>
                  <p>Conditioned on patient C-peptide, eGFR, BMI & continuous CGM.</p>
                </div>
              </Panel>
            </div>
          </div>

          {/* FULL-WIDTH HORIZONTAL FEATURE ROW: GLUCOSE TRAJECTORY & 2H INCIDENT FORECAST */}
          <div className="dx-full-width-feature">
            <GlucoseForecastPanel
              simulation={simulation}
              currentReading={currentReading}
              historicalReadings={readings.slice(0, timelineIndex + 1)}
            />
          </div>
        </main>
      </div>

      {/* MODAL DIALOGS */}
      {modal && (
        <div
          className="dx-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <div
            className="dx-modal dx-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ot-dialog-title"
            tabIndex={-1}
            ref={modalRef}
          >
            <header>
              <div>
                <span>DIAGNOSTIC WORKSPACE / {modal.toUpperCase()}</span>
                <h2 id="ot-dialog-title">
                  {modal === "genomics"
                    ? "GENOMIC SEQUENCE EXPLORER"
                    : "CLINICAL DOSSIER REPORT"}
                </h2>
              </div>
              <button
                aria-label="Close diagnostic details"
                onClick={() => setModal(null)}
              >
                <X size={18} />
              </button>
            </header>
            {modal === "genomics" ? (
              <>
                <p>
                  Interactive double-helix visualization and nucleotide sequence inspection.
                </p>
                <div className="dx-genomic-modal-content">
                  <DnaHelix active={tick % 30} />
                  <div>
                    <h3>SEQUENCE EXPLORER</h3>
                    <div className="dx-sequence-grid">
                      {bases.map((b, i) => (
                        <button
                          key={i}
                          className={selectedBase === i ? "active" : ""}
                          aria-pressed={selectedBase === i}
                          aria-label={`Select base ${i + 1}: ${b}`}
                          onClick={() => setSelectedBase(i)}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                    <p>
                      BASE {selectedBase + 1} / {bases[selectedBase]}
                      <br />
                      COMPLEMENT /{" "}
                      {
                        (
                          { A: "T", T: "A", G: "C", C: "G" } as Record<
                            string,
                            string
                          >
                        )[bases[selectedBase]]
                      }
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <p>
                  Comprehensive clinical summary for {currentPatient?.display_name || selectedPatientId} derived from real EHR and wearable telemetry.
                </p>
                <dl className="dx-report-fields">
                  {[
                    ["PATIENT ID", currentPatient?.person_id || selectedPatientId],
                    ["NAME", currentPatient?.display_name || ""],
                    ["DIABETES PROFILE", `${currentPatient?.age_years}y, ${currentPatient?.sex}, BMI ${currentPatient?.bmi}, ${currentPatient?.years_with_diabetes}y T2DM`],
                    ["HbA1c & LABS", `HbA1c ${currentPatient?.hba1c_percent}%, FPG ${currentPatient?.fasting_glucose_mg_dl} mg/dL, C-Peptide ${currentPatient?.fasting_c_peptide_nmol_l} nmol/L`],
                    ["RENAL FUNCTION", `eGFR ${currentPatient?.egfr} mL/min, Creatinine ${currentPatient?.creatinine_mg_dl} mg/dL`],
                    ["MEDICATIONS", currentPatient?.hypoglycemic_agents_raw || "None"],
                    ["2H SPIKE PROBABILITY", `${Math.round((simulation?.baseline.calibrated_spike_probability || 0) * 100)}% (${simulation?.baseline.risk_tier || "CALM"} Risk)`],
                    ["PROJECTED PEAK", `${simulation?.baseline.predicted_peak_glucose_mg_dl || 160} mg/dL`],
                    ["OPTIMAL ACTION", simulation?.optimal_recommended_action || "Postprandial activity"],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                <button className="dx-export" onClick={exportReport}>
                  <ArrowDownToLine size={14} />
                  EXPORT PATIENT DOSSIER (JSON)
                </button>
              </>
            )}
            <div className="dx-modal-note">
              SHANGHAI T2DM CLINICAL COHORT · 100 PATIENTS · CALIBRATED DUAL-HEAD ML ENGINE
            </div>
          </div>
        </div>
      )}

      {/* NOTIFICATION TOAST */}
      {toast && (
        <div className="dx-toast" role="status">
          <Check size={14} />
          {toast}
          <button aria-label="Dismiss message" onClick={() => setToast("")}>
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
