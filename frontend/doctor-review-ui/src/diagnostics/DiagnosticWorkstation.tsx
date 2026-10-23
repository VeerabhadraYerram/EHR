import { useEffect, useRef, useState } from "react";
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
  Pause,
  Play,
  RotateCcw,
  X,
} from "lucide-react";
import {
  BodyFallback,
  BrainMap,
  DnaHelix,
  MriScanner,
  Thorax,
} from "./MedicalVisuals";
import { OrganVisual } from "./OrganVisuals";
import { organInfo, twinViews } from "./organDefinitions";
import type { Organ, TwinView } from "./organDefinitions";
import OrganScans from "./OrganScans";
import { demoProfiles } from "./demoData";
import "./diagnostics.css";
import "./organ-twins.css";

const organList: Organ[] = ["pancreas", "kidneys", "heart", "brain"];
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
function LedBar({ value, label }: { value: number; label?: string }) {
  return (
    <div className="dx-led-row">
      {label && <span>{label}</span>}
      <div
        className="dx-led-track"
        role="img"
        aria-label={`${label || "Progress"} ${value}%`}
      >
        {Array.from({ length: 48 }, (_, i) => (
          <i key={i} className={(i / 48) * 100 < value ? "lit" : ""} />
        ))}
      </div>
      <strong>{value}%</strong>
    </div>
  );
}
function Wave({
  type = "ecg",
  compact = false,
}: {
  type?: "ecg" | "gentle";
  compact?: boolean;
}) {
  const path = Array.from({ length: compact ? 4 : 9 }, (_, i) => {
    const x = i * 80;
    return type === "ecg"
      ? `${i ? "L" : "M"}${x} 30l14 0 3 -3 3 3 8 0 3 6 3 -33 3 45 3 -18 9 0q6 -12 12 0l16 0`
      : `${i ? "L" : "M"}${x} 27q8 0 12 -6t8 0q5 8 10 2l6 -14 4 19 5 -4 12 4 13 -1`;
  }).join(" ");
  return (
    <svg
      viewBox={`0 0 ${compact ? 320 : 720} 62`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className={`dx-wave ${compact ? "compact" : ""}`}
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={compact ? 1.2 : 1.3}
      />
    </svg>
  );
}

export default function DiagnosticWorkstation() {
  const [view, setView] = useState<TwinView>("body");
  const [subject, setSubject] = useState<keyof typeof demoProfiles>("DEMO A");
  const [running, setRunning] = useState(true);
  const [tick, setTick] = useState(0);
  const [modal, setModal] = useState<"genomics" | "report" | null>(null);
  const [selectedBase, setSelectedBase] = useState(0);
  const [angle, setAngle] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [labels, setLabels] = useState(true);
  const [structure, setStructure] = useState(0);
  const [bodyReady, setBodyReady] = useState(true);
  const [toast, setToast] = useState("");
  const [brainReady, setBrainReady] = useState(true);
  const [sequence, setSequence] = useState("T2");
  const [scan, setScan] = useState(84);
  const [scanning, setScanning] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const profile = demoProfiles[subject];
  const hr = parseInt(profile.heartRate, 10);
  useEffect(() => {
    if (!scanning) return;
    if (scan >= 100) {
      setScanning(false);
      setToast("Illustrative acquisition complete.");
      return;
    }
    const timer = setTimeout(
      () => setScan((previous) => Math.min(100, previous + 2)),
      120,
    );
    return () => clearTimeout(timer);
  }, [scan, scanning]);
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
  useEffect(() => {
    document.title = "EHR / Organ Twin Workstation";
  }, []);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modalRef.current?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
      if (e.key === "Tab") {
        const items = Array.from(
          modalRef.current?.querySelectorAll<HTMLElement>(
            'button,a[href],select,input,summary,[tabindex="0"]',
          ) || [],
        ).filter((el) => el.offsetParent !== null);
        if (!items.length) return;
        if (
          e.shiftKey &&
          (document.activeElement === items[0] ||
            document.activeElement === modalRef.current)
        ) {
          e.preventDefault();
          items[items.length - 1].focus();
        } else if (
          !e.shiftKey &&
          document.activeElement === items[items.length - 1]
        ) {
          e.preventDefault();
          items[0].focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", listener);
      previous?.focus();
    };
  }, [modal]);
  const exportReport = () => {
    const report = {
      title: "Organ twin frontend demonstration",
      source: "fictional frontend fixtures",
      backend_connected: false,
      subject,
      selected_view: view,
      illustrative_metrics: profile,
      anatomy: "illustrative atlas; not patient reconstruction",
      functional_organ_models: "not connected",
      scans: "local browser previews only",
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `organ-twin-${subject.toLowerCase().replace(" ", "-")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast("Demo report exported.");
  };
  const metrics =
    view === "kidneys"
      ? [
          ["eGFR", profile.egfr],
          ["CREATININE", profile.creatinine],
          ["URINE ALBUMIN", "Not included"],
        ]
      : view === "heart"
        ? [
            ["HEART RATE", profile.heartRate],
            ["BLOOD PRESSURE", profile.bloodPressure],
            ["LDL", profile.ldl],
          ]
        : view === "brain"
          ? [
              ["NEUROLOGICAL DATA", "Not included"],
              ["PATIENT BRAIN MRI", "Not attached"],
              ["GLUCOSE CONTEXT", "Diabetes demo"],
            ]
          : [
              ["HbA1c", profile.hba1c],
              ["FASTING C-PEPTIDE", profile.cPeptide],
              ["RENAL CONTEXT", profile.egfr],
            ];
  return (
    <div
      className={`diagnostic-workstation ot-workstation ${running ? "dx-running" : "dx-paused"}`}
    >
      <div className="dx-frame-line" />
      <div className="ot-workstation-content" inert={modal ? true : undefined}>
        <header className="dx-header">
          <div className="dx-brand">
            <span className="dx-cross">
              <Cross size={31} strokeWidth={0.8} />
            </span>
            <div>
              <p>
                MEDICAL INTELLIGENCE <span>/</span> DIAGNOSTIC WORKSTATION
              </p>
              <h1>BODY & ORGAN TWINS</h1>
              <span>
                METABOLIC <i>/</i> RENAL <i>/</i> CARDIOVASCULAR <i>/</i>{" "}
                NEUROLOGICAL
              </span>
            </div>
          </div>
          <div className="dx-subject">
            <label htmlFor="dx-subject">DEMONSTRATION</label>
            <div>
              <select
                id="dx-subject"
                value={subject}
                onChange={(e) =>
                  setSubject(e.target.value as keyof typeof demoProfiles)
                }
              >
                {Object.keys(demoProfiles).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <ChevronDown size={10} />
            </div>
            <span>{profile.label.toUpperCase()}</span>
          </div>
          <div className="dx-header-actions">
            <div className="dx-mode-row">
              <span>
                <i /> FRONTEND PREVIEW
              </span>
              <small>NO BACKEND CONNECTION</small>
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
        <main className="dx-grid">
          <div className="dx-left-stack">
            <Panel
              title="NEURAL RECONSTRUCTION"
              tag="CONCEPT"
              className="dx-neural"
              action={() => {
                chooseView("brain");
              }}
            >
              <div className="dx-subheading">
                CORTICAL SURFACE / OBLIQUE VIEW
                <span>
                  L <i>R</i>
                </span>
              </div>
              <button
                className="dx-visual-button"
                aria-label="Focus neural anatomy"
                onClick={() => chooseView("brain")}
              >
                {brainReady ? (
                  <img
                    className="dx-brain-image"
                    src="/diagnostics/brain.png"
                    alt="Illustrative lateral cortical brain reconstruction"
                    onError={() => setBrainReady(false)}
                  />
                ) : (
                  <BrainMap />
                )}
              </button>
              <div className="dx-panel-footer">
                <span>ILLUSTRATIVE MAP</span>
                <span>CONCEPT ANATOMY</span>
                <div className="dx-small-leds">
                  ▰▰▰▰▰▰▰▰▰<i>▰▰</i>
                </div>
              </div>
            </Panel>
            <OrganScans key={subject} view={view} />
            <Panel title="THORACIC RADIOGRAPH" tag="AP" className="dx-thorax">
              <div className="dx-thorax-content">
                <button
                  className="dx-visual-button"
                  aria-label="Focus cardiopulmonary anatomy"
                  onClick={() => chooseView("heart")}
                >
                  <Thorax />
                </button>
                <div className="dx-thorax-legend">
                  {[
                    ["LUNG FIELDS", "BILATERAL OVERLAY"],
                    ["RIB CAGE", "OSSEOUS STRUCTURE"],
                    ["SPINE", "ALIGNMENT MAPPING"],
                    ["MEDIASTINUM", "REGION OF INTEREST"],
                  ].map(([a, b]) => (
                    <button
                      key={a}
                      onClick={() => {
                        chooseView("heart");
                      }}
                    >
                      <i />
                      <span>
                        <strong>{a}</strong>
                        <small>{b}</small>
                      </span>
                    </button>
                  ))}
                  <span>CONCEPTUAL X-RAY</span>
                </div>
              </div>
            </Panel>
          </div>
          <Panel
            title={
              view === "body"
                ? "ANATOMICAL DIGITAL TWIN"
                : `${organInfo[view].name.toUpperCase()} DIGITAL TWIN`
            }
            tag="ILLUSTRATIVE"
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
                  <div className="ot-body-registration">
                    <div className="ot-body-art">
                      {bodyReady ? (
                        <img
                          src="/diagnostics/anatomy.png"
                          alt="Illustrative full-body anatomical reference"
                          onError={() => setBodyReady(false)}
                        />
                      ) : (
                        <BodyFallback />
                      )}
                    </div>
                    {organList.map((organ) => (
                      <button
                        key={organ}
                        className={`ot-body-hotspot ${organ}`}
                        onClick={() => chooseView(organ)}
                        aria-label={`Select ${organInfo[organ].name.toLowerCase()} on body`}
                      >
                        <span className="ot-hotspot-dot" />
                        {labels && (
                          <span className="ot-hotspot-label">
                            {organInfo[organ].name}
                            <ArrowRight size={10} />
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className={`ot-isolated-organ ${view}`}>
                    <OrganVisual organ={view} />
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
                ILLUSTRATIVE ANATOMY
                <span>
                  {view === "body"
                    ? "ANTERIOR VIEW"
                    : "ATLAS VIEW · NOT A PATIENT SCAN"}
                </span>
              </div>
            </div>
            {view !== "body" && (
              <div className="ot-organ-insight" aria-live="polite">
                <span>
                  {organInfo[view].structures[structure].toUpperCase()}
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
          <div className="dx-right-stack">
            <Panel
              title="LIVE PHYSIOLOGY"
              tag="DEMO SIGNAL"
              className="dx-physiology"
            >
              <div className="dx-vitals">
                {[
                  [String(hr), "bpm", "HEART RATE"],
                  ["98", "%", "OXYGEN SAT."],
                  ["16", "/min", "RESPIRATION"],
                  ["36.7", "°C", "TEMPERATURE"],
                ].map(([value, unit, label]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>
                      {value}
                      <small>{unit}</small>
                    </strong>
                    <Wave compact type="gentle" />
                  </div>
                ))}
              </div>
              <div className="dx-ecg-caption">
                <strong>ECG / LEAD II</strong>
                <span>25 mm/s · 10 mm/mV</span>
                <button
                  aria-label={
                    running ? "Pause demo signals" : "Resume demo signals"
                  }
                  onClick={() => setRunning(!running)}
                >
                  {running ? <Pause size={11} /> : <Play size={11} />}
                </button>
              </div>
              <div className="dx-ecg-display">
                <div className="dx-ecg-grid" />
                <Wave />
                <i className="dx-ecg-cursor" />
              </div>
              <div className="dx-physiology-footer">
                <LedBar value={96} label="SIGNAL QUALITY" />
                <span>ILLUSTRATIVE METRICS</span>
              </div>
            </Panel>
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
                  <span>ILLUSTRATIVE SEQUENCE</span>
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
                tag="DEMO"
                className="dx-reconstruction ot-context-panel"
              >
                <div className="ot-context-status">
                  <span className="ot-online-dot" />
                  FICTIONAL SAMPLE DATA
                </div>
                <dl>
                  {metrics.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="ot-model-note">
                  <span>VISUAL TWIN PROTOTYPE</span>
                  <p>Organ physiology models are not connected.</p>
                </div>
              </Panel>
            </div>
            <Panel
              title="MAGNETIC RESONANCE ACQUISITION"
              tag="MR / 3D"
              className="dx-acquisition"
            >
              <div className="dx-acquisition-body">
                <div className="dx-scanner">
                  <MriScanner />
                  <span>SCANNER / ISOMETRIC MODEL</span>
                </div>
                <div className="dx-acquisition-controls">
                  <div className="dx-sequences" aria-label="MRI sequence">
                    {["T1", "T2", "FLAIR", "DWI"].map((s) => (
                      <button
                        key={s}
                        onClick={() => setSequence(s)}
                        className={sequence === s ? "active" : ""}
                        aria-pressed={sequence === s}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <div className="dx-acquisition-label">
                    <strong>VOLUME ACQUISITION</strong>
                    <span>{scan}%</span>
                  </div>
                  <LedBar value={scan} />
                  <div className="dx-acquisition-caption">
                    <span>{Math.round((scan / 100) * 152)} / 152 FRAMES</span>
                    <span>SEQUENCE 04 / 08</span>
                  </div>
                  <div className="dx-acquisition-meta">
                    <span>
                      TR <strong>3200 ms</strong>
                    </span>
                    <span>
                      TE <strong>88 ms</strong>
                    </span>
                    <span>
                      SLICE <strong>1.0 mm</strong>
                    </span>
                  </div>
                  <button
                    className="dx-scan-action"
                    onClick={() => {
                      if (scanning) {
                        setScanning(false);
                      } else {
                        setScan(0);
                        setScanning(true);
                      }
                    }}
                  >
                    {scanning ? <Pause size={9} /> : <Play size={9} />}{" "}
                    {scanning
                      ? "PAUSE SIMULATED ACQUISITION"
                      : "RUN SIMULATED ACQUISITION"}
                  </button>
                </div>
              </div>
            </Panel>
          </div>
        </main>
        <footer className="dx-footer">
          <span>
            <Check size={11} /> FRONTEND DESIGN PREVIEW
          </span>
          <span>ILLUSTRATIVE ANATOMY & DEMO DATA · NO CLINICAL INFERENCE</span>
          <span>BACKEND DISCONNECTED</span>
        </footer>
      </div>
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
                    : "DEMONSTRATION REPORT"}
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
                  Illustrative DNA sequence. No patient sequencing data is
                  connected.
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
                  Fictional frontend demonstration. All measurements and
                  illustrations are sample content.
                </p>
                <dl className="dx-report-fields">
                  {[
                    ["PROFILE", subject],
                    ["SELECTED TWIN", view.toUpperCase()],
                    ["BACKEND", "DISCONNECTED"],
                    ["DATA SOURCE", "FICTIONAL UI FIXTURES"],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                <button className="dx-export" onClick={exportReport}>
                  <ArrowDownToLine size={14} />
                  EXPORT DEMO REPORT
                </button>
              </>
            )}
            <div className="dx-modal-note">
              FRONTEND ONLY · NO PATIENT DATA OR FUNCTIONAL MODEL
            </div>
          </div>
        </div>
      )}
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
