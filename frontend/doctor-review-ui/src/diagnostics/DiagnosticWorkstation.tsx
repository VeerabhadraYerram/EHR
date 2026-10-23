import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ClipboardCheck,
  Dna,
  FileText,
  FlaskConical,
  HeartPulse,
  LayoutDashboard,
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
  const [page, setPage] = useState<Page>(currentPage);
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
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);
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
    report_type: "Digital Twin Clinical Dossier",
    generated_at: new Date().toISOString(),
    patient: patient
      ? {
          id: patient.person_id,
          name: patient.display_name,
          age_years: patient.age_years,
          sex: patient.sex,
          bmi: patient.bmi,
          hba1c_percent: patient.hba1c_percent,
          years_with_diabetes: patient.years_with_diabetes,
          dataset_partition: patient.split,
        }
      : null,
    recording: {
      date: date,
      as_of_time: reading?.reading_time || null,
      glucose_mg_dl: reading ? Math.round(reading.glucose_mg_dl) : null,
    },
    forecast: shared
      ? {
          risk_tier: shared.baseline.risk_tier,
          spike_probability_pct: Math.round(
            shared.baseline.calibrated_spike_probability * 100,
          ),
          predicted_peak_mg_dl: shared.baseline.predicted_peak_glucose_mg_dl,
          model_applicable: shared.baseline.model_applicable,
          decision_time: shared.baseline.decision_time,
        }
      : null,
    recommended_action: shared?.optimal_recommended_action || null,
    what_if_scenarios: shared?.counterfactual_branches.map((b) => ({
      intervention: b.intervention_type,
      label: b.intervention_label,
      simulated_peak_mg_dl: b.simulated_peak_mg_dl,
      peak_reduction_mg_dl: b.peak_reduction_mg_dl,
      hypoglycemia_risk: b.hypoglycemia_risk_warning ?? false,
    })) || [],
    note: "Research-derived demonstration cohort. Not for clinical use.",
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
      <div className="app-main">
        <main id="main-content" className="page-content">
          <div className="page-heading">
            <div>
              {page !== "overview" && (
                <button
                  type="button"
                  className="back-to-overview-btn"
                  onClick={() => navigate("overview")}
                  title="Return to the main patient overview launchpad"
                >
                  <ArrowLeft size={14} /> Back to Patient Overview
                </button>
              )}
              <span className="eyebrow">
                Patient workspace / {pageInfo.label}
              </span>
              <h1>
                {page === "overview" ? "Patient overview" : pageInfo.label}
              </h1>
              <p>{pageInfo.description}</p>
            </div>
            <div className="heading-actions-bar">
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
                title="Refresh patient data"
              >
                <RefreshCw size={15} />
              </button>
              <span className="user-avatar" title="Local research session">
                DR
              </span>
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
            <div
              className="context-fact"
              onClick={() => navigate("patients")}
              style={{ cursor: "pointer" }}
              title="Click to view full patient registry and profile"
            >
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
            <div
              className="context-risk"
              onClick={() => navigate("scenarios")}
              style={{ cursor: "pointer" }}
              title="Click to simulate what-if counterfactual scenarios for this forecast"
            >
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
                      <div
                        className="hero-reading"
                        onClick={() => navigate("forecast")}
                        title="Click to view continuous sensor timeline & CGM dynamics"
                      >
                        <strong>
                          {reading ? Math.round(reading.glucose_mg_dl) : "—"}
                        </strong>
                        <div>
                          mg/dL
                          <span>
                            Recorded at {reading?.time || "—"} ·{" "}
                            <span className="interactive-hint">View timeline ↗</span>
                          </span>
                        </div>
                      </div>
                      <div
                        className="hero-risk"
                        onClick={() => navigate("scenarios")}
                        title="Click to explore and simulate counterfactual what-if scenarios"
                      >
                        <span>Two-hour incident forecast</span>
                        <strong data-testid="overview-risk">
                          {predicting ? "Updating…" : riskText(shared)}
                          <span className="interactive-pill-tag">Simulate ⚡</span>
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
                    <GlucoseForecastPanel {...forecastProps} compact onNavigate={navigate} />
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
                          Explore what-if scenarios <ArrowRight size={14} />
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
                    onNavigate={navigate}
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
                    onToast={setToast}
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
                      Clinical facts, the exact as-of reading, model forecast,
                      TreeSHAP feature importance and what-if scenario summary.
                    </p>
                    <dl className="facts-list">
                      <div>
                        <dt>Patient</dt>
                        <dd>
                          {patient.display_name} · {selectedId}
                        </dd>
                      </div>
                      <div>
                        <dt>Age / Sex</dt>
                        <dd>
                          {patient.age_years} years · {patient.sex}
                        </dd>
                      </div>
                      <div>
                        <dt>HbA1c</dt>
                        <dd>{fmt(patient.hba1c_percent)} %</dd>
                      </div>
                      <div>
                        <dt>BMI</dt>
                        <dd>{fmt(patient.bmi)}</dd>
                      </div>
                      <div>
                        <dt>Years with diabetes</dt>
                        <dd>{fmt(patient.years_with_diabetes)}</dd>
                      </div>
                      <div>
                        <dt>Recording</dt>
                        <dd>
                          {date} at {reading?.time || "—"}
                        </dd>
                      </div>
                      <div>
                        <dt>Current glucose</dt>
                        <dd>
                          {reading ? `${Math.round(reading.glucose_mg_dl)} mg/dL` : "—"}
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
                      {shared?.optimal_recommended_action && (
                        <div>
                          <dt>Recommended action</dt>
                          <dd>{shared.optimal_recommended_action}</dd>
                        </div>
                      )}
                    </dl>
                    {shared?.counterfactual_branches &&
                      shared.counterfactual_branches.length > 0 && (
                        <>
                          <div className="section-divider" />
                          <span className="eyebrow">What-if scenarios</span>
                          <dl className="facts-list">
                            {shared.counterfactual_branches.map((b) => (
                              <div key={b.intervention_type}>
                                <dt>{b.intervention_label}</dt>
                                <dd>
                                  {b.simulated_peak_mg_dl.toFixed(1)} mg/dL peak
                                  &nbsp;·&nbsp;
                                  <span style={{ color: "#5f7a4a" }}>
                                    −{b.peak_reduction_mg_dl.toFixed(1)} mg/dL
                                  </span>
                                  {b.hypoglycemia_risk_warning && (
                                    <span style={{ color: "#9a4e3e", marginLeft: 8 }}>
                                      ⚠ low-glucose risk
                                    </span>
                                  )}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </>
                      )}
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
            <p>
              Research-derived demonstration cohort · recorded sensor replay ·
              organ estimates are illustrative
            </p>
            <button
              className="text-button"
              onClick={() => navigate("evidence")}
            >
              Model Evidence & Benchmarks <ArrowRight size={12} />
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
  onToast,
}: {
  appliedSpecs: InterventionSpec[];
  simulation: PatientSimulation | null;
  busy: boolean;
  onRun: (specs: InterventionSpec[]) => void;
  onSelect: (id: string) => void;
  selected: string;
  onToast?: (msg: string) => void;
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
  const [autoSimulate, setAutoSimulate] = useState(true);

  const dirty =
    walk !== applied.walk || carbs !== applied.carbs || delay !== applied.delay;

  function runSimulation(w = walk, c = carbs, d = delay) {
    setApplied({ walk: w, carbs: c, delay: d });
    onRun([
      {
        intervention_type: "postprandial_walk",
        parameters: { duration_minutes: w, intensity: "brisk" },
      },
      {
        intervention_type: "carb_reduction",
        parameters: { carb_reduction_g: c },
      },
      {
        intervention_type: "food_sequencing",
        parameters: {
          delay_carbs_minutes: d,
          preload_type: "fiber_protein",
        },
      },
      {
        intervention_type: "compound_lifestyle",
        parameters: { duration_minutes: w, carb_reduction_g: c },
      },
      {
        intervention_type: "confirm_medication",
        parameters: { drug: "metformin", dose_mg: 500 },
      },
    ]);
  }

  // Live auto-recalculate when sliders change (debounced 350ms)
  useEffect(() => {
    if (!autoSimulate || !dirty) return;
    const timer = setTimeout(() => {
      runSimulation(walk, carbs, delay);
    }, 350);
    return () => clearTimeout(timer);
  }, [walk, carbs, delay, autoSimulate, dirty]);

  const presets = [
    { label: "🚶 Postprandial Walk (30m)", w: 30, c: 0, d: 0 },
    { label: "🥗 Low-Carb Swap (-35g)", w: 0, c: 35, d: 0 },
    { label: "⏱️ Food Sequencing (20m)", w: 0, c: 0, d: 20 },
    { label: "⚡ Combined Lifestyle", w: 30, c: 25, d: 15 },
    { label: "🔄 Reset Defaults", w: 20, c: 25, d: 15 },
  ];

  function applyPreset(p: { label: string; w: number; c: number; d: number }) {
    setWalk(p.w);
    setCarbs(p.c);
    setDelay(p.d);
    runSimulation(p.w, p.c, p.d);
    if (onToast) onToast(`Applied preset: ${p.label}`);
  }

  const selectedBranch = simulation?.counterfactual_branches.find(
    (b) => b.intervention_type === selected,
  );

  return (
    <section className="paper-card scenario-workstation-card">
      <div className="card-heading">
        <div>
          <span className="eyebrow">Interactive What-If Simulation Engine</span>
          <h2>Physiological Sensitivity & Counterfactuals</h2>
        </div>
        <div className="heading-actions">
          <label className="toggle-chip" title="Recalculate counterfactuals in real-time as you drag sliders">
            <input
              type="checkbox"
              checked={autoSimulate}
              onChange={(e) => setAutoSimulate(e.target.checked)}
            />
            <span>⚡ Live Auto-Simulate</span>
          </label>
          <span className="subtle-tag">Clinician decision support</span>
        </div>
      </div>

      <p className="muted">
        Adjust lifestyle parameters below or click a clinical preset to simulate patient-specific glucose trajectories in real-time.
      </p>

      {/* Quick Clinical Presets */}
      <div className="scenario-presets-bar">
        <span className="presets-label">Clinical presets:</span>
        <div className="presets-row">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              className="preset-chip"
              onClick={() => applyPreset(p)}
              disabled={busy}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tactile Sliders Grid */}
      <div className="scenario-controls interactive-grid">
        <div className="control-slider-cell">
          <div className="slider-header">
            <span>Walking duration</span>
            <strong>{walk} min</strong>
          </div>
          <div className="slider-with-steppers">
            <button
              type="button"
              className="stepper-btn"
              onClick={() => setWalk((v) => Math.max(5, v - 5))}
              disabled={walk <= 5}
              aria-label="Decrease walking duration by 5 minutes"
            >
              −
            </button>
            <input
              aria-label="Walking duration"
              type="range"
              min="5"
              max="60"
              step="5"
              value={walk}
              onChange={(e) => setWalk(Number(e.target.value))}
            />
            <button
              type="button"
              className="stepper-btn"
              onClick={() => setWalk((v) => Math.min(60, v + 5))}
              disabled={walk >= 60}
              aria-label="Increase walking duration by 5 minutes"
            >
              +
            </button>
          </div>
          <span className="slider-intensity-badge">
            {walk <= 15 ? "Light Walking (Mild glucose uptake)" : walk <= 35 ? "Brisk Postprandial (Optimal uptake)" : "Intensive Exercise (High muscle clearance)"}
          </span>
        </div>

        <div className="control-slider-cell">
          <div className="slider-header">
            <span>Carbohydrate reduction</span>
            <strong>{carbs} g</strong>
          </div>
          <div className="slider-with-steppers">
            <button
              type="button"
              className="stepper-btn"
              onClick={() => setCarbs((v) => Math.max(0, v - 5))}
              disabled={carbs <= 0}
              aria-label="Decrease carb reduction by 5 grams"
            >
              −
            </button>
            <input
              aria-label="Carbohydrate reduction"
              type="range"
              min="0"
              max="75"
              step="5"
              value={carbs}
              onChange={(e) => setCarbs(Number(e.target.value))}
            />
            <button
              type="button"
              className="stepper-btn"
              onClick={() => setCarbs((v) => Math.min(75, v + 5))}
              disabled={carbs >= 75}
              aria-label="Increase carb reduction by 5 grams"
            >
              +
            </button>
          </div>
          <span className="slider-intensity-badge">
            {carbs === 0 ? "No modification" : carbs <= 20 ? "Modest portion reduction" : carbs <= 45 ? "Targeted low-GI substitution" : "Aggressive carb restriction"}
          </span>
        </div>

        <div className="control-slider-cell">
          <div className="slider-header">
            <span>Carbohydrate delay</span>
            <strong>{delay} min</strong>
          </div>
          <div className="slider-with-steppers">
            <button
              type="button"
              className="stepper-btn"
              onClick={() => setDelay((v) => Math.max(0, v - 5))}
              disabled={delay <= 0}
              aria-label="Decrease carb delay by 5 minutes"
            >
              −
            </button>
            <input
              aria-label="Carbohydrate delay"
              type="range"
              min="0"
              max="60"
              step="5"
              value={delay}
              onChange={(e) => setDelay(Number(e.target.value))}
            />
            <button
              type="button"
              className="stepper-btn"
              onClick={() => setDelay((v) => Math.min(60, v + 5))}
              disabled={delay >= 60}
              aria-label="Increase carb delay by 5 minutes"
            >
              +
            </button>
          </div>
          <span className="slider-intensity-badge">
            {delay === 0 ? "Concurrent meal intake" : delay <= 20 ? "Standard protein/fiber preload" : "Extended digestion staggering"}
          </span>
        </div>
      </div>

      <div className="button-row scenario-action-bar">
        {!autoSimulate && (
          <button className="button primary" disabled={busy} onClick={() => runSimulation()}>
            {busy ? "Calculating…" : "Calculate scenarios"}
          </button>
        )}
        {busy && <span className="simulating-indicator"><i className="pulse-dot" /> Simulating physiological trajectory…</span>}
        {dirty && !autoSimulate && (
          <span className="caption">
            Parameters modified. Recalculate to update results.
          </span>
        )}
      </div>

      {/* Selected Branch Active Comparison Drawer */}
      {selectedBranch && (
        <div className="scenario-comparison-drawer" role="region" aria-label="Branch comparison summary">
          <div className="drawer-header">
            <div>
              <span className="eyebrow">Active Simulation Comparison</span>
              <h3>{selectedBranch.intervention_label}</h3>
            </div>
            <div className="drawer-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `Clinical What-If: ${selectedBranch.intervention_label} | Peak: ${selectedBranch.simulated_peak_mg_dl.toFixed(1)} mg/dL (Estimated reduction: -${selectedBranch.peak_reduction_mg_dl.toFixed(1)} mg/dL) | Mechanism: ${selectedBranch.biophysical_mechanism}`
                  );
                  if (onToast) onToast("Scenario recommendation copied to clipboard.");
                }}
              >
                📋 Copy recommendation
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => onSelect("")}
              >
                Clear comparison
              </button>
            </div>
          </div>
          <div className="comparison-metric-cards">
            <div className="metric-pill">
              <span>Baseline projected peak</span>
              <strong>{simulation?.baseline.predicted_peak_glucose_mg_dl.toFixed(1)} mg/dL</strong>
            </div>
            <div className="metric-pill-divider">→</div>
            <div className="metric-pill highlight">
              <span>Simulated branch peak</span>
              <strong>{selectedBranch.simulated_peak_mg_dl.toFixed(1)} mg/dL</strong>
            </div>
            <div className="metric-pill delta">
              <span>Estimated reduction</span>
              <strong className="text-emerald">▼ -{selectedBranch.peak_reduction_mg_dl.toFixed(1)} mg/dL</strong>
            </div>
          </div>
          <p className="mechanism-text">
            <strong>Mechanism:</strong> {selectedBranch.biophysical_mechanism}
          </p>
        </div>
      )}

      {/* Interactive Branch Selection Cards */}
      <div className="scenario-branches-header">
        <span className="eyebrow">Simulated Physiological Branches ({simulation?.counterfactual_branches.length || 0})</span>
        <small>Click any branch to project its curve on the forecast graph below</small>
      </div>

      <div className="scenario-branches">
        {simulation?.counterfactual_branches.map((b: SimulationBranch) => {
          const isSelected = selected === b.intervention_type;
          return (
            <button
              key={b.intervention_type}
              className={`scenario-branch ${isSelected ? "selected" : ""}`}
              aria-pressed={isSelected}
              onClick={() => onSelect(isSelected ? "" : b.intervention_type)}
            >
              <div className="branch-top-row">
                <span className="branch-title">{b.intervention_label}</span>
                {isSelected && <span className="active-tag">Active on chart</span>}
              </div>
              <strong className="branch-peak">
                {b.simulated_peak_mg_dl.toFixed(1)} <small>mg/dL peak</small>
              </strong>
              <span className="branch-reduction-pill">
                ▼ -{b.peak_reduction_mg_dl.toFixed(1)} mg/dL reduction
              </span>
              <p className="branch-desc">
                {b.hypoglycemia_risk_warning
                  ? "⚠️ Low-glucose trajectory warning"
                  : b.biophysical_mechanism}
              </p>
            </button>
          );
        })}
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
