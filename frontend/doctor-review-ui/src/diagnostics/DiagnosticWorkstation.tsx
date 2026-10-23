import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  ClipboardCheck,
  Dna,
  FileText,
  FlaskConical,
  HeartPulse,
  LayoutDashboard,
  Menu,
  RefreshCw,
  Users,
  X,
} from "lucide-react";
import type {
  InterventionSpec,
  Patient,
  PatientSimulation,
  Reading,
  SimulationBranch,
} from "./types";
import {
  downloadJson,
  fetchPatientDates,
  fetchPatientReadings,
  fetchPatientSimulation,
  fetchPatientsList,
  requestJson,
} from "./patientService";
import { computeKineticTelemetry } from "./kineticEngine";
import PatientRegistryPanel from "./PatientRegistryPanel";
import GlucoseForecastPanel from "./GlucoseForecastPanel";
import LiveWearablesPanel from "./LiveWearablesPanel";
import AnatomyWorkspace from "./AnatomyWorkspace";
import ClinicalWorkflowPage from "./ClinicalWorkflowPage";
import { DnaHelix } from "./MedicalVisuals";
import "./diagnostics.css";
import "./organ-twins.css";
import "./patient-workstation.css";
import "./clinical-app.css";

const pages = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    description: "A clear view of the patient, right now.",
  },
  {
    id: "patients",
    label: "Patients",
    icon: Users,
    description: "Browse the cohort and inspect the clinical record.",
  },
  {
    id: "forecast",
    label: "Glucose forecast",
    icon: Activity,
    description: "One patient. One timestamp. One model prediction.",
  },
  {
    id: "scenarios",
    label: "What-if scenarios",
    icon: FlaskConical,
    description: "Explore how physiological assumptions change a trajectory.",
  },
  {
    id: "anatomy",
    label: "Anatomical twins",
    icon: HeartPulse,
    description: "Explore the existing body and organ atlas.",
  },
  {
    id: "review",
    label: "Clinical review",
    icon: ClipboardCheck,
    description: "Review source facts, reconcile conflicts and approve care.",
  },
  {
    id: "genomics",
    label: "Genomics explorer",
    icon: Dna,
    description: "An interactive educational sequence explorer.",
  },
  {
    id: "reports",
    label: "Reports & exports",
    icon: FileText,
    description: "Inspect and export the same prediction you see on screen.",
  },
  {
    id: "evidence",
    label: "Model & evidence",
    icon: BookOpen,
    description: "Understand the data, measured performance and limitations.",
  },
] as const;
type Page = (typeof pages)[number]["id"];
interface CohortRisk {
  person_id: string;
  decision_time: string;
  risk_tier: string;
  calibrated_spike_probability: number;
  predicted_peak_glucose_mg_dl: number;
  model_applicable: boolean;
}
function currentPage(): Page {
  const path = window.location.pathname.split("/")[1];
  return pages.some((p) => p.id === path) ? (path as Page) : "overview";
}
const fmt = (v: unknown) =>
  v === undefined || v === null || v === "" ? "—" : String(v);
const riskText = (s: PatientSimulation | null) =>
  !s
    ? "Awaiting forecast"
    : s.baseline.model_applicable === false
      ? "Ongoing high glucose"
      : `${Math.round(s.baseline.calibrated_spike_probability * 100)}% · ${s.baseline.risk_tier === "CALM" ? "Low" : s.baseline.risk_tier.toLowerCase()} risk`;
const DEFAULT_INTERVENTIONS: InterventionSpec[] = [
  {
    intervention_type: "postprandial_walk",
    parameters: { duration_minutes: 20, intensity: "brisk" },
  },
  { intervention_type: "carb_reduction", parameters: { carb_reduction_g: 25 } },
  {
    intervention_type: "food_sequencing",
    parameters: { delay_carbs_minutes: 15, preload_type: "fiber_protein" },
  },
  {
    intervention_type: "compound_lifestyle",
    parameters: { duration_minutes: 20, carb_reduction_g: 25 },
  },
  {
    intervention_type: "confirm_medication",
    parameters: { drug: "metformin", dose_mg: 500 },
  },
];

