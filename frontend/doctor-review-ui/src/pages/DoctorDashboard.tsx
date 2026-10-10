import { useEffect, useMemo, useState } from "react";

interface Reading {
  reading_time: string;
  time: string;
  glucose_mg_dl: number;
  meal_carbs_g: number | null;
  meal_description: string;
  is_spike: boolean;
}

interface Meal {
  time: string;
  timestamp: string;
  description: string;
  carbs_g: number;
  glucose_at_meal: number;
}

interface TaskItem {
  time: string;
  type: "meal" | "medication" | "walk" | "sleep";
  label: string;
  description: string;
}

interface TrajectoryPoint {
  horizon_minutes: number;
  projected_glucose_mg_dl: number;
  lower_bound_p10_mg_dl: number;
  upper_bound_p90_mg_dl: number;
}

interface Counterfactual {
  intervention_type: string;
  label: string;
  icon: string;
  mechanism: string;
  simulated_peak_mg_dl: number;
  peak_reduction_mg_dl: number;
  spike_averted: boolean;
  risk_reduction_pct: number;
}

interface DayData {
  date: string;
  readings: Reading[];
  meals: Meal[];
  tasks: TaskItem[];
  stats: {
    total_meals: number;
    total_carbs_g: number;
    mean_glucose: number;
    max_glucose: number;
    min_glucose: number;
    spikes_count: number;
    tir_percent: number;
  };
  future_trajectory: TrajectoryPoint[];
  counterfactuals: Counterfactual[];
}

interface Patient {
  person_id: string;
  display_name: string;
  is_demo: boolean;
  age_years: number;
  sex: string;
  bmi: number;
  years_with_diabetes: number;
  hba1c_percent: number;
  fasting_c_peptide: number;
  creatinine_mg_dl: number;
  egfr: number;
  comorbidities: string;
  medications: string[];
  risk_status: {
    tier: "HIGH" | "WATCH" | "CALM";
    spike_imminent: boolean;
    spike_probability: number;
    projected_peak_mg_dl: number;
    projected_peak_time_min: number;
    reason_simple: string;
    reason_medical: string;
  };
  available_dates: string[];
  default_date: string;
  days: Record<string, DayData>;
}

interface CohortData {
  metadata: {
    title: string;
    condition: string;
    cohort_source: string;
    total_patients: number;
    high_risk_alerts: number;
    watch_count: number;
    calm_count: number;
    average_cohort_tir_percent: number;
    demo_doctor: {
      name: string;
      specialty: string;
      hospital: string;
      department: string;
      email: string;
    };
  };
  patients: Patient[];
}

function formatCardSummary(p: Patient) {
  const match = p.risk_status.reason_simple.match(/(\d+\.?\d*)\s*mg\/dL/);
  const glucose = match ? `${match[1]} mg/dL` : `${p.risk_status.projected_peak_mg_dl || 212} mg/dL`;
  
  const isHigh = p.risk_status.tier === "HIGH";
  const isWatch = p.risk_status.tier === "WATCH";

  if (isHigh) {
    return {
      finding: `${glucose} · Rising trend`,
      driver: "Post-meal Ra(t) > clearance Rd(t)",
    };
  }
  if (isWatch) {
    return {
      finding: `${glucose} · Elevated level`,
      driver: "Borderline clearance Rd(t)",
    };
  }
  return {
    finding: "In Target (70-180 mg/dL)",
    driver: "Euglycemic equilibrium",
  };
}

function getCondensedSimpleRationale(reason: string) {
  const match = reason.match(/(\d+\.?\d*)\s*mg\/dL/);
  const val = match ? match[1] : "212.4";
  if (reason.includes("climb") || reason.includes("Rising") || reason.includes("Elevated") || reason.includes("interstitial")) {
    return `Interstitial sensor reading reached ${val} mg/dL following carbohydrate intake with an ascending rate of change.`;
  }
  return reason;
}

function getCondensedMedicalRationale(reason: string) {
  if (reason.includes("disposal") || reason.includes("appearance")) {
    return `Gut appearance rate Ra(t) exceeded peripheral insulin-mediated clearance Rd(t), precipitating postprandial excursion.`;
  }
  return reason;
}

