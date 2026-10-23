import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDownToLine,
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
  BrainSlice,
  DnaHelix,
  MriScanner,
  Thorax,
} from "./MedicalVisuals";
import "./diagnostics.css";

type Tab = "overview" | "imaging" | "genomics" | "report";
type Layer = "surface" | "skeleton" | "organs" | "vascular";
const systems = ["NEURAL", "CARDIAC", "RESPIRATORY", "VASCULAR", "SKELETAL"];
const bases = "ATCGGATCGAGCTAGCATCGTAGCATGCGATC".split("");
function Panel({
  number,
  title,
  tag,
  className = "",
  children,
  action,
}: {
  number: string;
  title: string;
  tag?: string;
  className?: string;
  children: ReactNode;
  action?: () => void;
}) {
  return (
    <section className={`dx-panel ${className}`}>
      <header className="dx-panel-heading">
        <h2>
          <span>{number} /</span> {title}
        </h2>
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
  const [tab, setTab] = useState<Tab>("overview");
  const [running, setRunning] = useState(true);
  const [tick, setTick] = useState(0);
  const [selectedBase, setSelectedBase] = useState(0);
  const [sequence, setSequence] = useState("T2");
  const [plane, setPlane] = useState<"axial" | "coronal" | "sagittal">("axial");
  const [focus, setFocus] = useState("NEURAL");
  const [layers, setLayers] = useState<Layer[]>([
    "surface",
    "skeleton",
    "organs",
    "vascular",
  ]);
  const [oblique, setOblique] = useState(false);
  const [imageReady, setImageReady] = useState(true);
  const [brainReady, setBrainReady] = useState(true);
  const [subject, setSubject] = useState("0248");
  const [toast, setToast] = useState("");
  const [scan, setScan] = useState(84);
  const [scanning, setScanning] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const hr =
    68 +
    (subject === "0481" ? 5 : 0) +
    (running ? Math.round(Math.sin(tick / 8)) : 0);
  useEffect(() => {
    document.title = "EHR / Diagnostic Workstation";
  }, []);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);
  useEffect(() => {
    if (!scanning) return;
    const timer = setInterval(
      () =>
        setScan((p) => {
          if (p >= 100) {
            setScanning(false);
            setToast("Illustrative acquisition complete.");
            return 100;
          }
          return p + 1;
        }),
      160,
    );
    return () => clearInterval(timer);
  }, [scanning]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (tab === "overview") return;
    const previous = document.activeElement as HTMLElement;
    modalRef.current?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTab("overview");
      if (e.key === "Tab") {
        const items = modalRef.current?.querySelectorAll<HTMLElement>(
          'button,a[href],select,input,[tabindex="0"]',
        );
        if (!items?.length) return;
        if (
          e.shiftKey &&
          (document.activeElement === items[0] ||
            document.activeElement === modalRef.current)
        ) {
          e.preventDefault();
          items[items.length - 1].focus();
        }
        if (!e.shiftKey && document.activeElement === items[items.length - 1]) {
          e.preventDefault();
          items[0].focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.removeEventListener("keydown", listener);
      previous?.focus();
    };
  }, [tab]);
  const toggleLayer = (layer: Layer) =>
    setLayers((prev) =>
      prev.includes(layer) ? prev.filter((l) => l !== layer) : [...prev, layer],
    );
  const exportReport = () => {
    const data = {
      title: "Illustrative diagnostic workstation",
      mode: "simulation",
      subject: `ANONYMOUS / ${subject}`,
      clinical_use: false,
      metrics: {
        heart_rate: hr,
        oxygen_saturation: 98,
        respiration: 16,
        temperature: 36.7,
      },
      imaging: { sequence, plane },
      visible_layers: layers,
      note: "All signals and imaging are illustrative. No diagnostic model or patient device is connected.",
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `diagnostic-concept-${subject}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setToast("Concept report exported.");
  };
  return (
    <div
      className={`diagnostic-workstation ${running ? "dx-running" : "dx-paused"}`}
    >
      <div className="dx-frame-line" />
      <header className="dx-header">
        <div className="dx-brand">
          <span className="dx-cross">
            <Cross size={31} strokeWidth={0.8} />
          </span>
          <div>
            <p>
              MEDICAL INTELLIGENCE <span>/</span> DIAGNOSTIC WORKSTATION
            </p>
            <h1>FULL BODY DIAGNOSTICS</h1>
            <span>
              MULTIMODAL IMAGING <i>/</i> DIGITAL ANATOMY <i>/</i> GENOMIC
              EXPLORER
            </span>
          </div>
        </div>
        <div className="dx-subject">
          <label htmlFor="dx-subject">SUBJECT</label>
          <div>
            ANONYMOUS /{" "}
            <select
              id="dx-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              <option>0248</option>
              <option>0481</option>
            </select>
            <ChevronDown size={10} />
          </div>
          <span>
            SESSION 07.{subject} <i>•</i> CONCEPT
          </span>
        </div>
        <div className="dx-header-actions">
          <div className="dx-mode-row">
            <span>
              <i /> SIMULATION MODE
            </span>
            <small>WORKSPACE / 01</small>
          </div>
          <nav aria-label="Diagnostic views">
            {(["overview", "imaging", "genomics", "report"] as Tab[]).map(
              (t) => (
                <button
                  key={t}
                  className={tab === t ? "active" : ""}
                  onClick={() => setTab(t)}
                  aria-pressed={tab === t}
                >
                  {t}
                </button>
              ),
            )}
          </nav>
        </div>
      </header>
      <main className="dx-grid">
        <div className="dx-left-stack">
          <Panel
            number="01"
            title="NEURAL RECONSTRUCTION"
            tag="3D"
            className="dx-neural"
            action={() => {
              setFocus("NEURAL");
              setTab("imaging");
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
              onClick={() => setFocus("NEURAL")}
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
              <span>MESH / 3D</span>
              <span>128 SLICES</span>
              <div className="dx-small-leds">
                ▰▰▰▰▰▰▰▰▰<i>▰▰</i>
              </div>
            </div>
          </Panel>
          <Panel
            number="02"
            title="MULTIPLANAR MRI"
            tag={sequence}
            className="dx-mri"
          >
            <div className="dx-mri-planes">
              {(["axial", "coronal", "sagittal"] as const).map((p, i) => (
                <button
                  key={p}
                  aria-label={`Select ${p} MRI plane`}
                  onClick={() => setPlane(p)}
                  className={plane === p ? "active" : ""}
                  aria-pressed={plane === p}
                >
                  <BrainSlice plane={p} active={plane === p} />
                  <strong>{p}</strong>
                  <span>
                    {["Z 064 / 128", "Y 032 / 096", "X 048 / 096"][i]}
                  </span>
                </button>
              ))}
            </div>
          </Panel>
          <Panel
            number="03"
            title="THORACIC RADIOGRAPH"
            tag="AP"
            className="dx-thorax"
          >
            <div className="dx-thorax-content">
              <button
                className="dx-visual-button"
                aria-label="Focus cardiopulmonary anatomy"
                onClick={() => setFocus("CARDIAC")}
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
                      setFocus(a === "SPINE" ? "SKELETAL" : "CARDIAC");
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
          number="04"
          title="ANATOMICAL DIGITAL TWIN"
          tag="VOLUMETRIC"
          className="dx-anatomy-panel"
        >
          <div className="dx-anatomy-kicker">
            <span>FULL-BODY MULTIMODAL RECONSTRUCTION</span>
            <span className="dx-model-badge">
              <i /> ILLUSTRATIVE ANATOMY
            </span>
          </div>
          <div className="dx-anatomy-stage">
            <div className="dx-stage-radial" />
            <div className="dx-stage-rings">
              <i />
              <i />
              <i />
            </div>
            <svg
              className="dx-anatomy-connectors"
              viewBox="0 0 600 720"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <g stroke="#3e7c86" fill="none" strokeWidth=".65">
                <path d="M63 95H128L150 84H300M300 84L466 128H500L518 139H560" />
                <path d="M25 230H124L151 219H286M303 310L462 322H500L522 338H560" />
                <path d="M30 392H133L157 379H300M300 534L470 573H500L525 591H560" />
                <path d="M28 594H128L149 583H280" />
              </g>
              {[85, 219, 379, 583].map((y, i) => (
                <g key={y}>
                  <circle cx={i % 2 ? 286 : 300} cy={y} r="3" fill="#78dbcb" />
                  <circle
                    cx={i % 2 ? 286 : 300}
                    cy={y}
                    r="8"
                    fill="none"
                    stroke="#4ba49d"
                    strokeWidth=".4"
                  />
                </g>
              ))}
              <g stroke="#3e6b78" strokeWidth=".4">
                {Array.from({ length: 13 }, (_, i) => (
                  <g key={i}>
                    <line x1="180" x2="185" y1={48 + i * 48} y2={48 + i * 48} />
                    <line x1="420" x2="425" y1={48 + i * 48} y2={48 + i * 48} />
                  </g>
                ))}
              </g>
            </svg>
            <div
              className={`dx-body-image ${oblique ? "oblique" : ""} ${!layers.includes("skeleton") ? "skeleton-muted" : ""}`}
            >
              {imageReady ? (
                <img
                  src="/diagnostics/anatomy.png"
                  alt="Illustrative cyan anatomical wireframe with skeleton, lungs, and major organs"
                  onError={() => setImageReady(false)}
                />
              ) : (
                <BodyFallback />
              )}
            </div>
            <svg
              className="dx-body-overlays"
              viewBox="0 0 300 700"
              aria-hidden="true"
            >
              {layers.includes("surface") && (
                <ellipse
                  cx="150"
                  cy="326"
                  rx="94"
                  ry="265"
                  fill="none"
                  stroke="#3c8394"
                  opacity=".13"
                  strokeDasharray="1 6"
                />
              )}
              {layers.includes("organs") && (
                <g fill="#6de0cd" opacity=".22">
                  <ellipse cx="133" cy="204" rx="19" ry="31" />
                  <ellipse cx="171" cy="204" rx="19" ry="31" />
                  <path d="M141 211Q163 189 174 212L159 239Z" />
                  <ellipse cx="145" cy="277" rx="22" ry="13" />
                </g>
              )}
              {layers.includes("vascular") && (
                <g stroke="#68d4c5" fill="none" opacity=".3" strokeWidth="1">
                  <path d="M152 160V330L119 523M152 330L185 523M151 182L88 291M153 182L216 291" />
                </g>
              )}
            </svg>
            {layers.includes("surface") && (
              <div className="dx-scan-plane">
                <i />
              </div>
            )}
            <button
              className={`dx-callout left neural ${focus === "NEURAL" ? "focused" : ""}`}
              onClick={() => setFocus("NEURAL")}
            >
              <small>01 / CRANIAL</small>
              <strong>NEURAL MAP</strong>
              <span>CORTICAL RECONSTRUCTION</span>
            </button>
            <button
              className={`dx-callout left cardiac ${focus === "CARDIAC" ? "focused" : ""}`}
              onClick={() => setFocus("CARDIAC")}
            >
              <small>02 / THORACIC</small>
              <strong>CARDIOPULMONARY</strong>
              <span>ECG + RADIOGRAPH FUSION</span>
            </button>
            <button
              className={`dx-callout left abdominal ${focus === "RESPIRATORY" ? "focused" : ""}`}
              onClick={() => setFocus("RESPIRATORY")}
            >
              <small>03 / ABDOMINAL</small>
              <strong>ORGAN MAPPING</strong>
              <span>SEGMENTED SOFT TISSUE</span>
            </button>
            <button
              className={`dx-callout left skeletal ${focus === "SKELETAL" ? "focused" : ""}`}
              onClick={() => setFocus("SKELETAL")}
            >
              <small>04 / OSSEOUS</small>
              <strong>SKELETAL MODEL</strong>
              <span>LOWER EXTREMITY MAPPING</span>
            </button>
            <div className="dx-callout right cranial">
              <small>STRUCTURAL / 01</small>
              <strong>CRANIAL VOLUME</strong>
              <span>MULTIPLANAR MRI DATA</span>
            </div>
            <div className="dx-callout right scan">
              <small>ACQUISITION / {subject}</small>
              <strong>ACTIVE SCAN PLANE</strong>
              <span>VOLUMETRIC SECTION</span>
            </div>
            <button
              className={`dx-callout right vascular ${focus === "VASCULAR" ? "focused" : ""}`}
              onClick={() => setFocus("VASCULAR")}
            >
              <small>VASCULAR / 03</small>
              <strong>FLOW NETWORK</strong>
              <span>ARTERIAL TREE OVERLAY</span>
            </button>
            <div className="dx-callout right joint">
              <small>KINEMATIC / 04</small>
              <strong>JOINT GEOMETRY</strong>
              <span>LANDMARK REGISTRATION</span>
            </div>
            <div className="dx-orientation">
              <svg viewBox="0 0 75 60" aria-hidden="true">
                <path
                  d="M16 40H64M16 40V7M16 40L4 24"
                  stroke="#67aaa9"
                  strokeWidth=".8"
                  fill="none"
                />
                <circle cx="16" cy="40" r="2" fill="#71c8c0" />
                <text x="66" y="43">
                  X
                </text>
                <text x="14" y="5">
                  Z
                </text>
                <text x="0" y="23">
                  Y
                </text>
              </svg>
            </div>
            <button className="dx-angle" onClick={() => setOblique(!oblique)}>
              <RotateCcw size={11} />
              <span>
                ROTATION {oblique ? "025°" : "000°"}
                <strong>
                  {oblique ? "OBLIQUE" : "FRONT"} / {focus}
                </strong>
              </span>
            </button>
          </div>
          <div className="dx-layer-controls">
            <div>
              {(["surface", "skeleton", "organs", "vascular"] as Layer[]).map(
                (l) => (
                  <button
                    key={l}
                    aria-pressed={layers.includes(l)}
                    onClick={() => toggleLayer(l)}
                  >
                    <span className={layers.includes(l) ? "checked" : ""}>
                      {layers.includes(l) && <Check size={8} />}
                    </span>
                    {l}
                  </button>
                ),
              )}
            </div>
            <span>LAYERS / 0{layers.length}</span>
          </div>
        </Panel>

        <div className="dx-right-stack">
          <Panel
            number="05"
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
              number="06"
              title="GENOMIC PROFILE"
              tag="DNA"
              className="dx-genomics"
            >
              <div className="dx-subheading">DOUBLE-HELIX RECONSTRUCTION</div>
              <div className="dx-genomic-body">
                <button
                  className="dx-visual-button"
                  onClick={() => setTab("genomics")}
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
                  ].map(([a, b], i) => (
                    <div key={a}>
                      <span>
                        <i style={{ opacity: 1 - i * 0.15 }} />
                        {a}
                      </span>
                      <small>{b}</small>
                    </div>
                  ))}
                  <small>SEQUENCE / 032</small>
                </div>
              </div>
              <div className="dx-sequence">
                <span>SEQUENCE WINDOW</span>
                <div>
                  {bases.slice(0, 26).map((b, i) => (
                    <button
                      className={i === tick % 26 ? "active" : ""}
                      key={i}
                      aria-label={`Base ${i + 1}: ${b}`}
                      onClick={() => {
                        setSelectedBase(i);
                        setTab("genomics");
                      }}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>
            </Panel>
            <Panel
              number="07"
              title="RECONSTRUCTION"
              tag="STATUS"
              className="dx-reconstruction"
            >
              <div className="dx-reconstruction-top">
                <div className="dx-system-ring">
                  <svg viewBox="0 0 150 150" aria-hidden="true">
                    {[66, 59, 52, 45].map((r, i) => (
                      <circle
                        key={r}
                        cx="75"
                        cy="75"
                        r={r}
                        fill="none"
                        stroke={i % 2 ? "#579ba8" : "#65c5b6"}
                        strokeWidth={i === 1 ? 1.8 : 0.7}
                        strokeDasharray={`${r * 5.3} ${r * 1.2}`}
                        transform={`rotate(${-90 + i * 28} 75 75)`}
                      />
                    ))}
                  </svg>
                  <strong>
                    08<span>SYSTEMS</span>
                  </strong>
                </div>
                <div className="dx-systems">
                  {systems.map((s) => (
                    <button
                      key={s}
                      className={focus === s ? "active" : ""}
                      onClick={() => setFocus(s)}
                    >
                      <i />
                      <span>{s}</span>
                      <small>MAPPED</small>
                    </button>
                  ))}
                </div>
              </div>
              <div className="dx-registration">
                <span>LAYER REGISTRATION</span>
                <LedBar value={100} label="BONE GEOMETRY" />
                <LedBar value={92} label="SOFT TISSUE" />
                <LedBar value={86} label="VASCULAR TREE" />
              </div>
            </Panel>
          </div>
          <Panel
            number="08"
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
          <Cross size={12} strokeWidth={1} /> DIAGNOSTIC WORKSTATION / CONCEPT
          UI
        </span>
        <span>
          ALL SIGNALS AND IMAGING ARE ILLUSTRATIVE — NOT FOR CLINICAL USE
        </span>
        <span>
          VECTOR + ANATOMICAL ILLUSTRATION <i>/</i> 16:9
        </span>
      </footer>
      {tab !== "overview" && (
        <div className="dx-modal-backdrop" onClick={() => setTab("overview")}>
          <div
            className="dx-modal dx-panel"
            role="dialog"
            aria-modal="true"
            aria-label={`${tab} details`}
            ref={modalRef}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <div>
                <span>DIAGNOSTIC WORKSPACE / {tab.toUpperCase()}</span>
                <h2>
                  {tab === "imaging"
                    ? "MULTIPLANAR IMAGING"
                    : tab === "genomics"
                      ? "GENOMIC SEQUENCE EXPLORER"
                      : "SESSION REPORT"}
                </h2>
              </div>
              <button
                aria-label="Close diagnostic details"
                onClick={() => setTab("overview")}
              >
                <X size={18} />
              </button>
            </header>
            {tab === "imaging" ? (
              <>
                <p>
                  Illustrative anatomical views. Select a plane or pulse
                  sequence to inspect the concept.
                </p>
                <div className="dx-modal-planes">
                  {(["axial", "coronal", "sagittal"] as const).map((p) => (
                    <button
                      key={p}
                      aria-label={`Select ${p} MRI plane`}
                      onClick={() => setPlane(p)}
                      className={plane === p ? "active" : ""}
                    >
                      <BrainSlice plane={p} active={plane === p} />
                      <span>{p}</span>
                    </button>
                  ))}
                </div>
                <div className="dx-sequences">
                  {["T1", "T2", "FLAIR", "DWI"].map((s) => (
                    <button
                      key={s}
                      onClick={() => setSequence(s)}
                      className={sequence === s ? "active" : ""}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <small>
                  SELECTED: {plane.toUpperCase()} / {sequence} · CONCEPTUAL
                  IMAGING, NO DICOM SOURCE
                </small>
              </>
            ) : tab === "genomics" ? (
              <>
                <p>
                  A visual sequence explorer with illustrative bases. No patient
                  sequencing data is connected.
                </p>
                <div className="dx-genomic-modal-content">
                  <DnaHelix active={tick % 30} />
                  <div>
                    <h3>SEQUENCE WINDOW / 032</h3>
                    <div className="dx-sequence-grid">
                      {bases.map((b, i) => (
                        <button
                          key={i}
                          className={selectedBase === i ? "active" : ""}
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
                  Anonymous demonstration session. Values describe the visual
                  concept and do not represent a clinical assessment.
                </p>
                <dl className="dx-report-fields">
                  {[
                    ["SUBJECT", `ANONYMOUS / ${subject}`],
                    ["MODE", "ILLUSTRATIVE SIMULATION"],
                    ["HEART RATE", `${hr} bpm`],
                    ["OXYGEN SATURATION", "98%"],
                    ["ACTIVE SEQUENCE", `${sequence} / ${plane.toUpperCase()}`],
                    ["VISIBLE LAYERS", layers.join(", ").toUpperCase()],
                  ].map(([a, b]) => (
                    <div key={a}>
                      <dt>{a}</dt>
                      <dd>{b || "NONE"}</dd>
                    </div>
                  ))}
                </dl>
                <button className="dx-export" onClick={exportReport}>
                  <ArrowDownToLine size={14} />
                  EXPORT CONCEPT REPORT
                </button>
              </>
            )}
            <div className="dx-modal-note">
              <Layers3 size={12} /> ILLUSTRATIVE PROTOTYPE · NO LIVE MEDICAL
              DEVICE CONNECTION
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