export default function DiagnosticWorkstation() {
  const [page, setPage] = useState<Page>(currentPage),
    [mobileMenu, setMobileMenu] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]),
    [selectedId, setSelectedId] = useState("");
  const [dates, setDates] = useState<string[]>([]),
    [date, setDate] = useState("");
  const [readings, setReadings] = useState<Reading[]>([]),
    [index, setIndex] = useState(0);
  const [simulation, setSimulation] = useState<PatientSimulation | null>(null),
    [snapshots, setSnapshots] = useState<Record<string, PatientSimulation>>({});
  const [loading, setLoading] = useState(true),
    [predicting, setPredicting] = useState(false),
    [error, setError] = useState(""),
    [predictionError, setPredictionError] = useState("");
  const [reload, setReload] = useState(0),
    [running, setRunning] = useState(false),
    [speed, setSpeed] = useState(1);
  const [interventions, setInterventions] = useState<InterventionSpec[]>(
      DEFAULT_INTERVENTIONS,
    ),
    [branchId, setBranchId] = useState("");
  const [toast, setToast] = useState("");
  const requestedDate = useRef(new URLSearchParams(window.location.search).get("date"));
  const requestedTime = useRef(new URLSearchParams(window.location.search).get("time"));
  const [exporting, setExporting] = useState(false);
  const [cohortRisks, setCohortRisks] = useState<Record<string, CohortRisk>>(
      {},
    ),
    [scoringCohort, setScoringCohort] = useState(false),
    [cohortError, setCohortError] = useState(""),
    [cohortReload, setCohortReload] = useState(0);
  const [alertAcknowledged, setAlertAcknowledged] = useState<
    Record<string, boolean>
  >({});
  const patient = patients.find((p) => p.person_id === selectedId);
  const reading = readings[index] || null;
  const shared =
    simulation?.person_id === selectedId &&
    simulation?.baseline.decision_time === reading?.reading_time
      ? simulation
      : null;
  const prev = readings[Math.max(0, index - 2)];
  const telemetry = useMemo(
    () => computeKineticTelemetry(patient, reading || undefined, prev),
    [patient, reading, prev],
  );
  const historical = useMemo(
    () => readings.slice(0, index + 1),
    [readings, index],
  );
  const branch =
    shared?.counterfactual_branches.find(
      (b) => b.intervention_type === branchId,
    ) || null;
  const pageInfo = pages.find((p) => p.id === page)!;

  useEffect(() => {
    document.title = `${pageInfo.label} · EHR Twin`;
  }, [pageInfo.label]);
  useEffect(() => {
    const pop = () => {
      setPage(currentPage());
      const q = new URLSearchParams(window.location.search);
      const id = q.get("patient");
      const d = q.get("date");
      const t = q.get("time");
      const patientChanged = Boolean(id && id !== selectedId);
      const dayChanged = Boolean(d && d !== date);
      if (patientChanged || dayChanged) {
        requestedDate.current = d;
        requestedTime.current = t;
        setLoading(true);
        setRunning(false);
        setReadings([]);
        setSimulation(null);
      }
      if (id && id !== selectedId) {
        setDate("");
        setSelectedId(id);
        setBranchId("");
        setInterventions(DEFAULT_INTERVENTIONS);
      } else if (d && dayChanged) {
        setDate(d);
      }
      if (t && !patientChanged && !dayChanged) {
        const i = readings.findIndex((r) => r.reading_time === t);
        if (i >= 0) setIndex(i);
      }
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [selectedId, date, readings]);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    fetchPatientsList(c.signal)
      .then((list) => {
        if (c.signal.aborted) return;
        setPatients(list);
        const desired = new URLSearchParams(window.location.search).get(
          "patient",
        );
        setSelectedId(
          list.some((p) => p.person_id === desired)
            ? desired!
            : list.find((p) => p.person_id === "P001")?.person_id ||
                list[0]?.person_id ||
                "",
        );
        if (!list.length) {
          setError("The patient registry is empty.");
          setLoading(false);
        }
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(`Unable to load registry: ${e.message}`);
          setLoading(false);
        }
      });
    return () => c.abort();
  }, [reload]);
  useEffect(() => {
    if (!selectedId) return;
    const c = new AbortController();
    setLoading(true);
    setError("");
    setReadings([]);
    setSimulation(null);
    setDates([]);
    fetchPatientDates(selectedId, c.signal)
      .then((result) => {
        if (c.signal.aborted) return;
        setDates(result.dates);
        const requested = requestedDate.current;
        requestedDate.current = null;
        setDate(
          requested && result.dates.includes(requested)
            ? requested
            : result.default_date || result.dates[0] || "",
        );
        if (!result.dates.length) {
          setError("No recorded CGM days exist for this patient.");
          setLoading(false);
        }
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(`Unable to load recording dates: ${e.message}`);
          setLoading(false);
        }
      });
    return () => c.abort();
  }, [selectedId, reload]);
  useEffect(() => {
    if (!selectedId || !date) return;
    const c = new AbortController();
    setLoading(true);
    setReadings([]);
    setSimulation(null);
    setError("");
    setRunning(false);
    fetchPatientReadings(selectedId, date, c.signal)
      .then((rows) => {
        if (c.signal.aborted) return;
        setReadings(rows);
        const requested = requestedTime.current;
        requestedTime.current = null;
        const matching = requested
          ? rows.findIndex((r) => r.reading_time === requested)
          : -1;
        let initial =
          matching >= 0
            ? matching
            : rows.findIndex(
                (r, i) => i >= 8 && r.glucose_mg_dl < 180 && r.time !== "00:00",
              );
        if (initial < 0) initial = Math.min(8, Math.max(0, rows.length - 1));
        setIndex(initial);
        setLoading(false);
        if (!rows.length)
          setError("This recording has no usable glucose readings.");
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(`Unable to load CGM readings: ${e.message}`);
          setLoading(false);
        }
      });
    return () => c.abort();
  }, [selectedId, date, reload]);
  useEffect(() => {
    if (!selectedId || !reading) return;
    const c = new AbortController();
    setSimulation(null);
    setPredicting(true);
    setPredictionError("");
    const timer = setTimeout(() => {
      fetchPatientSimulation(
        selectedId,
        reading.reading_time,
        interventions,
        c.signal,
      )
        .then((result) => {
          if (c.signal.aborted) return;
          if (
            result.person_id !== selectedId ||
            result.baseline.decision_time !== reading.reading_time
          )
            throw new Error(
              "The API returned a different patient or timestamp.",
            );
          setSimulation(result);
          setSnapshots((prev) => ({ ...prev, [selectedId]: result }));
          setPredicting(false);
        })
        .catch((e) => {
          if (e.name !== "AbortError") {
            setPredictionError(e.message);
            setPredicting(false);
          }
        });
    }, 160);
    return () => {
      c.abort();
      clearTimeout(timer);
    };
  }, [selectedId, reading, interventions, reload]);
  useEffect(() => {
    if (!selectedId || loading || !date || !reading) return;
    const q = new URLSearchParams({ patient: selectedId });
    if (date) q.set("date", date);
    if (reading) q.set("time", reading.reading_time);
    window.history.replaceState(null, "", `/${page}?${q}`);
  }, [selectedId, date, reading, page, loading]);
  useEffect(() => {
    if (page !== "patients" || !patients.length) return;
    const c = new AbortController();
    setScoringCohort(true);
    setCohortError("");
    requestJson<{ summaries: CohortRisk[] }>(
      "/api/v1/twin/cohort/risk-summaries",
      { signal: c.signal },
    )
      .then((result) => {
        setCohortRisks(
          Object.fromEntries(result.summaries.map((r) => [r.person_id, r])),
        );
        setScoringCohort(false);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setCohortError(e.message);
          setScoringCohort(false);
        }
      });
    return () => c.abort();
  }, [page, patients.length, cohortReload]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  function navigate(next: Page) {
    window.history.pushState(null, "", `/${next}${window.location.search}`);
    setPage(next);
    setMobileMenu(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function selectPatient(id: string) {
    if (id === selectedId) return;
    requestedDate.current = null;
    requestedTime.current = null;
    setLoading(true);
    setRunning(false);
    setReadings([]);
    setSimulation(null);
    setDate("");
    setSelectedId(id);
    setBranchId("");
    setInterventions(DEFAULT_INTERVENTIONS);
  }
  function refreshData() {
    requestedDate.current = date || null;
    requestedTime.current = reading?.reading_time || null;
    setReload((v) => v + 1);
  }
  const displayPatients = patients.map((p) => {
    const s = p.person_id === selectedId ? shared : (cohortRisks[p.person_id] ? null : snapshots[p.person_id]);
    const c = p.person_id !== selectedId ? cohortRisks[p.person_id] : undefined;
    const b = s?.baseline || (c?.model_applicable ? c : null);
    return {
      ...p,
      risk_status:
        b && b.model_applicable !== false
          ? {
              tier: b.risk_tier as "HIGH" | "WATCH" | "CALM",
              spike_probability: b.calibrated_spike_probability,
              projected_peak_mg_dl: b.predicted_peak_glucose_mg_dl,
              decision_time: b.decision_time,
              reason_medical: `Evaluated at ${b.decision_time}`,
            }
          : undefined,
    };
  });
  const acknowledgementKey = shared
    ? `${shared.person_id}:${shared.decision_time}`
    : "";
  const snapshot = {
    title: "Digital Twin Patient Dossier",
    cohort:
      "Research-derived demonstration profiles; source measurements and derived estimates retain provenance.",
    patient,
    recording_date: date,
    as_of: reading?.reading_time,
    reading,
    ml_inference: shared?.baseline,
    counterfactual_simulations: shared?.counterfactual_branches,
    optimal_recommendation: shared?.optimal_recommended_action,
    exported_at: new Date().toISOString(),
  };
  async function exportFhir() {
    if (!reading) return;
    setExporting(true);
    try {
      const q = new URLSearchParams({ decision_time: reading.reading_time });
      const bundle = await requestJson(
        `/api/v1/twin/fhir/bundle/${selectedId}?${q}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(interventions),
        },
      );
      downloadJson(`twin-${selectedId}-fhir.json`, bundle);
      setToast("FHIR snapshot exported.");
    } catch (e) {
      setToast(`Export failed: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  }
  const wearable = (
    <LiveWearablesPanel
      readings={readings}
      currentIndex={index}
      onIndexChange={setIndex}
      isRunning={running && !predicting}
      onToggleRunning={() => setRunning(!running)}
      playbackSpeed={speed}
      onSpeedChange={setSpeed}
    />
  );
  const forecastProps = {
    simulation: shared,
    currentReading: reading,
    historicalReadings: historical,
    futureReadings: readings.slice(index + 1),
    loading: predicting,
  };
  return (
    <div className="diagnostic-workstation clinical-app">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className={`app-sidebar ${mobileMenu ? "open" : ""}`}>
        <a
          className="app-brand"
          href="/overview"
          onClick={(e) => {
            e.preventDefault();
            navigate("overview");
          }}
        >
          <span className="brand-mark">
            <HeartPulse size={22} />
          </span>
          <div>
            <strong>
              ehr<span> / twin</span>
            </strong>
            <small>Clinical intelligence</small>
          </div>
        </a>
        <div className="sidebar-section-label">Workspace</div>
        <nav aria-label="Main navigation">
          {pages.map((p) => (
            <a
              key={p.id}
              href={`/${p.id}${window.location.search}`}
              aria-current={page === p.id ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                navigate(p.id);
              }}
            >
              <p.icon size={18} />
              <span>{p.label}</span>
              {page === p.id && <ChevronRight size={14} />}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="research-dot" />
          <strong>Research workspace</strong>
          <p>
            100 demonstration profiles
            <br />
            Recorded CGM · trained ML
          </p>
          <small>Local development environment</small>
        </div>
      </aside>
      {mobileMenu && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <div className="app-main">
        <header className="app-topbar">
          <div className="topbar-crumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Toggle navigation"
              onClick={() => setMobileMenu(!mobileMenu)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{pageInfo.label}</strong>
          </div>
          <div className="topbar-right">
            <span className={`connection-status ${error ? "offline" : ""}`}>
              <i />
              {error
                ? "Data unavailable"
                : loading
                  ? "Loading recording"
                  : predicting
                    ? "Updating forecast"
                    : shared
                      ? "Model connected"
                      : "Recorded data"}
            </span>
            <button
              className="icon-button"
              aria-label="Refresh patient data"
              onClick={refreshData}
            >
              <RefreshCw size={16} />
            </button>
            <span className="user-avatar" title="Local research session">
              DR
            </span>
          </div>
        </header>
        <main id="main-content" className="page-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                Patient workspace / {pageInfo.label}
              </span>
              <h1>
                {page === "overview" ? "Patient overview" : pageInfo.label}
              </h1>
              <p>{pageInfo.description}</p>
            </div>
            {page === "overview" && (
              <button
                className="button secondary"
                onClick={() => navigate("reports")}
              >
                <ArrowDownToLine size={15} />
                Patient report
              </button>
            )}
          </div>
          <section
            className="patient-context-bar"
            aria-label="Selected patient context"
          >
            <div className="context-identity">
              <span className="patient-avatar">
                {patient?.display_name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("") || "—"}
              </span>
              <div>
                <label htmlFor="patient-switch">Selected patient</label>
                <select
                  id="patient-switch"
                  aria-label="Select patient"
                  value={selectedId}
                  onChange={(e) => selectPatient(e.target.value)}
                  disabled={!patients.length}
                >
                  {!patients.length && <option>Loading registry…</option>}
                  {patients.map((p) => (
                    <option key={p.person_id} value={p.person_id}>
                      {p.person_id} · {p.display_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="context-fact">
              <span>Profile</span>
              <strong>
                {patient ? `${patient.age_years} years · ${patient.sex}` : "—"}
              </strong>
            </div>
            <div className="context-fact">
              <span>HbA1c</span>
              <strong>
                {fmt(patient?.hba1c_percent)} <small>%</small>
              </strong>
            </div>
            <div className="context-fact">
              <label htmlFor="recording-date">Recorded day</label>
              <select
                id="recording-date"
                value={date}
                onChange={(e) => {
                  requestedTime.current = null;
                  setLoading(true);
                  setRunning(false);
                  setReadings([]);
                  setSimulation(null);
                  setDate(e.target.value);
                }}
                disabled={!dates.length}
              >
                {dates.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="context-risk">
              <span>Shared forecast · {reading?.time || "—"}</span>
              <strong data-testid="shared-risk">
                {predicting ? "Updating…" : riskText(shared)}
              </strong>
            </div>
          </section>
          {error && (
            <div className="notice error" role="alert">
              <strong>Data could not be loaded.</strong>
              <p>{error}</p>
              <button
                className="button secondary"
                onClick={refreshData}
              >
                Try again
              </button>
            </div>
          )}
          {predictionError && (
            <div className="notice warning" role="status">
              <strong>Forecast unavailable for this reading.</strong>
              <p>{predictionError}</p>
              <small>
                Recorded measurements remain available. Choose a later reading
                or retry.
              </small>
              <button
                className="text-button"
                onClick={refreshData}
              >
                Retry forecast
              </button>
            </div>
          )}
          {loading && !error && (
            <div className="paper-card loading-state" role="status">
              <span className="loading-spinner" />
              <h3>Loading the clinical recording</h3>
              <p>Retrieving patient facts and sensor history from the API.</p>
            </div>
          )}
          {!loading && patient && (
            <>
              {page === "overview" && (
                <>
                  <div className="overview-top">
                    <section className="paper-card patient-summary">
                      <div className="card-heading">
                        <span className="eyebrow">Today’s focus</span>
                        <span className="subtle-tag">Type 2 diabetes</span>
                      </div>
                      <h2>{patient.display_name}</h2>
                      <p className="muted">
                        {patient.person_id} · {patient.years_with_diabetes}{" "}
                        years with diabetes · BMI {patient.bmi}
                      </p>
                      <div className="hero-reading">
                        <strong>
                          {reading ? Math.round(reading.glucose_mg_dl) : "—"}
                        </strong>
                        <div>
                          mg/dL<span>Recorded at {reading?.time || "—"}</span>
                        </div>
                      </div>
                      <div className="hero-risk">
                        <span>Two-hour incident forecast</span>
                        <strong data-testid="overview-risk">
                          {predicting ? "Updating…" : riskText(shared)}
                        </strong>
                      </div>
                      <p className="caption">
                        Review the latest forecast, explore possible scenarios
                        and keep a record of your decision.
                      </p>
                      <button
                        className="text-button"
                        onClick={() => navigate("patients")}
                      >
                        View clinical profile <ArrowRight size={15} />
                      </button>
                    </section>
                    <GlucoseForecastPanel {...forecastProps} compact />
                  </div>
                  <div className="overview-bottom">
                    <section className="paper-card">
                      <div className="card-heading">
                        <div>
                          <span className="eyebrow">Review next</span>
                          <h3>
                            {shared?.baseline.model_applicable === false
                              ? "Current high reading"
                              : "Model-guided attention"}
                          </h3>
                        </div>
                        <ClipboardCheck size={20} />
                      </div>
                      <p>
                        {shared?.optimal_recommended_action ||
                          "A recommendation appears after a model response is available."}
                      </p>
                      <p className="caption">
                        What-if effects are assumption-based estimates. A
                        clinician reviews any action.
                      </p>
                      <div className="button-row">
                        <button
                          className="button primary"
                          onClick={() => navigate("scenarios")}
                        >
                          Explore scenarios <ArrowRight size={14} />
                        </button>
                        {shared && (
                          <button
                            className="button secondary"
                            disabled={alertAcknowledged[acknowledgementKey]}
                            onClick={() => {
                              setAlertAcknowledged((v) => ({
                                ...v,
                                [acknowledgementKey]: true,
                              }));
                              setToast(
                                "Marked reviewed for this patient and reading in this session.",
                              );
                            }}
                          >
                            {alertAcknowledged[acknowledgementKey] ? (
                              <>
                                <Check size={14} />
                                Reviewed
                              </>
                            ) : (
                              "Mark reviewed"
                            )}
                          </button>
                        )}
                      </div>
                    </section>
                    <section className="paper-card">
                      <span className="eyebrow">A connected patient story</span>
                      <h3>From clinical context to a clearer forecast.</h3>
                      <div className="quick-links">
                        <button onClick={() => navigate("anatomy")}>
                          <HeartPulse size={19} />
                          <span>
                            Explore anatomy
                            <small>Body & four organ views</small>
                          </span>
                          <ArrowRight size={16} />
                        </button>
                        <button onClick={() => navigate("review")}>
                          <ClipboardCheck size={19} />
                          <span>
                            Clinical review
                            <small>Verify, reconcile & document</small>
                          </span>
                          <ArrowRight size={16} />
                        </button>
                        <button onClick={() => navigate("evidence")}>
                          <BookOpen size={19} />
                          <span>
                            Understand the evidence
                            <small>Data provenance & performance</small>
                          </span>
                          <ArrowRight size={16} />
                        </button>
                      </div>
                    </section>
                  </div>
                </>
              )}
              {page === "patients" && (
                <>
                  <div className="cohort-scoring-status">
                    <p className="caption page-note">
                      {scoringCohort
                        ? "Evaluating recorded states for the cohort…"
                        : "Cohort risks use each profile’s latest eligible recorded moment. The selected patient always uses the current timeline forecast."}{" "}
                      Source partition labels and laboratory values come from
                      the patient table.
                    </p>
                    <button
                      className="button secondary"
                      disabled={scoringCohort}
                      onClick={() => setCohortReload((v) => v + 1)}
                    >
                      {scoringCohort ? "Evaluating…" : "Refresh cohort risks"}
                    </button>
                  </div>
                  {cohortError && (
                    <p className="notice warning">
                      Cohort evaluations unavailable: {cohortError}
                    </p>
                  )}
                  <PatientRegistryPanel
                    patients={displayPatients}
                    selectedPatientId={selectedId}
                    onSelectPatient={selectPatient}
                  />
                </>
              )}
              {page === "forecast" && (
                <div className="page-stack">
                  {wearable}
                  <GlucoseForecastPanel {...forecastProps} />
                </div>
              )}
              {page === "scenarios" && (
                <div className="page-stack">
                  <ScenarioControls
                    appliedSpecs={interventions}
                    simulation={shared}
                    busy={predicting}
                    onRun={setInterventions}
                    onSelect={setBranchId}
                    selected={branchId}
                  />
                  <GlucoseForecastPanel {...forecastProps} branch={branch} />
                </div>
              )}
              <div hidden={page !== "anatomy"}>
                <AnatomyWorkspace
                  key={selectedId}
                  patient={patient}
                  reading={reading}
                  telemetry={telemetry}
                />
              </div>
              {page === "review" && (
                <ClinicalWorkflowPage patientId={selectedId} />
              )}
              {page === "genomics" && <GenomicsPage />}
              {page === "reports" && (
                <div className="reports-grid">
                  <section className="paper-card">
                    <span className="eyebrow">Patient dossier</span>
                    <h2>A report with one source of truth.</h2>
                    <p className="muted">
                      Includes clinical facts, the exact as-of reading, model
                      inputs, original TreeSHAP and what-if assumptions.
                    </p>
                    <dl className="facts-list">
                      <div>
                        <dt>Patient</dt>
                        <dd>
                          {patient.display_name} · {selectedId}
                        </dd>
                      </div>
                      <div>
                        <dt>Recording</dt>
                        <dd>
                          {date} at {reading?.time || "—"}
                        </dd>
                      </div>
                      <div>
                        <dt>Incident forecast</dt>
                        <dd data-testid="report-risk">{riskText(shared)}</dd>
                      </div>
                      <div>
                        <dt>Projected peak</dt>
                        <dd>
                          {shared
                            ? `${shared.baseline.predicted_peak_glucose_mg_dl} mg/dL`
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt>Dataset partition</dt>
                        <dd>{patient.split}</dd>
                      </div>
                    </dl>
                    <div className="button-row">
                      <button
                        className="button primary"
                        disabled={!shared}
                        onClick={() => {
                          downloadJson(
                            `digital-twin-${selectedId}.json`,
                            snapshot,
                          );
                          setToast("Patient dossier exported.");
                        }}
                      >
                        <ArrowDownToLine size={15} />
                        Export JSON dossier
                      </button>
                      <button
                        className="button secondary"
                        disabled={!shared || exporting}
                        onClick={exportFhir}
                      >
                        {exporting ? "Preparing…" : "Export FHIR snapshot"}
                      </button>
                      <button
                        className="button secondary"
                        disabled={!shared}
                        onClick={() => window.print()}
                      >
                        Print report / PDF
                      </button>
                    </div>
                    <p className="caption">
                      FHIR export creates a reviewable bundle. Hospital
                      persistence is a separate clinician-approved workflow.
                    </p>
                  </section>
                  <section className="paper-card">
                    <span className="eyebrow">Snapshot preview</span>
                    <h3>Inspect before exporting</h3>
                    <pre className="snapshot-preview">
                      {JSON.stringify(snapshot, null, 2)}
                    </pre>
                  </section>
                </div>
              )}
              {page === "evidence" && <EvidencePage />}
            </>
          )}
          <footer className="app-footer">
            <span>ehr / twin</span>
            <p>
              Research-derived demonstration cohort · recorded sensor replay ·
              organ estimates are illustrative
            </p>
            <button
              className="text-button"
              onClick={() => navigate("evidence")}
            >
              Data & model details <ArrowRight size={12} />
            </button>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="app-toast" role="status">
          <Check size={17} />
          {toast}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function ScenarioControls({
  appliedSpecs,
  simulation,
  busy,
  onRun,
  onSelect,
  selected,
}: {
  appliedSpecs: InterventionSpec[];
  simulation: PatientSimulation | null;
  busy: boolean;
  onRun: (specs: InterventionSpec[]) => void;
  onSelect: (id: string) => void;
  selected: string;
}) {
  const initial = {
    walk: Number(
      appliedSpecs.find((s) => s.intervention_type === "postprandial_walk")
        ?.parameters.duration_minutes ?? 20,
    ),
    carbs: Number(
      appliedSpecs.find((s) => s.intervention_type === "carb_reduction")
        ?.parameters.carb_reduction_g ?? 25,
    ),
    delay: Number(
      appliedSpecs.find((s) => s.intervention_type === "food_sequencing")
        ?.parameters.delay_carbs_minutes ?? 15,
    ),
  };
  const [walk, setWalk] = useState(initial.walk),
    [carbs, setCarbs] = useState(initial.carbs),
    [delay, setDelay] = useState(initial.delay);
  const [applied, setApplied] = useState(initial);
  const dirty =
    walk !== applied.walk || carbs !== applied.carbs || delay !== applied.delay;
  function run() {
    setApplied({ walk, carbs, delay });
    onRun([
      {
        intervention_type: "postprandial_walk",
        parameters: { duration_minutes: walk, intensity: "brisk" },
      },
      {
        intervention_type: "carb_reduction",
        parameters: { carb_reduction_g: carbs },
      },
      {
        intervention_type: "food_sequencing",
        parameters: {
          delay_carbs_minutes: delay,
          preload_type: "fiber_protein",
        },
      },
      {
        intervention_type: "compound_lifestyle",
        parameters: { duration_minutes: walk, carb_reduction_g: carbs },
      },
      {
        intervention_type: "confirm_medication",
        parameters: { drug: "metformin", dose_mg: 500 },
      },
    ]);
  }
  return (
    <section className="paper-card">
      <div className="card-heading">
        <div>
          <span className="eyebrow">Physiological sensitivity analysis</span>
          <h2>What might change the trajectory?</h2>
        </div>
        <span className="subtle-tag">Clinician review required</span>
      </div>
      <p className="muted">
        Adjust a scenario, calculate it on the server, then select a branch to
        compare with the shared baseline. These effects are model assumptions,
        not proven treatment benefits.
      </p>
      <div className="scenario-controls">
        <label>
          Walking duration <strong>{walk} minutes</strong>
          <input
            aria-label="Walking duration"
            type="range"
            min="5"
            max="60"
            step="5"
            value={walk}
            onChange={(e) => setWalk(Number(e.target.value))}
          />
        </label>
        <label>
          Carbohydrate reduction <strong>{carbs} g</strong>
          <input
            aria-label="Carbohydrate reduction"
            type="range"
            min="0"
            max="75"
            step="5"
            value={carbs}
            onChange={(e) => setCarbs(Number(e.target.value))}
          />
        </label>
        <label>
          Carbohydrate delay <strong>{delay} minutes</strong>
          <input
            aria-label="Carbohydrate delay"
            type="range"
            min="0"
            max="60"
            step="5"
            value={delay}
            onChange={(e) => setDelay(Number(e.target.value))}
          />
        </label>
      </div>
      <div className="button-row">
        <button className="button primary" disabled={busy} onClick={run}>
          {busy ? "Calculating…" : "Calculate scenarios"}
        </button>
        {dirty && (
          <span className="caption">
            Parameters changed. Recalculate to update results.
          </span>
        )}
      </div>
      <div className="scenario-branches">
        {simulation?.counterfactual_branches.map((b: SimulationBranch) => (
          <button
            key={b.intervention_type}
            className={`scenario-branch ${selected === b.intervention_type ? "selected" : ""}`}
            aria-pressed={selected === b.intervention_type}
            onClick={() =>
              onSelect(
                selected === b.intervention_type ? "" : b.intervention_type,
              )
            }
          >
            <span>{b.intervention_label}</span>
            <strong>
              {b.simulated_peak_mg_dl.toFixed(1)} <small>mg/dL peak</small>
            </strong>
            <small>
              {b.peak_reduction_mg_dl.toFixed(1)} mg/dL estimated reduction
            </small>
            <p>
              {b.hypoglycemia_risk_warning
                ? "Low-glucose trajectory warning"
                : b.biophysical_mechanism}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}
function GenomicsPage() {
  const bases = "ATCGGATCGAGCTAGCATCGTAGCATGCGATC".split("");
  const [base, setBase] = useState(0),
    [animate, setAnimate] = useState(true),
    [tick, setTick] = useState(0);
  useEffect(() => {
    if (!animate) return;
    const timer = setInterval(() => setTick((t) => t + 1), 850);
    return () => clearInterval(timer);
  }, [animate]);
  return (
    <div className="genomics-grid">
      <section className="paper-card">
        <span className="eyebrow">Educational visualization</span>
        <h2>A closer look at the double helix.</h2>
        <p className="muted">
          This fixed sample sequence explains nucleotide pairing. It is not a
          patient genome and does not influence the glucose model.
        </p>
        <div className="genomics-visual">
          <DnaHelix active={tick % 30} />
        </div>
        <button
          className="button secondary"
          onClick={() => setAnimate(!animate)}
        >
          {animate ? "Pause helix" : "Animate helix"}
        </button>
      </section>
      <section className="paper-card">
        <span className="eyebrow">Sequence explorer</span>
        <h2>Select a nucleotide</h2>
        <div className="base-grid">
          {bases.map((b, i) => (
            <button
              key={i}
              aria-label={`Select base ${i + 1}: ${b}`}
              aria-pressed={base === i}
              className={base === i ? "active" : ""}
              onClick={() => setBase(i)}
            >
              {b}
            </button>
          ))}
        </div>
        <div className="base-inspector">
          <span>
            Position {base + 1} of {bases.length}
          </span>
          <strong>
            {bases[base]}
            <span>↔</span>
            {{ A: "T", T: "A", C: "G", G: "C" }[bases[base]]}
          </strong>
          <p>
            {
              {
                A: "Adenine pairs with thymine.",
                T: "Thymine pairs with adenine.",
                C: "Cytosine pairs with guanine.",
                G: "Guanine pairs with cytosine.",
              }[bases[base]]
            }
          </p>
        </div>
        <div className="button-row">
          <button
            className="button secondary"
            onClick={() =>
              setBase((i) => (i - 1 + bases.length) % bases.length)
            }
          >
            Previous base
          </button>
          <button
            className="button secondary"
            onClick={() => setBase((i) => (i + 1) % bases.length)}
          >
            Next base
          </button>
        </div>
      </section>
    </div>
  );
}
function EvidencePage() {
  const [metrics, setMetrics] = useState<Record<string, any> | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const c = new AbortController();
    requestJson<Record<string, any>>("/api/v1/twin/metrics", {
      signal: c.signal,
    })
      .then(setMetrics)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => c.abort();
  }, []);
  const clf =
    metrics?.test_evaluation_head_1_classifier
      ?.proposed_calibrated_digital_twin;
  const traj = metrics?.test_evaluation_head_2_trajectory;
  return (
    <div className="page-stack">
      <section className="paper-card">
        <span className="eyebrow">Data provenance</span>
        <h2>Demonstration profiles, traceable source data.</h2>
        <p>
          The 100 profiles use anonymized Shanghai Type 2 diabetes clinical
          measurements and recorded FreeStyle Libre traces, processed into a
          research demonstration cohort. Display names are fictional aliases;
          some fields are derived or imputed in preprocessing. This is not an
          independently validated Indian patient population.
        </p>
        <div className="evidence-facts">
          <div>
            <strong>100</strong>
            <span>profiles</span>
          </div>
          <div>
            <strong>70 / 15 / 15</strong>
            <span>train / tune / test patients</span>
          </div>
          <div>
            <strong>24</strong>
            <span>clinical + CGM model features</span>
          </div>
          <div>
            <strong>120 min</strong>
            <span>forecast horizon</span>
          </div>
        </div>
        <p className="caption">
          Current source manifest: 112,287 sensor readings and 89,379 training
          examples. Source dataset DOI: 10.6084/m9.figshare.20444397. Counts
          describe saved preprocessing artifacts.
        </p>
      </section>
      <section className="paper-card">
        <span className="eyebrow">Held-out evaluation</span>
        <h2>Measured performance, with context.</h2>
        {error && <p role="alert">Metrics unavailable: {error}</p>}
        {!metrics && !error && <p>Loading saved evaluation metrics…</p>}
        {clf && (
          <>
            <div className="evidence-facts">
              <div>
                <strong>{clf.roc_auc}</strong>
                <span>ROC-AUC</span>
              </div>
              <div>
                <strong>{(clf.sensitivity_recall * 100).toFixed(1)}%</strong>
                <span>recall at threshold {clf.decision_threshold}</span>
              </div>
              <div>
                <strong>{(clf.precision * 100).toFixed(1)}%</strong>
                <span>precision</span>
              </div>
              <div>
                <strong>{(clf.false_alarm_rate_fpr * 100).toFixed(1)}%</strong>
                <span>false-positive rate</span>
              </div>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>ROC-AUC</th>
                  <th>PR-AUC</th>
                  <th>Recall</th>
                  <th>Brier score</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(metrics!.test_evaluation_head_1_classifier).map(
                  ([name, m]: [string, any]) => (
                    <tr key={name}>
                      <td>{name.replaceAll("_", " ")}</td>
                      <td>{m.roc_auc}</td>
                      <td>{m.average_precision_pr_auc}</td>
                      <td>{(m.sensitivity_recall * 100).toFixed(1)}%</td>
                      <td>{m.brier_score}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
            <p className="caption">
              Saved patient-held-out metrics, not a fresh evaluation of the
              selected recording. Recall means some future spikes were missed.
            </p>
          </>
        )}
        {traj && (
          <p>
            Trajectory MAE:{" "}
            <strong>{traj.mean_trajectory_mae_mg_dl} mg/dL</strong> across
            horizons;{" "}
            <strong>{traj.horizon_breakdown["+120m"].mae_mg_dl} mg/dL</strong>{" "}
            at two hours. Aggregate Clarke zones A+B:{" "}
            {traj.clarke_error_grid.clinically_acceptable_zones_a_and_b_percent}
            %; this does not certify any individual forecast.
          </p>
        )}
      </section>
      <section className="paper-card">
        <span className="eyebrow">Boundaries that matter</span>
        <h3>Keep evidence separate from illustration.</h3>
        <ul className="evidence-list">
          <li>
            The classifier and trajectory regressor were trained on current
            glucose below 180 mg/dL. An already-high reading is explicitly
            marked outside that evaluated domain.
          </li>
          <li>
            TreeSHAP explains raw classifier log-odds before isotonic
            probability calibration.
          </li>
          <li>
            Forecast bands and intervention effects are illustrative sensitivity
            estimates, not calibrated confidence intervals or validated causal
            treatment effects.
          </li>
          <li>
            Organ views preserve atlas artwork; physiology is estimated. No
            patient-specific scan reconstruction or live device pairing is
            claimed.
          </li>
          <li>
            Clinical review uses a local development workflow. Hospital
            integration and prospective validation require separate
            implementation and evaluation.
          </li>
        </ul>
      </section>
    </div>
  );
}
