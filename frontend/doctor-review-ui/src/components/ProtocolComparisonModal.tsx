import React from "react";
import { ShieldCheckIcon, XIcon } from "./Icons";

export interface ProtocolComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeGuideline: "ADA" | "RSSDI_STRICT" | "RSSDI_STANDARD";
  onSelectGuideline: (guideline: "ADA" | "RSSDI_STRICT" | "RSSDI_STANDARD") => void;
}

export const ProtocolComparisonModal: React.FC<ProtocolComparisonModalProps> = ({
  isOpen,
  onClose,
  activeGuideline,
  onSelectGuideline,
}) => {
  if (!isOpen) return null;

  const protocols = [
    {
      id: "ADA" as const,
      name: "ADA 2024 Consensus Standard",
      organization: "American Diabetes Association",
      targetCeiling: "180 mg/dL",
      range: "70 – 180 mg/dL",
      tirGoal: "> 70%",
      fastingTarget: "80 – 130 mg/dL",
      postprandialPeak: "< 180 mg/dL",
      hypoCeiling: "< 70 mg/dL (< 4%)",
      targetCohort: "Standard Adult Type 2 Diabetes (Global Western Phenotype)",
      rationale: "Broad international consensus balancing spike prevention against hypoglycemia risks in diverse populations.",
      color: "#0ea5e9",
    },
    {
      id: "RSSDI_STRICT" as const,
      name: "RSSDI 2022 Indian Phenotype (Strict)",
      organization: "Research Society for Study of Diabetes in India",
      targetCeiling: "140 mg/dL",
      range: "70 – 140 mg/dL",
      tirGoal: "> 75%",
      fastingTarget: "70 – 110 mg/dL",
      postprandialPeak: "< 140 mg/dL",
      hypoCeiling: "< 70 mg/dL (< 1%)",
      targetCohort: "Young / Active Asian Indian Patients & Early T2DM",
      rationale: "Strict postprandial control designed for the 'Thin-Fat' Asian Indian phenotype with elevated visceral adiposity, high carbohydrate staple surges, and early beta-cell exhaustion.",
      color: "#ef4444",
      highlight: true,
    },
    {
      id: "RSSDI_STANDARD" as const,
      name: "RSSDI 2022 Indian Phenotype (Standard)",
      organization: "Research Society for Study of Diabetes in India",
      targetCeiling: "160 mg/dL",
      range: "70 – 160 mg/dL",
      tirGoal: "> 70%",
      fastingTarget: "80 – 120 mg/dL",
      postprandialPeak: "< 160 mg/dL",
      hypoCeiling: "< 70 mg/dL (< 2%)",
      targetCohort: "Established Indian T2DM with high-glycemic rice/roti diet",
      rationale: "Tailored intermediate ceiling reflecting the carbohydrate load of traditional Indian diets without inducing nocturnal hypoglycemia.",
      color: "#f59e0b",
    },
    {
      id: "WHO" as const,
      name: "WHO Global Essential Guideline",
      organization: "World Health Organization",
      targetCeiling: "200 mg/dL",
      range: "70 – 200 mg/dL",
      tirGoal: "> 60%",
      fastingTarget: "90 – 140 mg/dL",
      postprandialPeak: "< 200 mg/dL",
      hypoCeiling: "< 70 mg/dL (< 5%)",
      targetCohort: "Low-resource primary care and elderly comorbid patients",
      rationale: "Minimum clinical safety threshold focusing primarily on acute symptomatic prevention and severe hypoglycemia avoidance.",
      color: "#8b5cf6",
      isSelectable: false,
    },
  ];

  return (
    <div className="fhir-modal-overlay" onClick={onClose}>
      <div className="protocol-comparison-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="fhir-modal-header">
          <div className="fhir-title-group">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <ShieldCheckIcon size={20} color="#0ea5e9" />
              <h3 style={{ margin: 0, fontSize: "16px", color: "var(--text-primary)" }}>
                Clinical Practice Guidelines: India vs Global Consensus
              </h3>
            </div>
            <p style={{ margin: "4px 0 0", fontSize: "11.5px", color: "var(--text-secondary)" }}>
              Side-by-side comparison of ADA, RSSDI Asian Indian Phenotype, and WHO glycemic target frameworks
            </p>
          </div>
          <button className="fhir-close-btn" onClick={onClose}>
            <XIcon size={16} />
          </button>
        </div>

        <div className="protocol-comparison-table-wrapper">
          <table className="protocol-comparison-table">
            <thead>
              <tr>
                <th>Clinical Metric</th>
                {protocols.map((p) => (
                  <th key={p.id} className={activeGuideline === p.id ? "active-col" : ""}>
                    <div className="proto-col-header">
                      <span className="proto-name" style={{ color: p.color }}>{p.name}</span>
                      <span className="proto-org">{p.organization}</span>
                      {activeGuideline === p.id && (
                        <span className="proto-active-pill">ACTIVE TARGET</span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="metric-name-col">Target Corridor</td>
                {protocols.map((p) => (
                  <td key={p.id} className={activeGuideline === p.id ? "active-col" : ""}>
                    <strong style={{ color: p.color, fontSize: "13px" }}>{p.range}</strong>
                  </td>
                ))}
              </tr>
              <tr>
                <td className="metric-name-col">Postprandial Ceiling</td>
                {protocols.map((p) => (
                  <td key={p.id} className={activeGuideline === p.id ? "active-col" : ""}>
                    <strong>{p.postprandialPeak}</strong>
                  </td>
                ))}
              </tr>
              <tr>
                <td className="metric-name-col">TIR Goal (70-180)</td>
                {protocols.map((p) => (
                  <td key={p.id} className={activeGuideline === p.id ? "active-col" : ""}>
                    {p.tirGoal}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="metric-name-col">Fasting Plasma Glucose</td>
                {protocols.map((p) => (
                  <td key={p.id} className={activeGuideline === p.id ? "active-col" : ""}>
                    {p.fastingTarget}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="metric-name-col">Hypoglycemia Tolerance</td>
                {protocols.map((p) => (
                  <td key={p.id} className={activeGuideline === p.id ? "active-col" : ""}>
                    {p.hypoCeiling}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="metric-name-col">Target Population</td>
                {protocols.map((p) => (
                  <td key={p.id} className={activeGuideline === p.id ? "active-col" : ""} style={{ fontSize: "11px" }}>
                    {p.targetCohort}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="metric-name-col">Biophysical Rationale</td>
                {protocols.map((p) => (
                  <td key={p.id} className={activeGuideline === p.id ? "active-col" : ""} style={{ fontSize: "10.5px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    {p.rationale}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="metric-name-col">Dashboard Selection</td>
                {protocols.map((p) => (
                  <td key={p.id} className={activeGuideline === p.id ? "active-col" : ""}>
                    {p.isSelectable !== false ? (
                      <button
                        className={`proto-select-btn ${activeGuideline === p.id ? "active" : ""}`}
                        onClick={() => {
                          onSelectGuideline(p.id as any);
                          onClose();
                        }}
                      >
                        {activeGuideline === p.id ? "Currently Active" : "Apply Protocol"}
                      </button>
                    ) : (
                      <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Reference Only</span>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="protocol-footer-note">
          <strong>Asian Indian Phenotype Clinical Note: </strong>
          The 2022 RSSDI Guidelines recommend stricter postprandial glycemic thresholds (≤140 or ≤160 mg/dL) for Asian Indians because the high-carbohydrate staple diet, coupled with reduced beta-cell insulin reserve and high visceral adiposity, causes premature macrovascular endothelial damage at lower thresholds than Western cohorts.
        </div>
      </div>
    </div>
  );
};
