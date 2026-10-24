import { useEffect, useRef, useState } from "react";
import "./clinical-workflow.css";
import {
  authEnabled,
  currentIdentity,
  downloadProtectedResource,
} from "../auth";

type Entity = {
  id: string;
  kind: string;
  code: string;
  label: string;
  value: string;
  unit: string;
  observed_at: string;
  sources: string[];
  status: string;
  original: string;
};
type Recommendation = {
  id: string;
  text: string;
  source: string;
  status: string;
};
type ClinicalDocument = {
  id: string;
  kind: string;
  status: string;
  text: string;
  record_version: number;
};
type StoredBundle = {
  id: string;
  record_version: number;
  approved_at: string;
  destination: string;
  validation: string;
  bundle: unknown;
};
type Workspace = {
  patient_id: string;
  version: number;
  entities: Entity[];
  recommendations: Recommendation[];
  documents: ClinicalDocument[];
  bundles: StoredBundle[];
  mode: string;
  fhir_validation: string;
  deduplication: { key: string; kind: string; entities: Entity[] }[];
};
type AuditEvent = {
  id: number;
  timestamp: string;
  actor: string;
  action: string;
  detail: unknown;
  hash: string;
};
type LegacyPatient = { id: string; name: string; mrn?: string };
const base = "/api/v1/workflows";

async function api<T>(
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    signal,
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      typeof payload?.detail === "string"
        ? payload.detail
        : `Request failed (${response.status})`,
    );
  }
  return response.json() as Promise<T>;
}

function download(name: string, value: unknown) {
  const href = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(href);
}

