import { useEffect, useState } from "react";
import { downloadJson, requestJson } from "./patientService";
import "./operations-workspace.css";
type Alert = {
  id: string;
  status: string;
  version: number;
  decision_time: string;
  probability: number;
  threshold: number;
  replay: boolean;
  escalated: boolean;
  escalate_at: string;
  external_delivery: string;
  history: Array<{ action: string; actor: string; at: string; note: string }>;
};
type Case = {
  patient_id: string;
  distance: number;
  source: string;
  differences: Array<{
    label: string;
    target: number;
    candidate: number;
    difference: number;
    normalizing_scale: number;
  }>;
};
type Similar = { cases: Case[]; method: string; limitations: string };
type Workspace = {
  version: number;
  bundles: Array<{
    id: string;
    record_version: number;
    delivery?: {
      status: string;
      error?: string;
      resources?: Array<{ location: string }>;
    };
  }>;
};
type Status = {
  authentication: string;
  actor: string;
  roles: string[];
  hospital_configured: boolean;
  live_devices: string;
  nlp: string;
  audit: string;
  clinical_validation: string;
};
export default function OperationsWorkspace({
  patientId,
  decisionTime,
}: {
  patientId: string;
  decisionTime: string;
}) {
  const [tab, setTab] = useState("alerts"),
    [alerts, setAlerts] = useState<Alert[]>([]),
    [similar, setSimilar] = useState<Similar | null>(null),
    [workspace, setWorkspace] = useState<Workspace | null>(null),
    [status, setStatus] = useState<Status | null>(null),
    [audit, setAudit] = useState<
      Array<{ id: number; timestamp: string; payload: Record<string, unknown> }>
    >([]),
    [integrity, setIntegrity] = useState<{
      valid: boolean;
      events: number;
    } | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [refresh, setRefresh] = useState(0),
    [notes, setNotes] = useState<Record<string, string>>({}),
    [selectedCase, setSelectedCase] = useState("");
  const base = `/api/v1/workflows/patients/${patientId}`;
  useEffect(() => {
    const c = new AbortController();
    setError("");
    setLoading(true);
    setNotes({});
    setSelectedCase("");
    const calls = [
      requestJson<Alert[]>(base + "/alerts", { signal: c.signal }),
      requestJson<Similar>(base + "/similar-cases", { signal: c.signal }),
      requestJson<Workspace>(base, { signal: c.signal }),
      requestJson<Status>("/api/v1/workflows/platform-status", {
        signal: c.signal,
      }),
    ];
    Promise.allSettled(calls).then((results) => {
      if (c.signal.aborted) return;
      setLoading(false);
      results.forEach((r, i) => {
        if (r.status === "rejected") {
          setError((e) => [e, r.reason.message].filter(Boolean).join(" · "));
          return;
        }
        if (i === 0) setAlerts(r.value as Alert[]);
        if (i === 1) setSimilar(r.value as Similar);
        if (i === 2) setWorkspace(r.value as Workspace);
        if (i === 3) setStatus(r.value as Status);
      });
    });
    return () => c.abort();
  }, [base, refresh]);
  useEffect(() => {
    if (tab !== "audit") return;
    const c = new AbortController();
    Promise.allSettled([
      requestJson<typeof audit>("/api/v1/audit/events", { signal: c.signal }),
      requestJson<{ valid: boolean; events: number }>("/api/v1/audit/verify", {
        signal: c.signal,
      }),
    ]).then((results) => {
      if (c.signal.aborted) return;
      if (results[0].status === "fulfilled")
        setAudit(results[0].value as typeof audit);
      else setError(results[0].reason.message);
      if (results[1].status === "fulfilled")
        setIntegrity(results[1].value as { valid: boolean; events: number });
      else setError(results[1].reason.message);
    });
    return () => c.abort();
  }, [tab, refresh]);
  async function mutate(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await requestJson<Record<string, unknown>>(base + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actor: status?.actor || "Demo clinician",
          expected_version: workspace?.version,
          ...body,
        }),
      });
      setRefresh((r) => r + 1);
      setNotice(
        typeof result.reason === "string"
          ? result.reason
          : result.status === "delivered"
            ? "Hospital server confirmed this transaction."
            : "Action recorded.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const chosen = similar?.cases.find((c) => c.patient_id === selectedCase);
  return (
    <div className="page-stack">
      <section className="paper-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Care operations · {patientId}</span>
            <h2>Evidence into a reviewable workflow.</h2>
          </div>
          <button
            className="button secondary"
            onClick={() => setRefresh((r) => r + 1)}
          >
            Refresh operations
          </button>
        </div>
        <p className="muted">
          Review replay alerts, compare nearby cohort profiles and track
          approved-record delivery. Live device ingestion remains paused.
        </p>
        <nav className="operations-tabs" aria-label="Care operation sections">
          {[
            ["alerts", "Alert center"],
            ["cases", "Similar profiles"],
            ["interop", "Hospital delivery"],
            ["audit", "Access & audit"],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        {loading && (
          <p className="caption" role="status">
            Loading current operation records…
          </p>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
      </section>
      {tab === "alerts" && (
        <section className="paper-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">
                Durable · deduplicated · versioned
              </span>
              <h2>Recorded-event alert center</h2>
            </div>
            <button
              className="button primary"
              disabled={busy || !decisionTime}
              onClick={() =>
                mutate("/alerts/evaluate", {
                  decision_time: decisionTime,
                  replay: true,
                })
              }
            >
              Evaluate selected recording
            </button>
          </div>
          <p className="caption">
            This historical cohort creates explicitly labeled replay alerts. The
            server retrieves the prediction, checks applicability and its stored
            threshold, deduplicates events and groups them within 30 minutes.
            Aged live recordings are suppressed. Escalation is evaluated when
            this center refreshes; external notifications are not configured.
          </p>
          {!loading && alerts.length === 0 && (
            <div className="operations-empty">
              No alerts stored for this profile. Evaluate a recording; a
              below-threshold result will explain why no alert was created.
            </div>
          )}
          {alerts.map((a) => (
            <article key={a.id} className="operation-alert">
              <div className="card-heading">
                <h3>
                  {a.replay ? "Replay" : "Live"} ·{" "}
                  {(a.probability * 100).toFixed(1)}% spike probability
                </h3>
                <span className="subtle-tag">
                  {a.status}
                  {a.escalated ? " · escalated" : ""}
                </span>
              </div>
              <p>
                {a.decision_time} · threshold {(a.threshold * 100).toFixed(1)}%
                · in-app delivery
              </p>
              <p className="caption">
                External delivery: {a.external_delivery}. Escalation due{" "}
                {new Date(a.escalate_at).toLocaleString()}.
              </p>
              {a.status !== "resolved" && (
                <>
                  <input
                    className="operation-note"
                    aria-label={`Resolution note ${a.id}`}
                    placeholder="Review / resolution note"
                    value={notes[a.id] || ""}
                    onChange={(e) =>
                      setNotes((n) => ({ ...n, [a.id]: e.target.value }))
                    }
                  />
                  <div className="button-row">
                    {a.status === "new" && (
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          mutate(`/alerts/${a.id}/action`, {
                            action: "acknowledge",
                            note: notes[a.id] || "",
                            expected_alert_version: a.version,
                          })
                        }
                      >
                        Acknowledge
                      </button>
                    )}
                    {!a.escalated && (
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          mutate(`/alerts/${a.id}/action`, {
                            action: "escalate",
                            note: notes[a.id] || "",
                            expected_alert_version: a.version,
                          })
                        }
                      >
                        Escalate in app
                      </button>
                    )}
                    {a.status === "acknowledged" && (
                      <button
                        className="button primary"
                        disabled={busy || !notes[a.id]?.trim()}
                        onClick={() =>
                          mutate(`/alerts/${a.id}/action`, {
                            action: "resolve",
                            note: notes[a.id],
                            expected_alert_version: a.version,
                          })
                        }
                      >
                        Resolve with note
                      </button>
                    )}
                  </div>
                </>
              )}
              <details>
                <summary>Action history</summary>
                {a.history.length ? (
                  a.history.map((h, i) => (
                    <p key={i} className="caption">
                      {h.at} · {h.actor} · {h.action} · {h.note}
                    </p>
                  ))
                ) : (
                  <p className="caption">Awaiting acknowledgment.</p>
                )}
              </details>
            </article>
          ))}
        </section>
      )}
      {tab === "cases" && (
        <section className="paper-card">
          <span className="eyebrow">Transparent neighbour retrieval</span>
          <h2>Compare recorded clinical context.</h2>
          <p className="muted">{similar?.limitations}</p>
          <p className="caption">{similar?.method}</p>
          <div className="case-grid">
            {similar?.cases.map((c) => (
              <button
                key={c.patient_id}
                className={selectedCase === c.patient_id ? "selected" : ""}
                onClick={() => setSelectedCase(c.patient_id)}
              >
                <span>{c.patient_id}</span>
                <strong>{c.distance.toFixed(3)}</strong>
                <small>clinical distance · lower is closer</small>
              </button>
            ))}
          </div>
          {similar && !similar.cases.length && (
            <p className="operations-empty">
              No other permitted profiles are available.
            </p>
          )}
          {chosen && (
            <>
              <h3>Why {chosen.patient_id} matched</h3>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th>{patientId}</th>
                    <th>{chosen.patient_id}</th>
                    <th>Difference</th>
                    <th>Scale</th>
                  </tr>
                </thead>
                <tbody>
                  {chosen.differences.map((d) => (
                    <tr key={d.label}>
                      <td>{d.label}</td>
                      <td>{d.target}</td>
                      <td>{d.candidate}</td>
                      <td>
                        {d.difference > 0 ? "+" : ""}
                        {d.difference}
                      </td>
                      <td>{d.normalizing_scale}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="caption">
                {chosen.source}. No treatment outcome is available for this
                neighbour.
              </p>
            </>
          )}
          {similar && (
            <button
              className="button secondary"
              onClick={() =>
                downloadJson(`similar-profiles-${patientId}.json`, similar)
              }
            >
              Export comparison evidence
            </button>
          )}
        </section>
      )}
      {tab === "interop" && (
        <section className="paper-card">
          <span className="eyebrow">
            Verified record → validation → transaction receipt
          </span>
          <h2>Hospital persistence</h2>
          <p className="muted">
            Only a current approved record can be submitted. Review and approve
            it in Clinical review first. Stable resource IDs make retries
            idempotent; returned locations and versions are retained.
          </p>
          <p className="notice">
            {status?.hospital_configured
              ? "A FHIR destination is configured on the server."
              : "No hospital destination configured. Set FHIR_BASE_URL on the backend to a local HAPI instance or an authorized hospital endpoint."}
          </p>
          <p className="caption">
            The client calls the destination’s $validate before a transaction
            and rejects error/fatal outcomes or incomplete receipts. This is not
            ABDM certification or proof of validation with the independent
            official HL7 validator.
          </p>
          {!workspace?.bundles.length && (
            <div className="operations-empty">
              No approved bundles. Complete clinical verification and local
              approval first.
            </div>
          )}
          {workspace?.bundles.map((b) => (
            <article className="operation-alert" key={b.id}>
              <h3>Approved bundle · version {b.record_version}</h3>
              <p className="caption">
                {b.id} ·{" "}
                {b.record_version === workspace.version
                  ? "Current record"
                  : "Superseded record version"}
              </p>
              <span className="subtle-tag">
                {b.delivery?.status || "Not sent"}
              </span>
              {b.delivery?.error && (
                <p className="notice error">{b.delivery.error}</p>
              )}
              {b.delivery?.resources?.map((r) => (
                <p key={r.location} className="caption">
                  {r.location}
                </p>
              ))}
              <button
                className="button primary"
                disabled={
                  busy ||
                  !status?.hospital_configured ||
                  b.record_version !== workspace.version ||
                  b.delivery?.status === "delivered"
                }
                onClick={() => mutate(`/fhir/${b.id}/delivery`, {})}
              >
                Validate & send approved record
              </button>
            </article>
          ))}
        </section>
      )}
      {tab === "audit" && (
        <>
          <section className="paper-card">
            <span className="eyebrow">Explicit operating mode</span>
            <h2>
              {status?.authentication === "oidc"
                ? "OIDC protected session"
                : "Synthetic demo session"}
            </h2>
            <dl className="operation-status">
              <dt>Identity</dt>
              <dd>{status?.actor}</dd>
              <dt>Roles</dt>
              <dd>
                {status?.roles.join(", ") ||
                  "Demo labels; not authenticated identities"}
              </dd>
              <dt>Audit</dt>
              <dd>{status?.audit}</dd>
              <dt>NLP engine</dt>
              <dd>{status?.nlp}</dd>
              <dt>Clinical validation</dt>
              <dd>{status?.clinical_validation}</dd>
            </dl>
            <p className="caption">
              OIDC mode verifies signature, issuer, audience and expiry, then
              enforces roles and assigned profile IDs on the backend. Local demo
              mode is for synthetic records. Keycloak realm and real hospital
              credentials must be configured separately.
            </p>
          </section>
          <section className="paper-card">
            <div className="card-heading">
              <h3>Cross-service access audit</h3>
              <span className="subtle-tag">
                {integrity
                  ? `${integrity.valid ? "Chain verified" : "Integrity failure"} · ${integrity.events || 0} events`
                  : "Checking integrity…"}
              </span>
            </div>
            <p className="caption">
              Local tamper-evident history; this does not establish immutable
              retention. Request metadata excludes clinical text and
              credentials.
            </p>
            <div className="operation-audit-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Actor</th>
                    <th>Service</th>
                    <th>Request</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((a) => (
                    <tr key={a.id}>
                      <td>{new Date(a.timestamp).toLocaleString()}</td>
                      <td>{String(a.payload.actor)}</td>
                      <td>{String(a.payload.service)}</td>
                      <td>
                        {String(a.payload.action)} {String(a.payload.resource)}
                      </td>
                      <td>{String(a.payload.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              className="button secondary"
              onClick={() =>
                downloadJson("access-audit.json", { integrity, events: audit })
              }
            >
              Export audit metadata
            </button>
          </section>
        </>
      )}
    </div>
  );
}
