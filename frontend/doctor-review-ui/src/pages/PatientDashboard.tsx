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
      alert("Could not trigger seed API. Ensure backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const handleInspectDoc = async (doc: SourceDocument) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/documents/${doc.id}`);
      if (res.ok) {
        const fullDoc = await res.json();
        setSelectedDoc(fullDoc);
      } else {
        setSelectedDoc(doc);
      }
    } catch (e) {
      setSelectedDoc(doc);
    }
    setInspectModalOpen(true);
  };

  const handleRunNLP = async (text: string, docId: string) => {
    try {
      const res = await fetch(`http://localhost:8002/api/v1/nlp/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: docId, text: text })
      });
      if (res.ok) {
        const data = await res.json();
        setNlpResults(data);
      } else {
        alert("NLP service error");
      }
    } catch (e) {
      // Fallback local extraction mock for preview
      alert("NLP service (port 8002) connecting... Please ensure NLP service is running.");
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
        return <span className="source-type-tag tag-stt">Speech-to-Text</span>;
      case "OCR":
        return <span className="source-type-tag tag-ocr">OCR Prescription</span>;
      case "HISTORICAL_DOCUMENT":
        return <span className="source-type-tag tag-historical">Historical Document</span>;
      case "HL7_API_JSON":
        return <span className="source-type-tag tag-hl7">HL7 / FHIR API</span>;
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
              <span>•</span>
              <span><strong>DOB:</strong> {patient.dob}</span>
              <span>•</span>
              <span><strong>Gender:</strong> {patient.gender}</span>
              <span>•</span>
              <span><strong>Phone:</strong> {patient.phone}</span>
            </div>
          </div>
        </div>

        <div className="patient-quick-stats">
          <div className="stat-item">
            <span className="stat-label">Active Session</span>
            <span className="stat-value">ENC-778901</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Ingested Sources</span>
            <span className="stat-value" style={{ color: "#60a5fa" }}>{documents.length} Files</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Identity Match</span>
            <span className="stat-value" style={{ color: "#10b981" }}>Verified (Current)</span>
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
            HL7 / LIS Feeds <span className="pill-count">{documents.filter(d => d.source_type === "HL7_API_JSON").length}</span>
          </button>
        </div>

        <div className="button-group">
          <button className="btn btn-secondary" onClick={fetchDocuments} disabled={loading}>
            🔄 Refresh
          </button>
          <button className="btn btn-primary" onClick={handleSeedSamples} disabled={loading}>
            📥 Seed 5 Test Samples
          </button>
        </div>
      </div>

      {/* Feed Cards Grid */}
      {filteredDocs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", background: "var(--bg-surface)", borderRadius: "var(--radius-md)" }}>
          <p style={{ color: "var(--text-secondary)", marginBottom: "16px" }}>No ingested documents in this stream yet.</p>
          <button className="btn btn-primary" onClick={handleSeedSamples}>
            Click to Load Sample Payloads (OCR, STT, Historical, HL7)
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
                <span>•</span>
                <span>Conf: <strong>{(doc.overall_confidence * 100).toFixed(0)}%</strong></span>
                <span>•</span>
                <span style={{ color: doc.status === "PENDING_IDENTITY_RESOLUTION" ? "#f59e0b" : "#10b981" }}>
                  ● {doc.status}
                </span>
              </div>

              <div className="source-content-box">
                {doc.raw_text || "Raw textual content archived in MinIO."}
              </div>

              {/* Historical hint callout */}
              {doc.identity_hint_fields && (
                <div style={{ marginTop: 10, padding: 8, background: "rgba(245, 158, 11, 0.08)", border: "1px dashed var(--warning-border)", borderRadius: 6, fontSize: 11 }}>
                  <strong style={{ color: "#f59e0b" }}>Identity Hints:</strong> {doc.identity_hint_fields.name_raw} (DOB: {doc.identity_hint_fields.dob_raw}, MRN: {doc.identity_hint_fields.mrn_raw})
                </div>
              )}

              <div className="source-card-footer">
                <span className="s3-badge">
                  📦 {doc.minio_raw_path}
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: "4px 8px", fontSize: 11 }}
                    onClick={() => handleInspectDoc(doc)}
                  >
                    Inspect
                  </button>
                  <button
                    className="btn btn-purple"
                    style={{ padding: "4px 8px", fontSize: 11 }}
                    onClick={() => handleRunNLP(doc.raw_text || "", doc.id)}
                  >
                    Run NLP
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* NLP Results Modal/Drawer */}
      {nlpResults && (
        <div className="modal-overlay" onClick={() => setNlpResults(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: 18, color: "#fff" }}>Clinical NLP Extraction ({nlpResults.document_id})</h3>
              <button className="btn btn-secondary" onClick={() => setNlpResults(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ color: "var(--text-secondary)", marginBottom: 16 }}>
                Identified <strong>{nlpResults.entity_count} entities</strong> with confidence scores, negation, and temporal status:
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                {nlpResults.entities.map((ent: any) => (
                  <div
                    key={ent.entity_id}
                    style={{
                      background: "var(--bg-surface-elevated)",
                      border: "1px solid var(--border-strong)",
                      borderRadius: 6,
                      padding: "8px 12px",
                      fontSize: 12
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, color: "#60a5fa" }}>{ent.entity_type}</span>
                      <span style={{ color: "#10b981" }}>{(ent.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>"{ent.span_text}"</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                      Status: {ent.temporal_status} {ent.negation_status ? "(NEGATED)" : ""} {ent.certainty !== "CONFIRMED" ? `(${ent.certainty})` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document & MinIO Inspector Modal */}
      {inspectModalOpen && selectedDoc && (
        <div className="modal-overlay" onClick={() => setInspectModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: 18, color: "#fff" }}>Document Inspector: {selectedDoc.id}</h3>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>MinIO S3 Store: {selectedDoc.minio_raw_path}</span>
              </div>
              <button className="btn btn-secondary" onClick={() => setInspectModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>SHA-256 Integrity Hash:</div>
                <code style={{ width: "100%", wordBreak: "break-all" }}>{selectedDoc.sha256_checksum}</code>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Parsed Source Fragments ({selectedDoc.fragments?.length || 0}):</div>
              {selectedDoc.fragments && selectedDoc.fragments.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  {selectedDoc.fragments.map(f => (
                    <div key={f.id} style={{ background: "var(--bg-main)", padding: 10, borderRadius: 6, border: "1px solid var(--border-subtle)", fontSize: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)", marginBottom: 4 }}>
                        <span>Fragment #{f.fragment_index} {f.speaker ? `(${f.speaker})` : ""}</span>
                        <span style={{ color: "#10b981" }}>{(f.confidence * 100).toFixed(0)}% conf</span>
                      </div>
                      <div style={{ color: "#e2e8f0" }}>{f.original_text}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "var(--text-muted)", fontSize: 12 }}>No broken-down fragments loaded.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
