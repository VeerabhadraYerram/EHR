import { useState, useEffect } from "react";

interface CandidatePatient {
  id: string;
  name: string;
  dob: string | null;
  gender: string | null;
  mrn: string | null;
  phone: string | null;
  national_id: string | null;
  address: string | null;
}

interface ScoreBreakdown {
  name_score: number;
  dob_score: number;
  gender_score: number;
  phone_score: number;
  national_id_score: number;
  address_score: number;
  mrn_score: number;
  demographic_composite: number;
  phenotype_overlap: number;
  combined_score: number;
}

interface QueueItem {
  audit_id: string;
  document_id: string;
  document_class: string;
  originating_facility_name: string;
  capture_timestamp: string | null;
  document_hints: {
    name_raw?: string;
    dob_raw?: string;
    gender_raw?: string;
    phone_raw?: string;
    national_id_raw?: string;
    mrn_raw?: string;
    address_raw?: string;
  };
  document_text_snippet: string;
  candidate_patient: CandidatePatient;
  tier: string;
  combined_score: number;
  demographic_score: number;
  phenotype_score: number;
  breakdown: ScoreBreakdown;
  has_hard_conflict: boolean;
  created_at: string | null;
}

export function DoctorVerificationQueue() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [doctorNotes, setDoctorNotes] = useState<{ [docId: string]: string }>({});

  const fetchQueue = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("http://localhost:8002/api/v1/identity/review-queue");
      if (!res.ok) throw new Error(`Failed to load queue (${res.status})`);
      const data = await res.json();
      setQueue(data.items || []);
    } catch (err: any) {
      setError(err.message || "Failed to connect to Identity Resolution Subsystem.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const handleDecision = async (item: QueueItem, action: "CONFIRM" | "REJECT") => {
    try {
      setActionLoading(item.document_id);
      const res = await fetch("http://localhost:8002/api/v1/identity/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_id: item.document_id,
          patient_id: item.candidate_patient.id,
          doctor_id: "DR-ROHIT-MEHTA",
          action: action,
          notes: doctorNotes[item.document_id] || (action === "CONFIRM" ? "Physician verified clinical phenotype match" : "Physician rejected candidate match")
        })
      });

      if (!res.ok) throw new Error("Failed to submit verification decision.");
      await res.json();

      setFeedbackMessage(
        action === "CONFIRM"
          ? `[CONFIRMED] Document ${item.document_id} linked to Patient ${item.candidate_patient.name} (${item.candidate_patient.id}). Status updated to LINKED.`
          : `[REJECTED] Document ${item.document_id} marked as REJECTED. Record remains quarantined.`
      );

      await fetchQueue();
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleEvaluateSample = async (sampleNum: number) => {
    try {
      setLoading(true);
      const docId = sampleNum === 1 ? "HIST-DOC-TIER1-001" : sampleNum === 2 ? "HIST-DOC-TIER2-002" : "HIST-DOC-TIER3-003";

      const evalRes = await fetch("http://localhost:8002/api/v1/identity/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_id: docId,
          auto_apply: true
        })
      });

      if (!evalRes.ok) {
        throw new Error(`Evaluation returned ${evalRes.status}. Make sure document ${docId} is ingested.`);
      }

      const evalData = await evalRes.json();
      setFeedbackMessage(`Evaluated ${docId}: Tier = ${evalData.tier}, Score = ${(evalData.combined_score * 100).toFixed(1)}%`);
      await fetchQueue();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "32px", maxWidth: 1440, margin: "0 auto" }}>
      {/* Top Banner */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", letterSpacing: -0.3, textTransform: "uppercase" }}>
              Identity Verification Queue
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
              TIER 2 // PENDING REVIEW
            </span>
          </div>
          <p style={{ color: "var(--text-secondary)", marginTop: 6, fontSize: 13, maxWidth: 850 }}>
            Historical documents with medium demographic confidence (60% - 84%) held in quarantine until explicit physician approval.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={fetchQueue}
            className="btn btn-secondary"
          >
            ↻ Refresh Queue
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18, marginBottom: 28 }}>
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "18px 22px" }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.6 }}>Pending Discretion</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)", marginTop: 4 }}>{queue.length}</div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>Held in safety quarantine</div>
        </div>

        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "18px 22px" }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.6 }}>Auto-Link Threshold</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)", marginTop: 4 }}>≥ 85%</div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>High confidence match</div>
        </div>

        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "18px 22px" }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.6 }}>Quarantine Cutoff</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)", marginTop: 4 }}>&lt; 60%</div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>Or fatal biological veto</div>
        </div>

        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "18px 22px" }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.6 }}>Active Attending</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginTop: 8 }}>Dr. Rohit Mehta, MD</div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>Chief Medical Attending</div>
        </div>
      </div>

      {/* Feedback Toast */}
      {feedbackMessage && (
        <div style={{
          background: "var(--bg-surface-elevated)",
          border: "1px solid var(--border-contrast)",
          color: "var(--text-primary)",
          padding: "14px 20px",
          borderRadius: "var(--radius-sm)",
          marginBottom: 24,
          fontSize: 13,
          fontWeight: 600,
          fontFamily: "var(--font-mono)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <span>{feedbackMessage}</span>
          <button
            onClick={() => setFeedbackMessage(null)}
            style={{ background: "transparent", border: "none", color: "var(--text-primary)", cursor: "pointer", fontSize: 14 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div style={{
          background: "var(--bg-surface-elevated)",
          border: "1px solid var(--border-strong)",
          color: "var(--text-primary)",
          padding: "16px 20px",
          borderRadius: "var(--radius-sm)",
          marginBottom: 24,
          fontSize: 13,
          fontFamily: "var(--font-mono)"
        }}>
          {error}
        </div>
      )}

      {/* Main Queue List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 13 }}>
          QUERYING VERIFICATION QUEUE...
        </div>
      ) : queue.length === 0 ? (
        <div style={{
          background: "var(--bg-surface)",
          border: "1px dashed var(--border-strong)",
          borderRadius: "var(--radius-md)",
          padding: "60px 40px",
          textAlign: "center"
        }}>
          <div style={{ fontSize: 32, marginBottom: 12, color: "var(--text-primary)" }}>✓</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", textTransform: "uppercase" }}>Queue Is Clear</h3>
          <p style={{ color: "var(--text-secondary)", marginTop: 8, maxWidth: 500, margin: "8px auto 24px auto", fontSize: 13 }}>
            All historical documents have either been automatically linked, physician-cleared, or quarantined.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button
              onClick={() => handleEvaluateSample(2)}
              className="btn btn-primary"
            >
              + Evaluate Tier 2 Test Sample (Rohan Shama)
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {queue.map((item) => {
            const scorePct = Math.round(item.combined_score * 100);
            return (
              <div
                key={item.audit_id}
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  overflow: "hidden"
                }}
              >
                {/* Card Header */}
                <div style={{
                  padding: "14px 22px",
                  background: "var(--bg-surface-elevated)",
                  borderBottom: "1px solid var(--border-subtle)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{
                      fontFamily: "var(--font-mono)",
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      fontSize: 13
                    }}>
                      {item.document_id}
                    </span>
                    <span style={{ color: "var(--text-muted)", fontSize: 12 }}>/</span>
                    <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 600 }}>
                      {item.originating_facility_name}
                    </span>
                    <span style={{ color: "var(--text-muted)", fontSize: 12 }}>/</span>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                      Captured: {item.capture_timestamp ? new Date(item.capture_timestamp).toUTCString() : "Unknown"}
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--tag-text)",
                      background: "var(--tag-bg)",
                      padding: "3px 10px",
                      borderRadius: "var(--radius-xs)",
                      border: "1px solid var(--tag-border)",
                      fontFamily: "var(--font-mono)"
                    }}>
                      CONFIDENCE: {scorePct}%
                    </span>
                  </div>
                </div>

                {/* Card Body: Side-by-Side Comparison */}
                <div style={{ padding: 22 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 320px", gap: 20, marginBottom: 20 }}>
                    {/* Left: Document Metadata */}
                    <div style={{ background: "var(--code-bg)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-xs)", padding: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 }}>
                        Incoming Document Hints
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
                        <div><strong style={{ color: "var(--text-muted)" }}>Raw Name:</strong> <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{item.document_hints.name_raw || "Not specified"}</span></div>
                        <div><strong style={{ color: "var(--text-muted)" }}>Date of Birth:</strong> <span style={{ color: "var(--text-primary)" }}>{item.document_hints.dob_raw || "Not specified"}</span></div>
                        <div><strong style={{ color: "var(--text-muted)" }}>Gender:</strong> <span style={{ color: "var(--text-primary)" }}>{item.document_hints.gender_raw || "Not specified"}</span></div>
                        <div><strong style={{ color: "var(--text-muted)" }}>External MRN:</strong> <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{item.document_hints.mrn_raw || "None"}</span></div>
                        <div><strong style={{ color: "var(--text-muted)" }}>Phone:</strong> <span style={{ color: "var(--text-secondary)" }}>{item.document_hints.phone_raw || "Not provided"}</span></div>
                        <div><strong style={{ color: "var(--text-muted)" }}>Address:</strong> <span style={{ color: "var(--text-primary)" }}>{item.document_hints.address_raw || "Not provided"}</span></div>
                      </div>
                    </div>

                    {/* Middle: Candidate Patient */}
                    <div style={{ background: "var(--code-bg)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-xs)", padding: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 }}>
                        Registered Patient Profile
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
                        <div><strong style={{ color: "var(--text-muted)" }}>Patient Name:</strong> <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{item.candidate_patient.name}</span></div>
                        <div><strong style={{ color: "var(--text-muted)" }}>Date of Birth:</strong> <span style={{ color: "var(--text-primary)" }}>{item.candidate_patient.dob}</span></div>
                        <div><strong style={{ color: "var(--text-muted)" }}>Gender:</strong> <span style={{ color: "var(--text-primary)" }}>{item.candidate_patient.gender}</span></div>
                        <div><strong style={{ color: "var(--text-muted)" }}>Hospital MRN:</strong> <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{item.candidate_patient.mrn}</span></div>
                        <div><strong style={{ color: "var(--text-muted)" }}>Phone:</strong> <span style={{ color: "var(--text-primary)" }}>{item.candidate_patient.phone || "Not recorded"}</span></div>
                        <div><strong style={{ color: "var(--text-muted)" }}>National ID:</strong> <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{item.candidate_patient.national_id || "Not recorded"}</span></div>
                      </div>
                    </div>

                    {/* Right: Score Breakdown Meter */}
                    <div style={{ background: "var(--code-bg)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-xs)", padding: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 }}>
                        Multi-Factor Breakdown
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 11, fontFamily: "var(--font-mono)" }}>
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                            <span style={{ color: "var(--text-secondary)" }}>Name (Jaro-Winkler):</span>
                            <strong style={{ color: "var(--text-primary)" }}>{Math.round(item.breakdown.name_score * 100)}%</strong>
                          </div>
                          <div style={{ height: 3, background: "var(--track-bg)", borderRadius: 1, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${item.breakdown.name_score * 100}%`, background: "var(--bar-fill)" }} />
                          </div>
                        </div>

                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                            <span style={{ color: "var(--text-secondary)" }}>DOB Compatibility:</span>
                            <strong style={{ color: "var(--text-primary)" }}>{Math.round(item.breakdown.dob_score * 100)}%</strong>
                          </div>
                          <div style={{ height: 3, background: "var(--track-bg)", borderRadius: 1, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${item.breakdown.dob_score * 100}%`, background: "var(--bar-fill)" }} />
                          </div>
                        </div>

                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                            <span style={{ color: "var(--text-secondary)" }}>Demographic Composite:</span>
                            <strong style={{ color: "var(--text-primary)" }}>{Math.round(item.demographic_score * 100)}%</strong>
                          </div>
                          <div style={{ height: 3, background: "var(--track-bg)", borderRadius: 1, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${item.demographic_score * 100}%`, background: "var(--bar-fill)" }} />
                          </div>
                        </div>

                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                            <span style={{ color: "var(--text-secondary)" }}>Phenotype Overlap:</span>
                            <strong style={{ color: "var(--text-primary)" }}>{Math.round(item.phenotype_score * 100)}%</strong>
                          </div>
                          <div style={{ height: 3, background: "var(--track-bg)", borderRadius: 1, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${item.phenotype_score * 100}%`, background: "var(--bar-fill)" }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Snippet Preview */}
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
                      Document Clinical Narrative Snippet
                    </div>
                    <div style={{
                      background: "var(--code-bg)",
                      border: "1px solid var(--border-subtle)",
                      padding: "12px 16px",
                      borderRadius: "var(--radius-xs)",
                      fontSize: 12,
                      lineHeight: 1.6,
                      color: "var(--code-text)",
                      fontFamily: "var(--font-mono)"
                    }}>
                      {item.document_text_snippet}
                    </div>
                  </div>

                  {/* Doctor Notes & Actions */}
                  <div style={{ display: "flex", gap: 14, alignItems: "center", borderTop: "1px solid var(--border-subtle)", paddingTop: 16 }}>
                    <input
                      type="text"
                      placeholder="Doctor clinical notes / verification rationale..."
                      value={doctorNotes[item.document_id] || ""}
                      onChange={(e) => setDoctorNotes({ ...doctorNotes, [item.document_id]: e.target.value })}
                      style={{
                        flex: 1,
                        background: "var(--code-bg)",
                        border: "1px solid var(--border-strong)",
                        color: "var(--text-primary)",
                        padding: "9px 14px",
                        borderRadius: "var(--radius-sm)",
                        fontSize: 12,
                        outline: "none",
                        fontFamily: "var(--font-sans)"
                      }}
                    />

                    <button
                      disabled={actionLoading === item.document_id}
                      onClick={() => handleDecision(item, "CONFIRM")}
                      className="btn btn-primary"
                    >
                      ✓ Confirm Link
                    </button>

                    <button
                      disabled={actionLoading === item.document_id}
                      onClick={() => handleDecision(item, "REJECT")}
                      className="btn btn-danger-outline"
                    >
                      ✕ Reject &amp; Quarantine
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
