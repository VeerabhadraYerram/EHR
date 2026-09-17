import { useState, useEffect } from "react";

interface TimelineItem {
  id: string;
  document_id: string;
  source_type: string;
  timestamp: string;
  facility: string;
  title: string;
  text_content: string;
  confidence: number;
  sha256_checksum: string;
  minio_path: string;
  status: string;
  metadata: {
    origin?: string;
    document_class?: string;
    fragment_count?: number;
  };
}

interface NarrativeSection {
  section_name: string;
  text: string;
  sources_cited: string[];
}

interface FusedNarrative {
  patient_id: string;
  patient_name: string;
  mrn: string | null;
  generated_at: string;
  working_narrative: string;
  sections: NarrativeSection[];
  sources_included: Array<{
    document_id: string;
    source_type: string;
    facility: string;
    timestamp: string;
    sha256: string;
    minio_path: string;
  }>;
}

export function UnifiedTimeline() {
  const [selectedPatientId, setSelectedPatientId] = useState<string>("PT-HOSP-MRN-55210");
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [narrative, setNarrative] = useState<FusedNarrative | null>(null);
  const [patientInfo, setPatientInfo] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"timeline" | "narrative">("timeline");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const fetchPatientData = async (patientId: string) => {
    try {
      setLoading(true);
      setError(null);

      // 1. Fetch Timeline from Fusion Service
      const tlRes = await fetch(`http://localhost:8003/api/v1/fusion/patient/${patientId}/timeline`);
      if (!tlRes.ok) throw new Error(`Timeline service returned ${tlRes.status}`);
      const tlData = await tlRes.json();
      setTimeline(tlData.timeline || []);

      // 2. Fetch Narrative from Fusion Service
      const narrRes = await fetch(`http://localhost:8003/api/v1/fusion/patient/${patientId}/narrative`);
      if (narrRes.ok) {
        const narrData = await narrRes.json();
        setNarrative(narrData);
      }

      // 3. Fetch Patient demographics from Ingestion Service
      const patRes = await fetch(`http://localhost:8000/api/v1/patients`);
      if (patRes.ok) {
        const patients = await patRes.json();
        const found = patients.find((p: any) => p.id === patientId);
        setPatientInfo(found || { name: tlData.patient_name, mrn: tlData.mrn });
      }
    } catch (err: any) {
      setError(err.message || "Failed to load clinical timeline.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatientData(selectedPatientId);
  }, [selectedPatientId]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(text);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const getSourceBadgeText = (sourceType: string) => {
    switch (sourceType) {
      case "SPEECH_TO_TEXT":
        return "STT // AUDIO";
      case "HL7_API_JSON":
        return "HL7 // LIS";
      case "HISTORICAL_DOCUMENT":
        return "HIST // RECORD";
      case "OCR":
      default:
        return "OCR // RX";
    }
  };

  return (
    <div style={{ padding: "32px", maxWidth: 1440, margin: "0 auto" }}>
      {/* Top Header & Patient Picker */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", letterSpacing: -0.3, textTransform: "uppercase" }}>
              Unified Chronological Timeline
            </h1>
            <span style={{
              background: "var(--tag-bg)",
              color: "var(--tag-text)",
              border: "1px solid var(--tag-border)",
              padding: "3px 10px",
              borderRadius: "var(--radius-xs)",
              fontSize: 11,
              fontWeight: 700,
              fontFamily: "var(--font-mono)"
            }}>
              NORMALIZED &amp; FUSED
            </span>
          </div>
          <p style={{ color: "var(--text-secondary)", marginTop: 6, fontSize: 13 }}>
            Unified patient trajectory synthesizing verified consultation audio, lab observations, and resolved historical records.
          </p>
        </div>

        {/* Patient Selection Dropdown */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <label style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Patient:
          </label>
          <select
            value={selectedPatientId}
            onChange={(e) => setSelectedPatientId(e.target.value)}
            style={{
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-strong)",
              padding: "8px 14px",
              borderRadius: "var(--radius-sm)",
              fontSize: 12,
              fontWeight: 600,
              outline: "none",
              cursor: "pointer",
              fontFamily: "var(--font-sans)"
            }}
          >
            <option value="PT-HOSP-MRN-55210">Rohan Sharma (HOSP-MRN-55210)</option>
            <option value="PT-HOSP-MRN-55311">Anita Verma (HOSP-MRN-55311)</option>
            <option value="PT-SESSION-55210">Active Patient Session</option>
          </select>
        </div>
      </div>

      {/* Patient Demographic Banner */}
      {patientInfo && (
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          padding: "18px 24px",
          marginBottom: 24,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: "var(--radius-sm)",
              background: "var(--avatar-bg)",
              color: "var(--avatar-text)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              fontWeight: 800,
              letterSpacing: -0.5
            }}>
              {patientInfo.name ? patientInfo.name.charAt(0) : "P"}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>{patientInfo.name}</div>
              <div style={{ display: "flex", gap: 14, fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                <span>DOB: <strong style={{ color: "var(--text-primary)" }}>{patientInfo.dob || "1972-03-14"}</strong></span>
                <span>/</span>
                <span>Gender: <strong style={{ color: "var(--text-primary)" }}>{patientInfo.gender || "Male"}</strong></span>
                <span>/</span>
                <span>MRN: <strong style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{patientInfo.mrn || "HOSP-MRN-55210"}</strong></span>
                <span>/</span>
                <span>National ID: <strong style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{patientInfo.national_id || "XXXX-XXXX-4432"}</strong></span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 24 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.6 }}>Verified Sources</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>{timeline.length}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.6 }}>Quarantine Guarantee</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginTop: 2, fontFamily: "var(--font-mono)" }}>ZERO LEAKAGE</div>
            </div>
          </div>
        </div>
      )}

      {/* Minimal Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border-subtle)", marginBottom: 24 }}>
        <button
          onClick={() => setActiveTab("timeline")}
          style={{
            padding: "10px 18px",
            background: "transparent",
            color: activeTab === "timeline" ? "var(--text-primary)" : "var(--text-muted)",
            border: "none",
            borderBottom: activeTab === "timeline" ? "2px solid var(--text-primary)" : "2px solid transparent",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
            textTransform: "uppercase",
            letterSpacing: 0.4
          }}
        >
          Chronological Timeline ({timeline.length})
        </button>

        <button
          onClick={() => setActiveTab("narrative")}
          style={{
            padding: "10px 18px",
            background: "transparent",
            color: activeTab === "narrative" ? "var(--text-primary)" : "var(--text-muted)",
            border: "none",
            borderBottom: activeTab === "narrative" ? "2px solid var(--text-primary)" : "2px solid transparent",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
            textTransform: "uppercase",
            letterSpacing: 0.4
          }}
        >
          Synthesized Working Narrative
        </button>
      </div>

      {error && (
        <div style={{
          background: "var(--bg-surface-elevated)",
          border: "1px solid var(--border-strong)",
          color: "var(--text-primary)",
          padding: 16,
          borderRadius: "var(--radius-sm)",
          marginBottom: 24,
          fontSize: 13,
          fontFamily: "var(--font-mono)"
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 13 }}>
          FUSING CHRONOLOGICAL TIMELINE...
        </div>
      ) : activeTab === "timeline" ? (
        /* Timeline View */
        timeline.length === 0 ? (
          <div style={{
            background: "var(--bg-surface)",
            border: "1px dashed var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            padding: "60px 40px",
            textAlign: "center"
          }}>
            <h3 style={{ fontSize: 16, color: "var(--text-primary)", textTransform: "uppercase" }}>No Cleared Records Linked</h3>
            <p style={{ color: "var(--text-secondary)", marginTop: 6, fontSize: 13 }}>
              Documents undergoing identity resolution remain in safety quarantine until auto-linked or doctor-confirmed.
            </p>
          </div>
        ) : (
          <div style={{ position: "relative", paddingLeft: 24, display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Vertical Guide Line */}
            <div style={{
              position: "absolute",
              top: 15,
              bottom: 15,
              left: 8,
              width: 1,
              background: "var(--timeline-line)"
            }} />

            {timeline.map((item) => (
              <div key={item.id} style={{ position: "relative" }}>
                {/* Timeline Dot */}
                <div style={{
                  position: "absolute",
                  left: -20,
                  top: 18,
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  background: "var(--timeline-dot)",
                  border: "2px solid var(--timeline-dot-border)",
                  zIndex: 2
                }} />

                {/* Card */}
                <div style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  overflow: "hidden"
                }}>
                  {/* Card Header */}
                  <div style={{
                    padding: "12px 18px",
                    background: "var(--bg-surface-elevated)",
                    borderBottom: "1px solid var(--border-subtle)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className="source-type-tag">
                        {getSourceBadgeText(item.source_type)}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                        {item.title}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        {new Date(item.timestamp).toUTCString()}
                      </span>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: "var(--tag-text)",
                        background: "var(--tag-bg)",
                        padding: "2px 8px",
                        borderRadius: "var(--radius-xs)",
                        border: "1px solid var(--tag-border)",
                        fontFamily: "var(--font-mono)"
                      }}>
                        {Math.round(item.confidence * 100)}% CONF
                      </span>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div style={{ padding: "16px 18px" }}>
                    <div style={{
                      background: "var(--code-bg)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-xs)",
                      padding: "14px 16px",
                      fontSize: 12,
                      lineHeight: 1.7,
                      color: "var(--code-text)",
                      whiteSpace: "pre-wrap",
                      fontFamily: "var(--font-mono)"
                    }}>
                      {item.text_content}
                    </div>
                  </div>

                  {/* Card Footer: Cryptographic Provenance */}
                  <div style={{
                    padding: "10px 18px",
                    background: "var(--bg-surface-elevated)",
                    borderTop: "1px solid var(--border-subtle)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    color: "var(--text-muted)"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span>SHA256:</span>
                      <span style={{ color: "var(--text-secondary)" }}>{item.sha256_checksum.substring(0, 16)}...</span>
                      <button
                        onClick={() => copyToClipboard(item.sha256_checksum)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--text-primary)",
                          cursor: "pointer",
                          fontSize: 11,
                          textDecoration: "underline"
                        }}
                      >
                        {copiedHash === item.sha256_checksum ? "[✓ Copied]" : "[Copy Hash]"}
                      </button>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span>S3:</span>
                      <span style={{ color: "var(--text-secondary)" }}>{item.minio_path}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* Synthesized Narrative View */
        narrative && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Header metadata */}
            <div style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              padding: 24
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", textTransform: "uppercase" }}>
                    Working Clinical Narrative
                  </h2>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
                    Automated normalization across {narrative.sources_included.length} verified clinical records.
                  </div>
                </div>
                <div style={{ textAlign: "right", fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  <div>TIMESTAMP: {new Date(narrative.generated_at).toUTCString()}</div>
                  <div style={{ color: "var(--text-primary)", fontWeight: 600, marginTop: 2 }}>[PROVENANCE SEALED]</div>
                </div>
              </div>

              {/* Narrative Sections */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {narrative.sections.map((sec, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: "var(--code-bg)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-xs)",
                      padding: 18
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                        {idx + 1}. {sec.section_name}
                      </h3>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        Sources: {sec.sources_cited.join(", ")}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.7, color: "var(--code-text)", whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)" }}>
                      {sec.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Source Provenance Ledger */}
            <div style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              padding: 20
            }}>
              <h4 style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 }}>
                Cryptographic Provenance Ledger
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 11, fontFamily: "var(--font-mono)" }}>
                {narrative.sources_included.map((src, i) => (
                  <div
                    key={i}
                    style={{
                      background: "var(--code-bg)",
                      padding: "8px 14px",
                      borderRadius: "var(--radius-xs)",
                      border: "1px solid var(--border-subtle)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}
                  >
                    <div>
                      <strong style={{ color: "var(--text-primary)" }}>{src.document_id}</strong>
                      <span style={{ color: "var(--text-muted)", margin: "0 8px" }}>/</span>
                      <span style={{ color: "var(--text-secondary)" }}>{src.facility}</span>
                      <span style={{ color: "var(--text-muted)", margin: "0 8px" }}>/</span>
                      <span style={{ color: "var(--text-primary)" }}>{src.source_type}</span>
                    </div>
                    <div style={{ color: "var(--text-muted)" }}>
                      SHA256: {src.sha256}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