export function DoctorDashboard() {
  const [cohort, setCohort] = useState<CohortData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters & Selection
  const [selectedPatientId, setSelectedPatientId] = useState("P001");
  const [selectedDate, setSelectedDate] = useState("2021-02-04");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTier, setFilterTier] = useState<"ALL" | "HIGH" | "WATCH" | "CALM">("ALL");

  // In-Silico Active Simulation branch
  const [activeIntervention, setActiveIntervention] = useState<string | null>(null);

  // Toast / Modal state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showFhirModal, setShowFhirModal] = useState(false);

  // Hover cursor state on chart
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useEffect(() => {
    fetch("/doctor-clinic-cohort.json")
      .then((res) => {
        if (!res.ok) throw new Error("Cohort dataset failed to load");
        return res.json();
      })
      .then((data: CohortData) => {
        setCohort(data);
        const demo = data.patients.find((p) => p.is_demo) || data.patients[0];
        if (demo) {
          setSelectedPatientId(demo.person_id);
          setSelectedDate(demo.default_date || demo.available_dates[0] || "2021-02-04");
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load clinical cohort");
        setLoading(false);
      });
  }, []);

  const patient = useMemo(() => {
    if (!cohort) return null;
    return cohort.patients.find((p) => p.person_id === selectedPatientId) || cohort.patients[0];
  }, [cohort, selectedPatientId]);

  // When patient changes, sync default date if needed
  useEffect(() => {
    if (patient && !patient.available_dates.includes(selectedDate)) {
      setSelectedDate(patient.default_date || patient.available_dates[0] || "2021-02-04");
    }
  }, [patient, selectedDate]);

  const dayData: DayData | null = useMemo(() => {
    if (!patient) return null;
    return patient.days[selectedDate] || Object.values(patient.days)[0] || null;
  }, [patient, selectedDate]);

  // Filtered patients list
  const filteredPatients = useMemo(() => {
    if (!cohort) return [];
    return cohort.patients.filter((p) => {
      const matchesSearch =
        p.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.person_id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = filterTier === "ALL" || p.risk_status.tier === filterTier;
      return matchesSearch && matchesFilter;
    });
  }, [cohort, searchQuery, filterTier]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  if (loading) {
    return (
      <div className="doc-loading-container">
        <div className="doc-spinner"></div>
        <div className="doc-loading-text">Loading Doctor Clinical Intelligence Cohort...</div>
      </div>
    );
  }

  if (error || !cohort || !patient || !dayData) {
    return (
      <div className="doc-error-container">
        <div className="doc-error-box">{error || "Unable to display clinical workspace."}</div>
      </div>
    );
  }

  const readings = dayData.readings || [];
  const tasks = dayData.tasks || [];
  const stats = dayData.stats;
  const trajectory = dayData.future_trajectory || [];
  const counterfactuals = dayData.counterfactuals || [];

  // Chart Dimensions & Scaling
  const chartWidth = 920;
  const chartHeight = 240;
  const minG = 40;
  const maxG = 340;
  const highThresholdY = chartHeight - ((180 - minG) / (maxG - minG)) * (chartHeight - 32) - 16;
  const lowThresholdY = chartHeight - ((70 - minG) / (maxG - minG)) * (chartHeight - 32) - 16;

  // Path generator for continuous readings
  const readingPoints = readings.map((r, i) => {
    const x = readings.length > 1 ? (i / (readings.length - 1)) * (chartWidth - 80) + 40 : 40;
    const y = chartHeight - ((r.glucose_mg_dl - minG) / (maxG - minG)) * (chartHeight - 32) - 16;
    return { x, y, r, i };
  });

  const readingsPath =
    readingPoints.length > 1
      ? readingPoints.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ")
      : "";

  // Target safe zone polygon
  const safeZoneYTop = highThresholdY;
  const safeZoneHeight = lowThresholdY - highThresholdY;

  // Future forward forecast trajectory points
  const lastPoint = readingPoints[readingPoints.length - 1];
  const trajPoints = trajectory.map((tp, idx) => {
    const stepX = (chartWidth - 80) / Math.max(readings.length, 1);
    const x = Math.min(chartWidth - 10, (lastPoint ? lastPoint.x : 40) + (idx + 1) * (stepX * 1.5));
    const y = chartHeight - ((tp.projected_glucose_mg_dl - minG) / (maxG - minG)) * (chartHeight - 32) - 16;
    const yP10 = chartHeight - ((tp.lower_bound_p10_mg_dl - minG) / (maxG - minG)) * (chartHeight - 32) - 16;
    const yP90 = chartHeight - ((tp.upper_bound_p90_mg_dl - minG) / (maxG - minG)) * (chartHeight - 32) - 16;
    return { x, y, yP10, yP90, tp };
  });

  const trajPath =
    lastPoint && trajPoints.length > 0
      ? `M${lastPoint.x.toFixed(1)},${lastPoint.y.toFixed(1)} ` +
        trajPoints.map((pt) => `L${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ")
      : "";

  // Active in-silico simulation curve
  let simPath = "";
  const selectedInterventionObj = counterfactuals.find((c) => c.intervention_type === activeIntervention);
  if (selectedInterventionObj && lastPoint && trajPoints.length > 0) {
    const drop = selectedInterventionObj.peak_reduction_mg_dl;
    simPath =
      `M${lastPoint.x.toFixed(1)},${lastPoint.y.toFixed(1)} ` +
      trajPoints
        .map((pt) => {
          const simG = Math.max(70.0, pt.tp.projected_glucose_mg_dl - drop);
          const simY = chartHeight - ((simG - minG) / (maxG - minG)) * (chartHeight - 32) - 16;
          return `L${pt.x.toFixed(1)},${simY.toFixed(1)}`;
        })
        .join(" ");
  }

  // FHIR Bundle representation
  const fhirJson = JSON.stringify(
    {
      resourceType: "Bundle",
      type: "collection",
      timestamp: new Date().toISOString(),
      entry: [
        {
          resource: {
            resourceType: "Observation",
            id: `obs-${patient.person_id}-${selectedDate}`,
            status: "final",
            code: {
              coding: [{ system: "http://loinc.org", code: "15074-8", display: "Glucose [Mass/volume] in Interstitial fluid" }],
            },
            subject: { reference: `Patient/${patient.person_id}`, display: patient.display_name },
            valueQuantity: { value: stats.mean_glucose, unit: "mg/dL", system: "http://unitsofmeasure.org" },
            referenceRange: [{ low: { value: 70 }, high: { value: 180 } }],
          },
        },
        {
          resource: {
            resourceType: "RiskAssessment",
            id: `risk-${patient.person_id}-${selectedDate}`,
            status: "final",
            subject: { reference: `Patient/${patient.person_id}`, display: patient.display_name },
            condition: { coding: [{ system: "http://snomed.info/sct", code: "44054006", display: "Postprandial Hyperglycemic Spike" }] },
            prediction: [
              {
                probabilityDecimal: patient.risk_status.spike_probability,
                qualitativeRisk: { text: `${patient.risk_status.tier} Risk` },
                rationale: patient.risk_status.reason_medical,
              },
            ],
          },
        },
        {
          resource: {
            resourceType: "CarePlan",
            id: `careplan-${patient.person_id}-${selectedDate}`,
            status: "active",
            intent: "plan",
            subject: { reference: `Patient/${patient.person_id}`, display: patient.display_name },
            activity: counterfactuals.map((c) => ({
              detail: {
                kind: "CommunicationRequest",
                description: `${c.label}: Reduces projected peak by ${c.peak_reduction_mg_dl} mg/dL (Simulated Peak: ${c.simulated_peak_mg_dl} mg/dL). ${c.mechanism}`,
                status: c.spike_averted ? "scheduled" : "in-progress",
              },
            })),
          },
        },
      ],
    },
    null,
    2
  );

  return (
    <div className="doctor-dashboard-root">
      {/* Toast Notification */}
      {toastMessage && <div className="doc-toast">{toastMessage}</div>}

      {/* Top Clinical Tracker Bar */}
      <section className="doc-executive-bar">
        <div className="tracker-card total">
          <div className="tracker-tag neutral">COHORT</div>
          <div className="tracker-body">
            <span className="tracker-value">{cohort.metadata.total_patients}</span>
            <span className="tracker-label">Monitored Patients</span>
          </div>
        </div>

        <div
          className={`tracker-card alert ${filterTier === "HIGH" ? "active" : ""}`}
          onClick={() => setFilterTier(filterTier === "HIGH" ? "ALL" : "HIGH")}
          title="Click to filter imminent spike alerts"
        >
          <div className="tracker-tag alert">SPIKE</div>
          <div className="tracker-body">
            <span className="tracker-value text-danger">{cohort.metadata.high_risk_alerts}</span>
            <span className="tracker-label">Spike Alerts Imminent</span>
          </div>
        </div>

        <div
          className={`tracker-card watch ${filterTier === "WATCH" ? "active" : ""}`}
          onClick={() => setFilterTier(filterTier === "WATCH" ? "ALL" : "WATCH")}
          title="Click to filter watch list"
        >
          <div className="tracker-tag watch">WATCH</div>
          <div className="tracker-body">
            <span className="tracker-value text-amber">{cohort.metadata.watch_count}</span>
            <span className="tracker-label">Watch List</span>
          </div>
        </div>

        <div
          className={`tracker-card stable ${filterTier === "CALM" ? "active" : ""}`}
          onClick={() => setFilterTier(filterTier === "CALM" ? "ALL" : "CALM")}
          title="Click to filter stable patients"
        >
          <div className="tracker-tag stable">STABLE</div>
          <div className="tracker-body">
            <span className="tracker-value text-success">{cohort.metadata.calm_count}</span>
            <span className="tracker-label">Stable In-Target</span>
          </div>
        </div>

        <div className="tracker-card tir">
          <div className="tracker-tag tir">TIR</div>
          <div className="tracker-body">
            <span className="tracker-value">{cohort.metadata.average_cohort_tir_percent}%</span>
            <span className="tracker-label">Cohort Avg TIR (70-180)</span>
          </div>
        </div>
      </section>

      {/* Main Workspace Layout */}
      <div className="doc-workspace-grid">
        {/* Left Column: Patient Triage Directory */}
        <aside className="doc-triage-panel">
          <div className="triage-header">
            <div className="triage-title-row">
              <span className="triage-title">Patients Directory</span>
              <span className="triage-badge">{filteredPatients.length} shown</span>
            </div>

            {/* Search Input */}
            <div className="triage-search-box">
              <span className="search-icon-text">SEARCH</span>
              <input
                type="text"
                className="triage-search-input"
                placeholder="Search patient name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="search-clear-btn" onClick={() => setSearchQuery("")}>
                  ×
                </button>
              )}
            </div>

            {/* Risk Tier Filter Chips */}
            <div className="triage-filter-chips">
              {(["ALL", "HIGH", "WATCH", "CALM"] as const).map((tier) => (
                <button
                  key={tier}
                  className={`filter-chip ${filterTier === tier ? "active" : ""} ${tier.toLowerCase()}`}
                  onClick={() => setFilterTier(tier)}
                >
                  {tier === "ALL" && `All (${cohort.patients.length})`}
                  {tier === "HIGH" && `Spike Risk (${cohort.metadata.high_risk_alerts})`}
                  {tier === "WATCH" && `Watch (${cohort.metadata.watch_count})`}
                  {tier === "CALM" && `Stable (${cohort.metadata.calm_count})`}
                </button>
              ))}
            </div>
          </div>

          {/* Patient Cards List */}
          <div className="triage-patient-list">
            {filteredPatients.map((p) => {
              const isSelected = p.person_id === selectedPatientId;
              const isHigh = p.risk_status.tier === "HIGH";
              const isWatch = p.risk_status.tier === "WATCH";
              const cardSummary = formatCardSummary(p);

              return (
                <article
                  key={p.person_id}
                  className={`patient-triage-card ${isSelected ? "selected" : ""} ${isHigh ? "risk-high" : ""} ${isWatch ? "risk-watch" : ""}`}
                  onClick={() => {
                    setSelectedPatientId(p.person_id);
                    setActiveIntervention(null);
                  }}
                >
                  <div className="patient-card-top">
                    <div className="patient-avatar-name">
                      <div className={`patient-mini-avatar ${p.risk_status.tier.toLowerCase()}`}>
                        {p.display_name.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div>
                        <div className="patient-card-name">
                          {p.display_name} {p.is_demo && <span className="demo-flag">DEMO</span>}
                        </div>
                        <div className="patient-card-meta">
                          {p.person_id} · {p.age_years}y {p.sex === "male" ? "M" : "F"} · HbA1c {p.hba1c_percent}%
                        </div>
                      </div>
                    </div>

                    {/* Risk Badge */}
                    <div className={`risk-indicator-pill ${p.risk_status.tier.toLowerCase()}`}>
                      {isHigh && <span className="pulse-beacon"></span>}
                      {isHigh ? `${Math.round(p.risk_status.spike_probability * 100)}% SPIKE RISK` : p.risk_status.tier === "WATCH" ? "WATCH LIST" : "STABLE"}
                    </div>
                  </div>

                  {/* High-Legibility Condensed Clinical Reason Box */}
                  {(isHigh || isWatch) && (
                    <div className="patient-reason-box">
                      <div className="reason-row">
                        <span className="reason-label">SENSOR</span>
                        <span className="reason-val">{cardSummary.finding}</span>
                      </div>
                      <div className="reason-row">
                        <span className="reason-label">DRIVER</span>
                        <span className="reason-val">{cardSummary.driver}</span>
                      </div>
                    </div>
                  )}

                  {/* Bottom Stats Preview */}
                  <div className="patient-card-bottom-row">
                    <span className="mini-stat">
                      BMI <strong>{p.bmi}</strong>
                    </span>
                    <span className="mini-stat">
                      eGFR <strong>{p.egfr}</strong>
                    </span>
                    <span className="mini-stat">
                      Rx <strong>{p.medications[0]?.split(" ")[0] || "Metformin"}</strong>
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </aside>

        {/* Right Column: Detailed Patient Profile, CGM Graph, and In-Silico Levers */}
        <main className="doc-detail-view">
          {/* Patient Profile Header */}
          <header className="doc-patient-profile-card">
            <div className="profile-main-info">
              <div className="profile-avatar-large">
                {patient.display_name.split(" ").map((n) => n[0]).join("")}
              </div>
              <div className="profile-titles">
                <div className="profile-name-row">
                  <h2 className="profile-name">{patient.display_name}</h2>
                  <span className="profile-id-tag">{patient.person_id}</span>
                  {patient.is_demo && <span className="profile-demo-tag">Flagship Demo Patient</span>}
                  <span className={`profile-status-badge ${patient.risk_status.tier.toLowerCase()}`}>
                    {patient.risk_status.tier === "HIGH" ? "Spike Alert Imminent" : patient.risk_status.tier === "WATCH" ? "Watch List" : "Stable In-Target"}
                  </span>
                </div>
                <div className="profile-subtext">
                  Type 2 Diabetes Mellitus ({patient.years_with_diabetes} years) · Comorbidities: {patient.comorbidities}
                </div>
              </div>
            </div>

            {/* Quick Clinical Metrics Grid */}
            <div className="profile-vitals-grid">
              <div className="vital-item">
                <span className="vital-label">HbA1c Lab</span>
                <span className="vital-value text-danger">{patient.hba1c_percent}%</span>
              </div>
              <div className="vital-item">
                <span className="vital-label">BMI</span>
                <span className="vital-value">{patient.bmi} kg/m²</span>
              </div>
              <div className="vital-item">
                <span className="vital-label">Fasting C-Peptide</span>
                <span className="vital-value">{patient.fasting_c_peptide} nmol/L</span>
              </div>
              <div className="vital-item">
                <span className="vital-label">Renal eGFR</span>
                <span className="vital-value">{patient.egfr} mL/min</span>
              </div>
              <div className="vital-item">
                <span className="vital-label">Active Meds</span>
                <span className="vital-value text-truncate" title={patient.medications.join(", ")}>
                  {patient.medications.join(", ")}
                </span>
              </div>
            </div>
          </header>

          {/* Date Switcher & Day Metrics Banner */}
          <div className="doc-date-control-bar">
            <div className="date-picker-cluster">
              <button
                className="date-nav-btn"
                disabled={patient.available_dates.indexOf(selectedDate) <= 0}
                onClick={() => {
                  const currIdx = patient.available_dates.indexOf(selectedDate);
                  if (currIdx > 0) setSelectedDate(patient.available_dates[currIdx - 1]);
                }}
              >
                ← Prev Day
              </button>

              <div className="date-select-wrapper">
                <span className="calendar-label">Date:</span>
                <select
                  className="date-select-dropdown"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                >
                  {patient.available_dates.map((d) => (
                    <option key={d} value={d}>
                      {d} {d === "2021-02-04" ? "• 4 Meals Logged" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <button
                className="date-nav-btn"
                disabled={patient.available_dates.indexOf(selectedDate) >= patient.available_dates.length - 1}
                onClick={() => {
                  const currIdx = patient.available_dates.indexOf(selectedDate);
                  if (currIdx < patient.available_dates.length - 1) {
                    setSelectedDate(patient.available_dates[currIdx + 1]);
                  }
                }}
              >
                Next Day →
              </button>
            </div>

            {/* Daily Summary Chips */}
            <div className="daily-stats-chips">
              <span className="day-stat-chip">
                Meals: <strong>{stats.total_meals}</strong> ({stats.total_carbs_g}g Carbs)
              </span>
              <span className={`day-stat-chip ${stats.spikes_count > 0 ? "highlight-spike" : ""}`}>
                Spikes: <strong>{stats.spikes_count}</strong> (Peak: {stats.max_glucose} mg/dL)
              </span>
              <span className="day-stat-chip">
                TIR: <strong>{stats.tir_percent}%</strong> (70–180)
              </span>
              <span className="day-stat-chip">
                Mean: <strong>{stats.mean_glucose} mg/dL</strong>
              </span>
            </div>
          </div>

          {/* Clinical Decision Rationale Banner */}
          <section className={`doc-rationale-banner ${patient.risk_status.tier.toLowerCase()}`}>
            <div className="rationale-header-row">
              <div className="rationale-title-col">
                <span className="rationale-tag">
                  {patient.risk_status.tier === "HIGH"
                    ? "CRITICAL INCIDENT EXCURSION ALERT"
                    : patient.risk_status.tier === "WATCH"
                    ? "ELEVATED GLYCEMIC MONITORING"
                    : "EUGLYCEMIC STABILITY IN TARGET"}
                </span>
                <span className="rationale-prob">
                  Calibrated Risk: <strong>{Math.round(patient.risk_status.spike_probability * 100)}%</strong> · Projected Peak: <strong>{patient.risk_status.projected_peak_mg_dl} mg/dL</strong>
                </span>
              </div>
              <span className="rationale-source-badge">TreeSHAP Inference</span>
            </div>

            <div className="rationale-content-grid">
              <div className="rationale-block simple">
                <span className="block-label">Sensor Observation & Trajectory</span>
                <p className="block-text">{getCondensedSimpleRationale(patient.risk_status.reason_simple)}</p>
              </div>
              <div className="rationale-block medical">
                <span className="block-label">Biophysical Kinetic Attribution</span>
                <p className="block-text">{getCondensedMedicalRationale(patient.risk_status.reason_medical)}</p>
              </div>
            </div>
          </section>

          {/* Wearable CGM Line Graph Card */}
          <section className="doc-chart-card">
            <div className="chart-card-header">
              <div className="chart-title-group">
                <h3 className="chart-title">Continuous Glucose Monitoring Telemetry (15-min Intervals)</h3>
                <span className="chart-sensor-badge">Abbott FreeStyle Libre Sensor</span>
              </div>

              {/* Chart Legend */}
              <div className="chart-legend-row">
                <div className="legend-item">
                  <span className="legend-dot green"></span> Safe Target (70–180)
                </div>
                <div className="legend-item">
                  <span className="legend-line solid-black"></span> Sensor Reading
                </div>
                <div className="legend-item">
                  <span className="legend-dot red"></span> Spike Marker (≥180)
                </div>
                <div className="legend-item">
                  <span className="legend-line dashed-cyan"></span> 2h Forward Forecast
                </div>
                {activeIntervention && (
                  <div className="legend-item">
                    <span className="legend-line dashed-emerald"></span> In-Silico Simulated
                  </div>
                )}
              </div>
            </div>

            {/* SVG Interactive Graph */}
            <div className="chart-canvas-wrapper">
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="doc-cgm-svg"
                onMouseLeave={() => setHoverIndex(null)}
              >
                <defs>
                  <linearGradient id="safeCorridorGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.12" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.04" />
                  </linearGradient>
                  <linearGradient id="forecastCorridorGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.20" />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.05" />
                  </linearGradient>
                </defs>

                {/* Shaded Target Safe Range Corridor (70 - 180 mg/dL) */}
                <rect
                  x="40"
                  y={safeZoneYTop}
                  width={chartWidth - 50}
                  height={safeZoneHeight}
                  fill="url(#safeCorridorGrad)"
                />

                {/* Upper Target Threshold Line at 180 mg/dL */}
                <line
                  x1="40"
                  y1={highThresholdY}
                  x2={chartWidth - 10}
                  y2={highThresholdY}
                  stroke="#ef4444"
                  strokeWidth="1.2"
                  strokeDasharray="4 4"
                />
                <text x="44" y={highThresholdY - 6} fill="#ef4444" fontSize="10" fontWeight="600">
                  Target Threshold: 180 mg/dL
                </text>

                {/* Lower Threshold Line at 70 mg/dL */}
                <line
                  x1="40"
                  y1={lowThresholdY}
                  x2={chartWidth - 10}
                  y2={lowThresholdY}
                  stroke="#10b981"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text x="44" y={lowThresholdY + 12} fill="#10b981" fontSize="10" fontWeight="500">
                  Target Baseline: 70 mg/dL
                </text>

                {/* Measured Glucose Line */}
                {readingsPath && (
                  <path d={readingsPath} fill="none" stroke="currentColor" strokeWidth="2.5" className="cgm-line" />
                )}

                {/* Spikes Beacon Points */}
                {readingPoints.map((pt) => {
                  if (pt.r.glucose_mg_dl < 180) return null;
                  return (
                    <g key={pt.i}>
                      <circle cx={pt.x} cy={pt.y} r="6" fill="#ef4444" opacity="0.3" className="spike-beacon" />
                      <circle cx={pt.x} cy={pt.y} r="3.5" fill="#ef4444" />
                    </g>
                  );
                })}

                {/* Meal Markers on Graph */}
                {readingPoints.map((pt) => {
                  if (!pt.r.meal_carbs_g || pt.r.meal_carbs_g <= 0) return null;
                  return (
                    <g key={`meal-${pt.i}`}>
                      <line x1={pt.x} y1={pt.y} x2={pt.x} y2={pt.y - 28} stroke="#f59e0b" strokeWidth="1.5" />
                      <rect x={pt.x - 14} y={pt.y - 34} width="28" height="12" rx="2" fill="#f59e0b" />
                      <text x={pt.x} y={pt.y - 25} textAnchor="middle" fill="#000000" fontSize="8" fontWeight="800">
                        MEAL
                      </text>
                      <text x={pt.x} y={pt.y - 38} textAnchor="middle" fill="#f59e0b" fontSize="9" fontWeight="700">
                        {Math.round(pt.r.meal_carbs_g)}g
                      </text>
                    </g>
                  );
                })}

                {/* Forward Forecast Trajectory Line (Cyan Dashed) */}
                {trajPath && (
                  <path
                    d={trajPath}
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth="2.2"
                    strokeDasharray="5 4"
                    className="forecast-line"
                  />
                )}

                {/* Peak Forecast Marker */}
                {trajPoints.length > 0 && (
                  <g>
                    <circle
                      cx={trajPoints[2]?.x || trajPoints[0].x}
                      cy={trajPoints[2]?.y || trajPoints[0].y}
                      r="4"
                      fill="#06b6d4"
                    />
                    <rect
                      x={(trajPoints[2]?.x || trajPoints[0].x) - 55}
                      y={(trajPoints[2]?.y || trajPoints[0].y) - 26}
                      width="110"
                      height="18"
                      rx="4"
                      fill="#06b6d4"
                    />
                    <text
                      x={trajPoints[2]?.x || trajPoints[0].x}
                      y={(trajPoints[2]?.y || trajPoints[0].y) - 14}
                      textAnchor="middle"
                      fill="#000000"
                      fontSize="9.5"
                      fontWeight="700"
                    >
                      Projected Peak: {patient.risk_status.projected_peak_mg_dl}
                    </text>
                  </g>
                )}

                {/* In-Silico Simulated Curve Overlay (Emerald) */}
                {simPath && (
                  <path
                    d={simPath}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2.8"
                    strokeDasharray="4 3"
                    className="simulated-curve-path"
                  />
                )}

                {/* Interactive Hover Vertical Line and Points */}
                {readingPoints.map((pt) => (
                  <rect
                    key={`hover-hit-${pt.i}`}
                    x={pt.x - 5}
                    y="0"
                    width="10"
                    height={chartHeight}
                    fill="transparent"
                    onMouseEnter={() => setHoverIndex(pt.i)}
                    style={{ cursor: "pointer" }}
                  />
                ))}

                {hoverIndex !== null && readingPoints[hoverIndex] && (
                  <g>
                    <line
                      x1={readingPoints[hoverIndex].x}
                      y1="0"
                      x2={readingPoints[hoverIndex].x}
                      y2={chartHeight}
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeDasharray="2 2"
                      opacity="0.5"
                    />
                    <circle
                      cx={readingPoints[hoverIndex].x}
                      cy={readingPoints[hoverIndex].y}
                      r="5"
                      fill="var(--bg-main)"
                      stroke="#ef4444"
                      strokeWidth="2.5"
                    />
                  </g>
                )}
              </svg>

              {/* Hover Tooltip Box */}
              {hoverIndex !== null && readingPoints[hoverIndex] && (
                <div
                  className="chart-hover-tooltip"
                  style={{
                    left: `${Math.min(chartWidth - 140, Math.max(10, readingPoints[hoverIndex].x - 60))}px`,
                    top: "10px",
                  }}
                >
                  <div className="tooltip-time">{readingPoints[hoverIndex].r.time}</div>
                  <div className="tooltip-value">{readingPoints[hoverIndex].r.glucose_mg_dl} mg/dL</div>
                  {readingPoints[hoverIndex].r.meal_carbs_g && (
                    <div className="tooltip-meal">
                      Meal: {readingPoints[hoverIndex].r.meal_carbs_g}g ({readingPoints[hoverIndex].r.meal_description})
                    </div>
                  )}
                  {readingPoints[hoverIndex].r.is_spike && (
                    <div className="tooltip-spike-warning">Spike Threshold Exceeded (≥ 180 mg/dL)</div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Bottom Grid: Chronological Tasks & Meals + In-Silico What-If Interventions */}
          <div className="doc-bottom-panels-grid">
            {/* Panel 1: Chronological Tasks & Meals Timeline */}
            <section className="doc-panel-box tasks-panel">
              <div className="panel-box-header">
                <h4 className="panel-box-title">Patient Day Timeline & Meals</h4>
                <span className="panel-subtitle">Timestamps logged via FreeStyle Libre Telemetry</span>
              </div>

              <div className="doc-timeline-feed">
                {tasks.map((task, idx) => (
                  <div key={idx} className={`timeline-entry-row ${task.type}`}>
                    <div className="entry-time-col">{task.time}</div>
                    <div className="entry-bullet"></div>
                    <div className="entry-content-col">
                      <div className="entry-label">
                        <span className={`task-chip ${task.type}`}>
                          {task.type === "meal" && "MEAL"}
                          {task.type === "medication" && "MEDS"}
                          {task.type === "walk" && "WALK"}
                        </span>{" "}
                        {task.label}
                      </div>
                      <div className="entry-desc">{task.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Panel 2: In-Silico "What-If" Counterfactual Levers */}
            <section className="doc-panel-box interventions-panel">
              <div className="panel-box-header">
                <div className="title-with-actions">
                  <h4 className="panel-box-title">In-Silico Counterfactual Levers ("What-If")</h4>
                  <span className="panel-subtitle">Select an intervention to simulate spike aversion on live graph</span>
                </div>
                <button className="doc-fhir-btn" onClick={() => setShowFhirModal(true)}>
                  Export HL7 FHIR
                </button>
              </div>

              <div className="interventions-cards-grid">
                {counterfactuals.map((c) => {
                  const isActive = activeIntervention === c.intervention_type;
                  return (
                    <div
                      key={c.intervention_type}
                      className={`intervention-card ${isActive ? "active" : ""}`}
                      onClick={() => setActiveIntervention(isActive ? null : c.intervention_type)}
                    >
                      <div className="card-top-row">
                        <span className="intervention-name">
                          <span className={`lever-badge ${c.icon}`}>
                            {c.icon === "walk" && "EXERCISE"}
                            {c.icon === "salad" && "NUTRITION"}
                            {c.icon === "cut" && "PORTION"}
                            {c.icon === "pill" && "PHARMA"}
                          </span>{" "}
                          {c.label}
                        </span>
                        <span className={`averted-tag ${c.spike_averted ? "success" : "neutral"}`}>
                          {c.spike_averted ? "Spike Averted" : "Attenuated"}
                        </span>
                      </div>

                      <div className="card-drop-row">
                        <span className="drop-amount">-{c.peak_reduction_mg_dl} mg/dL</span>
                        <span className="sim-peak">Sim Peak: {c.simulated_peak_mg_dl} mg/dL</span>
                      </div>

                      <div className="card-mechanism-text">{c.mechanism}</div>

                      <button
                        className={`sim-action-btn ${isActive ? "active" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          showToast(`CarePlan sent to ${patient.display_name}'s wearable: "${c.label}"`);
                        }}
                      >
                        Prescribe CarePlan
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </main>
      </div>

      {/* HL7 FHIR R4 Modal */}
      {showFhirModal && (
        <div className="fhir-modal-overlay" onClick={() => setShowFhirModal(false)}>
          <div className="fhir-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="fhir-modal-header">
              <div className="fhir-title-group">
                <h3>HL7 FHIR R4 Bundle Export</h3>
                <p>Standardized Observation, RiskAssessment, and CarePlan resources</p>
              </div>
              <button className="fhir-close-btn" onClick={() => setShowFhirModal(false)}>
                ×
              </button>
            </div>
            <pre className="fhir-code-preview">{fhirJson}</pre>
            <div className="fhir-modal-footer">
              <button
                className="fhir-copy-btn"
                onClick={() => {
                  navigator.clipboard.writeText(fhirJson);
                  showToast("HL7 FHIR R4 Bundle copied to clipboard!");
                }}
              >
                Copy JSON to Clipboard
              </button>
              <button className="fhir-done-btn" onClick={() => setShowFhirModal(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
