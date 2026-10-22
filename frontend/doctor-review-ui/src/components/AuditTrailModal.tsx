import React from "react";
import { ShieldCheckIcon, XIcon, DownloadIcon } from "./Icons";

export interface AuditTrailModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientName: string;
  patientId: string;
}

export const AuditTrailModal: React.FC<AuditTrailModalProps> = ({
  isOpen,
  onClose,
  patientName,
  patientId,
}) => {
  if (!isOpen) return null;

  const auditLogs = [
    {
      id: "LOG-0842-NMC",
      timestamp: "2026-10-22 19:45:10 IST",
      actor: "Dr. Vikram Malhotra MD (MCI-2014-48291)",
      role: "Attending Endocrinologist",
      action: "IN_SILICO_SIMULATION_INTERVENTION",
      details: "Simulated 30-Minute GLUT4 Postprandial Walk counterfactual branch. Projected peak reduction: -21.5 mg/dL.",
      consentHash: "0x8f2c3d19b4e72a8c91d4e5f6a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
      complianceStatus: "VERIFIED_DISHA_ACT_SEC_4",
    },
    {
      id: "LOG-0841-NMC",
      timestamp: "2026-10-22 19:42:04 IST",
      actor: "Dr. Vikram Malhotra MD (MCI-2014-48291)",
      role: "Attending Endocrinologist",
      action: "CAREPLAN_PUSH_TO_WEARABLE",
      details: "Transmitted structured HL7 FHIR R4 CarePlan recommendation to patient smartphone companion.",
      consentHash: "0x7a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b",
      complianceStatus: "VERIFIED_DISHA_ACT_SEC_4",
    },
    {
      id: "LOG-0840-NMC",
      timestamp: "2026-10-22 19:35:18 IST",
      actor: "AI Decision Support Engine (XGBoost v1.4.2)",
      role: "Digital Twin Microservice",
      action: "PREDICTIVE_RISK_ASSESSMENT_GENERATED",
      details: "2h Spike Probability calculated: 0.88. Calibrated risk tier: HIGH. TreeSHAP driver attribution logged.",
      consentHash: "0x6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5e",
      complianceStatus: "VERIFIED_NMC_AI_GUIDELINES",
    },
    {
      id: "LOG-0839-NMC",
      timestamp: "2026-10-22 19:30:00 IST",
      actor: "Abbott FreeStyle Libre Sensor Telemetry Bridge",
      role: "Wearable IoT Gateway",
      action: "CONTINUOUS_TELEMETRY_SYNC",
      details: "Ingested 15-min sensor glucose packet: 192 mg/dL. Signal Quality: 99.4%. Timestamp verified against NTP hospital clock.",
      consentHash: "0x5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d",
      complianceStatus: "VERIFIED_ISO_27799",
    },
  ];

  return (
    <div className="fhir-modal-overlay" onClick={onClose}>
      <div className="audit-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="fhir-modal-header">
          <div className="fhir-title-group">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <ShieldCheckIcon size={20} color="#10b981" />
              <h3 style={{ margin: 0, fontSize: "16px", color: "var(--text-primary)" }}>
                Regulatory Compliance Audit Trail & NMC Governance Log
              </h3>
            </div>
            <p style={{ margin: "4px 0 0", fontSize: "11.5px", color: "var(--text-secondary)" }}>
              National Medical Commission (NMC) & DISHA Act 2026 tamper-evident cryptographic log for Patient {patientName} ({patientId})
            </p>
          </div>
          <button className="fhir-close-btn" onClick={onClose}>
            <XIcon size={16} />
          </button>
        </div>

        <div className="audit-compliance-banner">
          <div className="banner-badge">
            <ShieldCheckIcon size={14} color="#10b981" />
            <span>DISHA & NMC COMPLIANT</span>
          </div>
          <div className="banner-text">
            All AI inferences, clinician overrides, and wearable telemetry syncs are cryptographically hashed using SHA-256 and immutably timestamped in compliance with Indian Digital Personal Data Protection (DPDP) Act and NMC AI Ethics Guidelines.
          </div>
        </div>

        <div className="audit-logs-table-wrapper">
          <table className="audit-logs-table">
            <thead>
              <tr>
                <th>Log ID & Time</th>
                <th>Actor & Registration</th>
                <th>Action Type</th>
                <th>Clinical Event Details</th>
                <th>Cryptographic Consent Hash</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td>
                    <div className="audit-id-col">
                      <strong className="log-id">{log.id}</strong>
                      <span className="log-time">{log.timestamp}</span>
                    </div>
                  </td>
                  <td>
                    <div className="audit-actor-col">
                      <strong className="actor-name">{log.actor}</strong>
                      <span className="actor-role">{log.role}</span>
                    </div>
                  </td>
                  <td>
                    <span className="audit-action-pill">{log.action}</span>
                  </td>
                  <td className="details-col">{log.details}</td>
                  <td>
                    <span className="hash-code" title={log.consentHash}>
                      {log.consentHash.substring(0, 16)}...
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="audit-modal-footer">
          <button
            className="fhir-copy-btn"
            onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(auditLogs, null, 2));
              alert("Audit trail exported and copied to clipboard!");
            }}
          >
            <DownloadIcon size={13} />
            <span>Export Tamper-Evident Audit JSON</span>
          </button>
          <button className="fhir-done-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