export default function ClinicalWorkflowPage({
  patientId,
}: {
  patientId: string;
}) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [actor, setActor] = useState(
    authEnabled ? currentIdentity() : "Demo clinician",
  );
  const [section, setSection] = useState("review");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [kind, setKind] = useState("treatment_plan");
  const [preview, setPreview] = useState<ClinicalDocument | null>(null);
  const [legacyPatients, setLegacyPatients] = useState<LegacyPatient[]>([]);
  const [legacyId, setLegacyId] = useState("");
  const [legacyData, setLegacyData] = useState<unknown>(null);
  const [legacyError, setLegacyError] = useState("");
  const [newEntity, setNewEntity] = useState({
    kind: "observation",
    code: "",
    label: "",
    value: "",
    unit: "",
    observed_at: "",
    source: "",
  });
  const generation = useRef(0);
  const url = `${base}/patients/${encodeURIComponent(patientId)}`;

  useEffect(() => {
    const controller = new AbortController();
    generation.current += 1;
    setWorkspace(null);
    setAudit([]);
    setError("");
    setNotice("");
    setPreview(null);
    setEditValues({});
    setNotes("");
    setBusy(false);
    api<Workspace>(url, undefined, controller.signal)
      .then(setWorkspace)
      .catch((reason: Error) => {
        if (!controller.signal.aborted) setError(reason.message);
      });
    return () => {
      controller.abort();
    };
  }, [url]);

  useEffect(() => {
    const controller = new AbortController();
    api<LegacyPatient[]>("/api/v1/patients", undefined, controller.signal)
      .then(setLegacyPatients)
      .catch(() => {
        /* optional legacy service; state displayed on request */
      });
    return () => controller.abort();
  }, []);

  const mutate = async (path: string, payload: unknown, success: string) => {
    const activeGeneration = generation.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<ClinicalDocument>(url + path, {
        ...(payload as Record<string, unknown>),
        expected_version: workspace?.version,
      });
      const fresh = await api<Workspace>(url);
      if (activeGeneration !== generation.current) return;
      setWorkspace(fresh);
      setNotice(success);
      if (path === "/documents") setPreview(result);
      if (section === "audit")
        setAudit(await api<AuditEvent[]>(url + "/audit"));
    } catch (reason) {
      if (activeGeneration === generation.current)
        setError((reason as Error).message);
    } finally {
      if (activeGeneration === generation.current) setBusy(false);
    }
  };

  const pending =
    workspace?.entities.filter((e) => e.status === "pending").length ?? 0;
  const active =
    workspace?.entities.filter(
      (e) => !["rejected", "merged"].includes(e.status),
    ).length ?? 0;
  const filtered =
    workspace?.entities.filter(
      (e) =>
        (status === "all" || e.status === status) &&
        `${e.label} ${e.code} ${e.value}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    ) ?? [];
  const canFinalize =
    !!workspace &&
    pending === 0 &&
    workspace.deduplication.length === 0 &&
    active > 0;

  return (
    <div className="workflow-page">
      <header className="workflow-heading">
        <div>
          <span className="wf-eyebrow">Review workspace · {patientId}</span>
          <h2>Clinical record & verification</h2>
          <p>
            Review source facts, reconcile conflicts, and prepare a
            clinician-approved record.
          </p>
        </div>
        <label>
          Demo reviewer name
          <input
            value={actor}
            maxLength={100}
            disabled={authEnabled}
            onChange={(e) => setActor(e.target.value)}
          />
        </label>
      </header>
      <p className="wf-context">
        {authEnabled
          ? "Authenticated review; the backend derives the reviewer identity from the verified token."
          : "Local synthetic demonstration; reviewer labels are not authenticated identities."}{" "}
        Changes here do not change the twin’s original research data. Hospital
        delivery is a separate operation in Care operations.
      </p>
      <nav className="workflow-tabs" aria-label="Clinical workflow sections">
        {[
          ["review", "Verify record"],
          ["documents", "Documents & FHIR"],
          ["sources", "Source explorer"],
          ["audit", "Activity log"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={section === id ? "selected" : ""}
            onClick={() => {
              setSection(id);
              if (id === "audit")
                api<AuditEvent[]>(url + "/audit")
                  .then(setAudit)
                  .catch((e) => setError(e.message));
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <p className="wf-error" role="alert">
          {error}
          {!workspace && " — Start the workflow API on port 8005 and retry."}
        </p>
      )}
      {notice && (
        <p className="wf-notice" role="status">
          {notice}
        </p>
      )}
      {!workspace && !error && <p role="status">Loading clinical review…</p>}
      {workspace && section === "review" && (
        <>
          <div className="wf-stats">
            <div>
              <strong>{active}</strong>
              <span>Active facts</span>
            </div>
            <div>
              <strong>{pending}</strong>
              <span>Awaiting review</span>
            </div>
            <div>
              <strong>{workspace.deduplication.length}</strong>
              <span>Duplicate / conflict groups</span>
            </div>
            <div>
              <strong>v{workspace.version}</strong>
              <span>Record revision</span>
            </div>
          </div>
          <div className="wf-toolbar">
            <input
              placeholder="Search facts or terminology codes"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search facts"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Filter review status"
            >
              {[
                "all",
                "pending",
                "accepted",
                "edited",
                "rejected",
                "merged",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          {workspace.deduplication.map((group) => (
            <div className="wf-conflict" key={group.key}>
              <strong>
                {group.kind === "conflict"
                  ? "Conflicting values — clinician decision required"
                  : "Identical fact from multiple sources"}
              </strong>
              <p>
                {group.entities
                  .map((e) => `${e.label}: ${e.value} ${e.unit}`)
                  .join(" · ")}
              </p>
              {group.kind === "duplicate" ? (
                <button
                  disabled={busy || actor.trim().length < 2}
                  onClick={() =>
                    mutate(
                      "/merge",
                      { actor, entity_ids: group.entities.map((e) => e.id) },
                      "Duplicate facts merged; all source references retained. Review the merged fact again.",
                    )
                  }
                >
                  Merge & retain provenance
                </button>
              ) : (
                <span>
                  Reject or edit the competing facts individually. No value is
                  selected automatically.
                </span>
              )}
            </div>
          ))}
          <div className="wf-entity-list">
            {filtered.map((item) => (
              <article
                key={item.id}
                className={`wf-entity status-${item.status}`}
              >
                <div className="wf-entity-title">
                  <div>
                    <span className="wf-eyebrow">
                      {item.kind} · {item.code || "unmapped"}
                    </span>
                    <h3>{item.label}</h3>
                  </div>
                  <span className="wf-badge">{item.status}</span>
                </div>
                <p className="wf-value">
                  {item.value} <small>{item.unit}</small>
                </p>
                <p className="wf-meta">
                  Recorded: {item.observed_at || "Date unavailable"} · Original:{" "}
                  {item.original}
                </p>
                <details>
                  <summary>Source provenance ({item.sources.length})</summary>
                  {item.sources.map((source) => (
                    <p className="wf-source" key={source}>
                      {source}
                    </p>
                  ))}
                </details>
                {item.status !== "merged" && (
                  <div className="wf-entity-actions">
                    <input
                      aria-label={`Correct ${item.label}`}
                      value={editValues[item.id] ?? item.value}
                      onChange={(e) =>
                        setEditValues({
                          ...editValues,
                          [item.id]: e.target.value,
                        })
                      }
                    />
                    <button
                      disabled={busy || actor.trim().length < 2}
                      onClick={() =>
                        mutate(
                          `/entities/${item.id}/review`,
                          { actor, action: "accept" },
                          "Fact accepted.",
                        )
                      }
                    >
                      Accept
                    </button>
                    <button
                      disabled={
                        busy ||
                        actor.trim().length < 2 ||
                        !(editValues[item.id] ?? item.value).trim()
                      }
                      onClick={() =>
                        mutate(
                          `/entities/${item.id}/review`,
                          {
                            actor,
                            action: "edit",
                            value: editValues[item.id] ?? item.value,
                          },
                          "Correction saved with original value in audit.",
                        )
                      }
                    >
                      Save edit
                    </button>
                    <button
                      disabled={busy || actor.trim().length < 2}
                      onClick={() =>
                        mutate(
                          `/entities/${item.id}/review`,
                          { actor, action: "reject" },
                          "Fact rejected; original evidence retained.",
                        )
                      }
                    >
                      Reject
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
          <details className="wf-card">
            <summary>Add a source-backed fact</summary>
            <p>
              Enter the source exactly; terminology mapping must be checked by
              the reviewer.
            </p>
            <form
              className="wf-add-form"
              onSubmit={(e) => {
                e.preventDefault();
                mutate(
                  "/entities",
                  { ...newEntity, actor },
                  "Source fact added to review queue.",
                );
              }}
            >
              <select
                value={newEntity.kind}
                onChange={(e) =>
                  setNewEntity({ ...newEntity, kind: e.target.value })
                }
              >
                {[
                  "observation",
                  "diagnosis",
                  "medication",
                  "allergy",
                  "procedure",
                ].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
              {(
                [
                  "label",
                  "code",
                  "value",
                  "unit",
                  "observed_at",
                  "source",
                ] as const
              ).map((field) => (
                <label key={field}>
                  {field.replace("_", " ")}
                  <input
                    required={["label", "value", "source"].includes(field)}
                    value={newEntity[field]}
                    onChange={(e) =>
                      setNewEntity({ ...newEntity, [field]: e.target.value })
                    }
                  />
                </label>
              ))}
              <button disabled={busy || actor.trim().length < 2}>
                Add to review queue
              </button>
            </form>
          </details>
          <section className="wf-card">
            <h3>Workflow reminders</h3>
            <p>
              Checklist suggestions require an explicit decision and never alter
              medication or treatment automatically.
            </p>
            {workspace.recommendations.map((item) => (
              <article className="wf-recommendation" key={item.id}>
                <p>{item.text}</p>
                <small>
                  {item.source} · {item.status}
                </small>
                <div>
                  <button
                    disabled={busy || actor.trim().length < 2}
                    onClick={() =>
                      mutate(
                        `/recommendations/${item.id}`,
                        { actor, action: "accept" },
                        "Reminder accepted for document inclusion.",
                      )
                    }
                  >
                    Accept reminder
                  </button>
                  <button
                    disabled={busy || actor.trim().length < 2}
                    onClick={() =>
                      mutate(
                        `/recommendations/${item.id}`,
                        { actor, action: "reject" },
                        "Reminder dismissed and recorded.",
                      )
                    }
                  >
                    Dismiss
                  </button>
                </div>
              </article>
            ))}
          </section>
        </>
      )}
      {workspace && section === "documents" && (
        <div className="wf-document-grid">
          <section className="wf-card">
            <h3>Prepare a document</h3>
            <p>
              Templates include accepted facts and your authored instructions.
              Finalization requires all facts and conflicts to be reviewed.
            </p>
            <label>
              Document type
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="treatment_plan">Treatment plan</option>
                <option value="discharge_summary">Discharge summary</option>
              </select>
            </label>
            <label>
              Clinician-authored instructions
              <textarea
                rows={8}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Enter follow-up, treatment instructions or discharge notes for review."
              />
            </label>
            <div className="wf-button-row">
              <button
                disabled={busy || actor.trim().length < 2}
                onClick={() =>
                  mutate(
                    "/documents",
                    { actor, kind, notes, finalize: false },
                    "Draft prepared from the reviewed facts.",
                  )
                }
              >
                Preview draft
              </button>
              <button
                disabled={busy || !canFinalize || actor.trim().length < 2}
                onClick={() =>
                  mutate(
                    "/documents",
                    { actor, kind, notes, finalize: true },
                    "Document finalized locally.",
                  )
                }
              >
                Finalize
              </button>
            </div>
            {!canFinalize && (
              <p className="wf-meta">
                Resolve {pending} pending facts and{" "}
                {workspace.deduplication.length} duplicate/conflict groups
                before finalization.
              </p>
            )}
            <h3>Saved documents</h3>
            {workspace.documents.length === 0 && (
              <p>No documents prepared yet.</p>
            )}
            {[...workspace.documents].reverse().map((doc) => (
              <div className="wf-saved" key={doc.id}>
                <button onClick={() => setPreview(doc)}>
                  {doc.kind.replace("_", " ")} · {doc.status} · v
                  {doc.record_version}
                </button>
                <a
                  href={`${url}/documents/${doc.id}/print`}
                  onClick={(e) => {
                    if (authEnabled) {
                      e.preventDefault();
                      downloadProtectedResource(
                        `${url}/documents/${doc.id}/print`,
                        `${doc.kind}-${patientId}.html`,
                      ).catch((e) => setError(e.message));
                    }
                  }}
                  target="_blank"
                  rel="noreferrer"
                >
                  Print / save PDF
                </a>
              </div>
            ))}
          </section>
          <section className="wf-card">
            <h3>
              {preview
                ? `Document preview · ${preview.status}`
                : "Document preview"}
            </h3>
            <pre className="wf-document-preview">
              {preview?.text ??
                "Create or select a document to review its contents."}
            </pre>
          </section>
          <section className="wf-card wf-wide">
            <h3>Approve & store FHIR locally</h3>
            <p>
              {workspace.fhir_validation}. This is a local collection bundle,
              not a hospital transmission.
            </p>
            <button
              disabled={!canFinalize || busy || actor.trim().length < 2}
              onClick={() =>
                mutate(
                  "/fhir/approve",
                  { actor },
                  "Approved bundle persisted in the local repository.",
                )
              }
            >
              Approve verified record & store bundle
            </button>
            {[...workspace.bundles].reverse().map((bundle) => (
              <div className="wf-saved" key={bundle.id}>
                <span>
                  Record v{bundle.record_version} ·{" "}
                  {new Date(bundle.approved_at).toLocaleString()} ·{" "}
                  {bundle.destination}
                </span>
                <button
                  onClick={() =>
                    download(
                      `${patientId}-fhir-${bundle.id}.json`,
                      bundle.bundle,
                    )
                  }
                >
                  Export FHIR JSON
                </button>
              </div>
            ))}
          </section>
        </div>
      )}
      {section === "sources" && (
        <section className="wf-card">
          <h3>Legacy ingestion & identity explorer</h3>
          <p>
            The twin cohort IDs and the legacy EHR IDs have no established
            identity mapping. Select a legacy record to inspect it
            independently; this does not attach its documents to {patientId}.
          </p>
          <div className="wf-toolbar">
            <select
              value={legacyId}
              onChange={(e) => {
                setLegacyId(e.target.value);
                setLegacyData(null);
              }}
            >
              <option value="">Select legacy EHR patient</option>
              {legacyPatients.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name} · {p.mrn || p.id}
                </option>
              ))}
            </select>
            <button
              disabled={!legacyId}
              onClick={async () => {
                setLegacyError("");
                try {
                  setLegacyData(
                    await api(
                      `/api/v1/patients/${encodeURIComponent(legacyId)}/dashboard`,
                    ),
                  );
                } catch (e) {
                  setLegacyError((e as Error).message);
                }
              }}
            >
              Load source documents
            </button>
            <button
              onClick={async () => {
                setLegacyError("");
                try {
                  setLegacyData(await api("/api/v1/identity/review-queue"));
                } catch (e) {
                  setLegacyError((e as Error).message);
                }
              }}
            >
              Inspect identity queue
            </button>
          </div>
          {legacyError && (
            <p className="wf-error">
              Legacy service unavailable: {legacyError}
            </p>
          )}
          <pre className="wf-json">
            {legacyData
              ? JSON.stringify(legacyData, null, 2)
              : "Select a source to inspect document provenance, encounters and pending historical records."}
          </pre>
        </section>
      )}
      {section === "audit" && (
        <section className="wf-card">
          <div className="wf-toolbar">
            <h3>Persisted activity</h3>
            <button
              onClick={() =>
                api<AuditEvent[]>(url + "/audit")
                  .then(setAudit)
                  .catch((e) => setError(e.message))
              }
            >
              Refresh
            </button>
            <button
              onClick={() => download(`${patientId}-review-audit.json`, audit)}
            >
              Export log
            </button>
          </div>
          <p>
            Hash-linked local audit events preserve original and corrected
            values. Local database administrators can modify the store; this is
            not a certified immutable audit service.
          </p>
          {audit.length === 0 && <p>No activity loaded.</p>}
          {audit.map((item) => (
            <details className="wf-audit" key={item.id}>
              <summary>
                {item.action} · {item.actor} ·{" "}
                {new Date(item.timestamp).toLocaleString()}
              </summary>
              <pre className="wf-json">
                {JSON.stringify(item.detail, null, 2)}
              </pre>
              <small>SHA-256: {item.hash}</small>
            </details>
          ))}
        </section>
      )}
    </div>
  );
}
