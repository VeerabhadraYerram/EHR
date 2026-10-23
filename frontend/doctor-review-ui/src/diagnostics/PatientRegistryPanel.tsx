import { useState, useMemo } from "react";
import type { Patient } from "./types";
import {
  Search,
  User,
  Activity,
  AlertTriangle,
  ShieldCheck,
  HeartPulse,
  Pill,
  FileText,
  ChevronRight,
} from "lucide-react";

interface PatientRegistryPanelProps {
  patients: Patient[];
  selectedPatientId: string;
  onSelectPatient: (patientId: string) => void;
  onNavigate?: (page: any) => void;
}

export default function PatientRegistryPanel({
  patients,
  selectedPatientId,
  onSelectPatient,
  onNavigate,
}: PatientRegistryPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<
    "ALL" | "HIGH" | "WATCH" | "CALM" | "UNKNOWN"
  >("ALL");
  const [sortBy, setSortBy] = useState<"tier" | "hba1c" | "age" | "id">("tier");

  const selectedPatient = useMemo(() => {
    return (
      patients.find((p) => p.person_id === selectedPatientId) || patients[0]
    );
  }, [patients, selectedPatientId]);

  const counts = useMemo(() => {
    return {
      all: patients.length,
      high: patients.filter((p) => p.risk_status?.tier === "HIGH").length,
      watch: patients.filter((p) => p.risk_status?.tier === "WATCH").length,
      calm: patients.filter((p) => p.risk_status?.tier === "CALM").length,
      unknown: patients.filter((p) => !p.risk_status).length,
    };
  }, [patients]);

  const filteredPatients = useMemo(() => {
    const list = patients.filter((p) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        p.person_id.toLowerCase().includes(q) ||
        p.display_name.toLowerCase().includes(q) ||
        (p.comorbidities && p.comorbidities.toLowerCase().includes(q)) ||
        (p.split && p.split.toLowerCase().includes(q));

      const matchesTier =
        tierFilter === "ALL" ||
        (tierFilter === "UNKNOWN"
          ? !p.risk_status
          : p.risk_status?.tier === tierFilter);
      return matchesSearch && matchesTier;
    });

    return list.sort((a, b) => {
      if (sortBy === "hba1c") return Number(b.hba1c_percent || 0) - Number(a.hba1c_percent || 0);
      if (sortBy === "age") return Number(b.age_years || 0) - Number(a.age_years || 0);
      if (sortBy === "id") return a.person_id.localeCompare(b.person_id);
      // default: tier
      const rank = (t?: string) => (t === "HIGH" ? 3 : t === "WATCH" ? 2 : t === "CALM" ? 1 : 0);
      return rank(b.risk_status?.tier) - rank(a.risk_status?.tier);
    });
  }, [patients, searchQuery, tierFilter, sortBy]);

  return (
    <div className="dx-left-registry-stack">
      {/* PANEL 1: PATIENT COHORT DIRECTORY (100 PATIENTS) */}
      <section className="dx-panel dx-registry-panel">
        <header className="dx-panel-heading">
          <h2>
            <span>COHORT /</span> {patients.length} DEMONSTRATION PROFILES
          </h2>
          <span className="dx-panel-tag">API REGISTRY</span>
        </header>

        <div className="dx-registry-controls">
          <div className="dx-search-box">
            <Search size={12} className="dx-search-icon" />
            <input
              type="text"
              placeholder="Search by ID, name or comorbidity…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search patient cohort"
            />
            {searchQuery && (
              <button
                className="dx-clear-search"
                onClick={() => setSearchQuery("")}
              >
                ×
              </button>
            )}
          </div>

          <div
            className="dx-tier-filter-row"
            role="group"
            aria-label="Risk Tier Filter"
          >
            <button
              className={`dx-tier-btn ${tierFilter === "ALL" ? "active" : ""}`}
              onClick={() => setTierFilter("ALL")}
            >
              ALL ({counts.all})
            </button>
            <button
              className={`dx-tier-btn high ${tierFilter === "HIGH" ? "active" : ""}`}
              onClick={() => setTierFilter("HIGH")}
            >
              HIGH ({counts.high})
            </button>
            <button
              className={`dx-tier-btn watch ${tierFilter === "WATCH" ? "active" : ""}`}
              onClick={() => setTierFilter("WATCH")}
            >
              WATCH ({counts.watch})
            </button>
            <button
              className={`dx-tier-btn calm ${tierFilter === "CALM" ? "active" : ""}`}
              onClick={() => setTierFilter("CALM")}
            >
              STABLE ({counts.calm})
            </button>
            <button
              className={`dx-tier-btn ${tierFilter === "UNKNOWN" ? "active" : ""}`}
              onClick={() => setTierFilter("UNKNOWN")}
            >
              UNSCORED ({counts.unknown})
            </button>
          </div>

          {/* Quick Sort Selector */}
          <div className="dx-sort-bar">
            <span>Sort:</span>
            <button
              type="button"
              className={`sort-pill ${sortBy === "tier" ? "active" : ""}`}
              onClick={() => setSortBy("tier")}
            >
              Risk Tier
            </button>
            <button
              type="button"
              className={`sort-pill ${sortBy === "hba1c" ? "active" : ""}`}
              onClick={() => setSortBy("hba1c")}
            >
              HbA1c
            </button>
            <button
              type="button"
              className={`sort-pill ${sortBy === "age" ? "active" : ""}`}
              onClick={() => setSortBy("age")}
            >
              Age
            </button>
            <button
              type="button"
              className={`sort-pill ${sortBy === "id" ? "active" : ""}`}
              onClick={() => setSortBy("id")}
            >
              Patient ID
            </button>
          </div>
        </div>

        <div
          className="dx-patient-scroll-list"
          role="region"
          aria-label="Patient directory"
        >
          {filteredPatients.map((p) => {
            const isSelected = p.person_id === selectedPatient?.person_id;
            const tier = p.risk_status?.tier || "UNKNOWN";
            return (
              <button
                key={p.person_id}
                className={`dx-patient-card ${tier.toLowerCase()} ${isSelected ? "selected" : ""}`}
                onClick={() => onSelectPatient(p.person_id)}
                aria-label={`Select ${p.person_id} ${p.display_name}`}
                aria-pressed={isSelected}
              >
                <div className="dx-patient-card-left">
                  <div className="dx-patient-avatar">
                    <User size={13} />
                  </div>
                  <div>
                    <div className="dx-patient-id-name">
                      <strong>{p.person_id}</strong>
                      <span>{p.display_name}</span>
                    </div>
                    <div className="dx-patient-meta">
                      {p.age_years}y · {p.sex.charAt(0).toUpperCase()} · BMI{" "}
                      {p.bmi} · {p.years_with_diabetes}y T2DM
                    </div>
                  </div>
                </div>

                <div className="dx-patient-card-right">
                  <div className={`dx-risk-badge ${tier.toLowerCase()}`}>
                    {tier === "HIGH" && <AlertTriangle size={10} />}
                    {tier === "WATCH" && <Activity size={10} />}
                    {tier === "CALM" && <ShieldCheck size={10} />}
                    <span>{tier === "UNKNOWN" ? "UNSCORED" : tier}</span>
                  </div>
                  <div className="dx-patient-hba1c">
                    HbA1c <strong>{p.hba1c_percent}%</strong>
                    {p.risk_status?.decision_time && (
                      <small className="risk-asof">
                        {p.risk_status.decision_time
                          .slice(0, 16)
                          .replace("T", " ")}
                      </small>
                    )}
                  </div>
                </div>

                {isSelected && (
                  <ChevronRight size={14} className="dx-patient-arrow" />
                )}
              </button>
            );
          })}
          {filteredPatients.length === 0 && (
            <div className="dx-empty-list">
              No patients match "{searchQuery}"
            </div>
          )}
        </div>
        <i className="dx-panel-decoration" />
      </section>

      {/* PANEL 2: EHR CLINICAL PROFILE & TELEMETRY */}
      {selectedPatient && (
        <section className="dx-panel dx-profile-panel">
          <header className="dx-panel-heading">
            <h2>
              <span>EHR /</span> CLINICAL PROFILE & LABS
            </h2>
            <span className="dx-panel-tag">
              SPLIT: {(selectedPatient.split || "LEARN").toUpperCase()}
            </span>
          </header>

          <div className="dx-profile-body">
            {/* Patient Header Banner */}
            <div className="dx-profile-hero">
              <div className="dx-profile-avatar">
                <HeartPulse size={18} />
              </div>
              <div className="dx-profile-hero-text">
                <h3>{selectedPatient.display_name}</h3>
                <p>
                  <span>{selectedPatient.person_id}</span> ·{" "}
                  {selectedPatient.age_years} yrs ·{" "}
                  {selectedPatient.sex.toUpperCase()} · BMI{" "}
                  <strong>{selectedPatient.bmi}</strong> ·{" "}
                  {selectedPatient.years_with_diabetes} yrs T2DM
                </p>
              </div>
              <div
                className={`dx-profile-tier-badge ${(selectedPatient.risk_status?.tier || "unknown").toLowerCase()}`}
              >
                {selectedPatient.risk_status
                  ? `${selectedPatient.risk_status.tier} RISK`
                  : "UNSCORED"}
              </div>
            </div>

            {/* Quick Actions Shortcuts */}
            {onNavigate && (
              <div className="dx-patient-quick-actions">
                <button
                  type="button"
                  className="button primary"
                  onClick={() => onNavigate("forecast")}
                >
                  <Activity size={13} />
                  <span>Forecast & Timeline</span>
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => onNavigate("scenarios")}
                >
                  <HeartPulse size={13} />
                  <span>What-If Scenarios</span>
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => onNavigate("reports")}
                >
                  <FileText size={13} />
                  <span>Clinical Dossier</span>
                </button>
              </div>
            )}

            {/* Diagnostic Codes */}
            <div className="dx-coding-strip">
              <FileText size={11} />
              <span>DIAGNOSIS: Type 2 Diabetes Mellitus</span>
              <strong>ICD-10: {selectedPatient.icd10_code || "E11.9"}</strong>
              <small>SNOMED: {selectedPatient.snomed_code || "44054006"}</small>
            </div>

            {/* Comprehensive Metabolic Labs Grid */}
            <div className="dx-labs-grid">
              <div className="dx-lab-cell">
                <span className="dx-lab-label">HbA1c</span>
                <strong className="dx-lab-value highlight">
                  {selectedPatient.hba1c_percent}
                  <small>%</small>
                </strong>
                <span className="dx-lab-target">Target: &lt;7.0%</span>
              </div>

              <div className="dx-lab-cell">
                <span className="dx-lab-label">FASTING GLUCOSE</span>
                <strong className="dx-lab-value">
                  {selectedPatient.fasting_glucose_mg_dl}
                  <small>mg/dL</small>
                </strong>
                <span className="dx-lab-target">Target: 70-130</span>
              </div>

              <div className="dx-lab-cell">
                <span className="dx-lab-label">POSTPRANDIAL LAB GLUCOSE</span>
                <strong className="dx-lab-value alert">
                  {selectedPatient.postprandial_glucose_mg_dl}
                  <small>mg/dL</small>
                </strong>
                <span className="dx-lab-target">&lt;180 mg/dL</span>
              </div>

              <div className="dx-lab-cell">
                <span className="dx-lab-label">FASTING C-PEPTIDE</span>
                <strong className="dx-lab-value">
                  {selectedPatient.fasting_c_peptide_nmol_l}
                  <small>nmol/L</small>
                </strong>
                <span className="dx-lab-target">Beta-cell reserve</span>
              </div>

              <div className="dx-lab-cell">
                <span className="dx-lab-label">eGFR (RENAL)</span>
                <strong className="dx-lab-value">
                  {selectedPatient.egfr}
                  <small>mL/min</small>
                </strong>
                <span className="dx-lab-target">&gt;60 mL/min</span>
              </div>

              <div className="dx-lab-cell">
                <span className="dx-lab-label">SERUM CREATININE</span>
                <strong className="dx-lab-value">
                  {selectedPatient.creatinine_mg_dl}
                  <small>mg/dL</small>
                </strong>
                <span className="dx-lab-target">0.6 - 1.2</span>
              </div>
            </div>

            {/* Active Medications */}
            <div className="dx-medications-section">
              <div className="dx-section-title">
                <Pill size={11} />
                <span>PRESCRIBED PHARMACOTHERAPY</span>
              </div>
              <div className="dx-meds-pills-wrap">
                {selectedPatient.hypoglycemic_agents_raw ? (
                  selectedPatient.hypoglycemic_agents_raw
                    .split(",")
                    .filter(Boolean)
                    .map((m, idx) => (
                      <span key={idx} className="dx-med-pill">
                        {m.trim()}
                      </span>
                    ))
                ) : (
                  <span className="dx-med-pill">
                    No medication details recorded
                  </span>
                )}
                {selectedPatient.on_metformin === "yes" &&
                  !selectedPatient.hypoglycemic_agents_raw
                    ?.toLowerCase()
                    .includes("metformin") && (
                    <span className="dx-med-pill">
                      Metformin prescribed · dose not supplied
                    </span>
                  )}
                {selectedPatient.on_insulin === "yes" &&
                  !selectedPatient.hypoglycemic_agents_raw
                    ?.toLowerCase()
                    .includes("insulin") && (
                    <span className="dx-med-pill alert">
                      Insulin prescribed · formulation not supplied
                    </span>
                  )}
              </div>
            </div>

            {/* Comorbidities */}
            {selectedPatient.comorbidities &&
              selectedPatient.comorbidities !== "none" && (
                <div className="dx-comorbidities-section">
                  <div className="dx-section-title">
                    <Activity size={11} />
                    <span>RECORDED COMORBIDITIES</span>
                  </div>
                  <div className="dx-comorbid-pills">
                    {selectedPatient.comorbidities.split(",").map((c, idx) => (
                      <span key={idx} className="dx-comorbid-tag">
                        {c.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              )}
          </div>
          <i className="dx-panel-decoration" />
        </section>
      )}
    </div>
  );
}
