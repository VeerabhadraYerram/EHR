import React, { useState, useEffect } from "react";

interface PatientInfo {
  id: string;
  mrn?: string;
  name: string;
  dob?: string;
  gender?: string;
  phone?: string;
  address?: string;
}

interface SourceFragment {
  id: string;
  fragment_index: number;
  original_text: string;
  speaker?: string;
  confidence: number;
  bounding_box?: any;
}

interface SourceDocument {
  id: string;
  source_type: string;
  encounter_id?: string;
  patient_id?: string;
  document_class?: string;
  origin?: string;
  originating_facility_name?: string;
  capture_timestamp: string;
  minio_raw_path: string;
  sha256_checksum: string;
  overall_confidence: number;
  status: string;
  identity_hint_fields?: any;
  raw_text?: string;
  fragment_count: number;
  fragments?: SourceFragment[];
}

const API_BASE = "http://localhost:8000";

export const PatientDashboard: React.FC = () => {
  const [patient, setPatient] = useState<PatientInfo>({
    id: "PT-SESSION-55210",
    mrn: "HOSP-MRN-55210",
    name: "Rohan Sharma",
    dob: "1972-03-14",
    gender: "Male (54y)",
    phone: "+91-98xxxxxx10",
    address: "12 MG Road, Pune"
  });

  const [documents, setDocuments] = useState<SourceDocument[]>([]);
  const [activeTab, setActiveTab] = useState<string>("ALL");
  const [selectedDoc, setSelectedDoc] = useState<SourceDocument | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [nlpResults, setNlpResults] = useState<any | null>(null);
  const [inspectModalOpen, setInspectModalOpen] = useState<boolean>(false);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/documents`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
      const pRes = await fetch(`${API_BASE}/api/v1/patients`);
      if (pRes.ok) {
        const pList = await pRes.json();
        if (pList && pList.length > 0) {
          const first = pList[0];
          setPatient({
            id: first.id,
            mrn: first.mrn || first.id,
            name: first.name,
            dob: first.dob || "1972-03-14",
            gender: first.gender || "Male",
            phone: first.phone || "+91-98xxxxxx10",
            address: first.address || "12 MG Road, Pune"
          });
        }
      }
    } catch (e) {
      console.warn("Backend API not reachable yet, using sample state:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleSeedSamples = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/seed/samples`, { method: "POST" });
      if (res.ok) {
        await fetchDocuments();
      }
    } catch (e) {
      console.error("Failed to seed samples:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleInspectDoc = async (doc: SourceDocument) => {
    setSelectedDoc(doc);
    setNlpResults(null);
    setInspectModalOpen(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/documents/${doc.id}`);
      if (res.ok) {
        const fullDoc = await res.json();
        setSelectedDoc(fullDoc);
      }
    } catch (e) {
      console.error("Failed to load full document details:", e);
    }
  };

  const handleRunNlp = async (doc: SourceDocument) => {
    setSelectedDoc(doc);
    setLoading(true);
    setInspectModalOpen(true);
    try {
      const textToExtract = doc.raw_text || (doc.fragments && doc.fragments.map(f => f.original_text).join(" ")) || "";
      const res = await fetch(`${API_BASE}/api/v1/nlp/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_id: doc.id,
          encounter_id: doc.encounter_id,
          patient_id: doc.patient_id,
          text: textToExtract,
          source_type: doc.source_type
        })
      });
      if (res.ok) {
        const nlpData = await res.json();
        setNlpResults(nlpData);
      }
    } catch (e) {
      console.error("Failed to extract clinical entities:", e);
    } finally {
      setLoading(false);
    }
  };

  const filteredDocs = documents.filter((d) => {
    if (activeTab === "ALL") return true;
    if (activeTab === "STT") return d.source_type === "SPEECH_TO_TEXT";
    if (activeTab === "OCR") return d.source_type === "OCR";
    if (activeTab === "HISTORICAL") return d.source_type === "HISTORICAL_DOCUMENT";
    if (activeTab === "HL7") return d.source_type === "HL7_API_JSON";
    return true;
  });

  const getSourceBadge = (type: string) => {
    switch (type) {
      case "SPEECH_TO_TEXT":
        return <span className="source-type-tag">STT // Audio</span>;
      case "OCR":
        return <span className="source-type-tag">OCR // Rx</span>;
      case "HISTORICAL_DOCUMENT":
        return <span className="source-type-tag">HIST // Record</span>;
      case "HL7_API_JSON":
        return <span className="source-type-tag">HL7 // LIS</span>;
      default:
        return <span className="source-type-tag">{type}</span>;
    }
  };

  return (
    <div className="dashboard-container">
      {/* Patient Header Banner */}
      <div className="patient-banner">
        <div className="patient-primary">
          <div className="patient-avatar">RS</div>
          <div>
            <div className="patient-name">{patient.name}</div>
            <div className="patient-meta-row">
              <span><strong>MRN:</strong> {patient.mrn || patient.id}</span>
              <span>/</span>
              <span><strong>DOB:</strong> {patient.dob}</span>
              <span>/</span>
              <span><strong>Gender:</strong> {patient.gender}</span>
              <span>/</span>
              <span><strong>Phone:</strong> {patient.phone}</span>
            </div>
          </div>
        </div>

        <div className="patient-quick-stats">
          <div className="stat-item">
            <span className="stat-label">Active Session</span>
            <span className="stat-value" style={{ fontFamily: "var(--font-mono)", fontSize: 15 }}>ENC-778901</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Ingested Sources</span>
            <span className="stat-value">{documents.length}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Identity State</span>
            <span className="stat-value" style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5 }}>Verified</span>
          </div>
        </div>
      </div>

      {/* Action Bar & Tabs */}
      <div className="action-controls-bar">
        <div className="tab-nav">
          <button
            className={`tab-btn ${activeTab === "ALL" ? "active" : ""}`}
            onClick={() => setActiveTab("ALL")}
          >
            All Inputs <span className="pill-count">{documents.length}</span>
          </button>
          <button
            className={`tab-btn ${activeTab === "STT" ? "active" : ""}`}
            onClick={() => setActiveTab("STT")}
          >
            Speech Transcripts <span className="pill-count">{documents.filter(d => d.source_type === "SPEECH_TO_TEXT").length}</span>
          </button>
          <button
            className={`tab-btn ${activeTab === "OCR" ? "active" : ""}`}
            onClick={() => setActiveTab("OCR")}
          >
            OCR Prescriptions <span className="pill-count">{documents.filter(d => d.source_type === "OCR").length}</span>
          </button>
          <button
            className={`tab-btn ${activeTab === "HISTORICAL" ? "active" : ""}`}
            onClick={() => setActiveTab("HISTORICAL")}
          >
            Historical Records <span className="pill-count">{documents.filter(d => d.source_type === "HISTORICAL_DOCUMENT").length}</span>
          </button>
          <button
            className={`tab-btn ${activeTab === "HL7" ? "active" : ""}`}
            onClick={() => setActiveTab("HL7")}
          >
            HL7 Feeds <span className="pill-count">{documents.filter(d => d.source_type === "HL7_API_JSON").length}</span>
          </button>
        </div>

        <div className="button-group">
          <button className="btn btn-secondary" onClick={fetchDocuments} disabled={loading}>
            ↻ Refresh
          </button>
          <button className="btn btn-primary" onClick={handleSeedSamples} disabled={loading}>
            + Seed Test Payloads
          </button>
        </div>
      </div>

      {/* Feed Cards Grid */}
      {filteredDocs.length === 0 ? (
        <div style={{
          textAlign: "center",
          padding: "60px 20px",
          background: "var(--bg-surface)",
          border: "1px dashed var(--border-subtle)",
          borderRadius: "var(--radius-md)"
        }}>
          <p style={{ color: "var(--text-secondary)", marginBottom: "16px", fontSize: 14 }}>
            No ingested documents in this stream yet.
          </p>
          <button className="btn btn-primary" onClick={handleSeedSamples}>
            Load Sample Payloads (OCR, STT, Historical, HL7)
          </button>
        </div>
      ) : (
        <div className="feed-grid">
          {filteredDocs.map((doc) => (
            <div key={doc.id} className="source-card">
              <div className="source-card-header">
                {getSourceBadge(doc.source_type)}
                <span className="doc-id-text">{doc.id}</span>
              </div>

              <div className="source-meta-row">
                <span>Facility: <strong>{doc.originating_facility_name || "Metro Clinic"}</strong></span>
                <span>/</span>
                <span>Conf: <strong>{(doc.overall_confidence * 100).toFixed(0)}%</strong></span>
                <span>/</span>
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                  [{doc.status}]
                </span>
              </div>

              <div className="source-content-box">
                {doc.raw_text || "Raw textual content archived in MinIO."}
              </div>

              {/* Historical hint callout */}
              {doc.identity_hint_fields && (
                <div style={{
                  marginTop: 10,
                  padding: "8px 12px",
                  background: "var(--bg-surface-elevated)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "var(--radius-xs)",
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-secondary)"
                }}>
                  <strong style={{ color: "var(--text-primary)" }}>HINTS:</strong> {doc.identity_hint_fields.name_raw} (DOB: {doc.identity_hint_fields.dob_raw}, MRN: {doc.identity_hint_fields.mrn_raw})
                </div>
              )}

              <div className="source-card-footer">
                <span className="s3-badge">
                  {doc.minio_raw_path}
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: "4px 10px", fontSize: 11 }}
                    onClick={() => handleInspectDoc(doc)}
                  >
                    Inspect
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ padding: "4px 10px", fontSize: 11 }}
                    onClick={() => handleRunNlp(doc)}
                  >
                    Run NLP
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Minimalist Inspector Modal */}
      {inspectModalOpen && selectedDoc && (
        <div className="modal-overlay" onClick={() => setInspectModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span style={{
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-muted)",
                  textTransform: "uppercase"
                }}>
                  DOCUMENT INSPECTION //
                </span>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>
                  {selectedDoc.id}
                </h3>
              </div>
              <button
                onClick={() => setInspectModalOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-primary)",
                  fontSize: 18,
                  cursor: "pointer",
                  padding: 4
                }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              {/* Metadata strip */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 12,
                marginBottom: 20,
                padding: 14,
                background: "var(--code-bg)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-xs)",
                fontFamily: "var(--font-mono)",
                fontSize: 11
              }}>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>SOURCE TYPE:</span>
                  <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>{selectedDoc.source_type}</div>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>SHA256 CHECKSUM:</span>
                  <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>{selectedDoc.sha256_checksum.substring(0, 16)}...</div>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>DOCUMENT STATUS:</span>
                  <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>{selectedDoc.status}</div>
                </div>
              </div>

              {/* NLP Entities View */}
              {nlpResults ? (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--text-primary)" }}>
                      Extracted Clinical Entities ({nlpResults.entity_count})
                    </h4>
                    <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                      Engine: ClinicalEntityExtractor
                    </span>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                    {nlpResults.entities.map((ent: any, i: number) => (
                      <div
                        key={i}
                        style={{
                          background: "var(--bg-surface-elevated)",
                          border: "1px solid var(--border-strong)",
                          borderRadius: "var(--radius-xs)",
                          padding: "8px 12px",
                          fontSize: 12,
                          display: "flex",
                          flexDirection: "column",
                          gap: 4
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{
                            fontSize: 9,
                            fontFamily: "var(--font-mono)",
                            fontWeight: 700,
                            padding: "1px 4px",
                            background: "var(--btn-primary-bg)",
                            color: "var(--btn-primary-text)",
                            borderRadius: "var(--radius-xs)"
                          }}>
                            {ent.entity_type}
                          </span>
                          <strong style={{ color: "var(--text-primary)" }}>{ent.span_text}</strong>
                        </div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                          Conf: {(ent.confidence * 100).toFixed(0)}%
                          {ent.negation_status && " • [NEGATED]"}
                          {ent.temporal_status && ` • ${ent.temporal_status}`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Raw JSON or Fragments */}
              <div>
                <h4 style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>
                  Raw Payload / Normalized Fragments
                </h4>
                <pre className="json-view">
                  {JSON.stringify(selectedDoc, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
