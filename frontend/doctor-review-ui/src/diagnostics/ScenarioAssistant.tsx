import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  BookOpen,
  Check,
  Copy,
  RotateCcw,
  Sparkles,
  Square,
} from "lucide-react";
import { requestJson } from "./patientService";
import AnswerVisual, { EvidenceValue } from "./AnswerVisual";
import type { AssistantAnswer } from "./assistantTypes";
import type { InterventionSpec, PatientSimulation } from "./types";
import "./scenario-assistant.css";

type Message = {
  role: "user" | "assistant";
  text: string;
  answer?: AssistantAnswer;
};
const suggestions = [
  [
    "Understand the patient record",
    "Explain the patient’s HbA1c in simple words",
  ],
  ["Explore a scenario", "What if the patient walks for 30 minutes?"],
  [
    "See the pattern",
    "Show the patient’s recorded glucose trend and explain the observations",
  ],
  [
    "Check the evidence",
    "What does the evidence show about the patient’s kidney health, and what is missing?",
  ],
];
const labels: Record<string, string> = {
  record: "Recorded fact",
  observation: "Observed pattern",
  prediction: "Model prediction",
  scenario: "Hypothetical scenario",
  explanation: "Explanation",
  limitation: "Evidence limit",
};
export default function ScenarioAssistant({
  patientId,
  decisionTime,
  onRun,
  onSelect,
  onSimulation,
}: {
  patientId: string;
  decisionTime: string;
  onRun: (specs: InterventionSpec[]) => void;
  onSelect: (type: string) => void;
  onSimulation: (simulation: PatientSimulation) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]),
    [prompt, setPrompt] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState("");
  const [status, setStatus] = useState<{
      configured: boolean;
      providers: string[];
      external_data: string;
    } | null>(null),
    [sources, setSources] = useState<Record<number, boolean>>({}),
    [copied, setCopied] = useState<number | null>(null);
  const request = useRef<AbortController | null>(null),
    context = useRef("");
  useEffect(() => {
    const c = new AbortController();
    requestJson<typeof status>("/api/v1/twin/assistant/status", {
      signal: c.signal,
    })
      .then(setStatus)
      .catch(() => {});
    return () => c.abort();
  }, []);
  useEffect(() => {
    context.current = `${patientId}:${decisionTime}`;
    request.current?.abort();
    setMessages([]);
    setPrompt("");
    setPending(false);
    setError("");
    setRetry("");
    setSources({});
    return () => {
      request.current?.abort();
    };
  }, [patientId, decisionTime]);
  const stop = () => {
    request.current?.abort();
    setPending(false);
    setError("Request stopped. No records were changed.");
  };
  async function ask(question: string) {
    const q = question.trim();
    if (!q || pending || !decisionTime) return;
    const snapshot = context.current,
      controller = new AbortController();
    request.current = controller;
    const history = messages
      .slice(-8)
      .map((m) => ({ role: m.role, text: m.text.slice(0, 5000) }));
    setMessages((m) => [...m, { role: "user", text: q }]);
    setPrompt("");
    setError("");
    setRetry(q);
    setPending(true);
    const timeout = setTimeout(() => controller.abort(), 98000);
    try {
      const result = await requestJson<AssistantAnswer>(
        `/api/v1/twin/patients/${encodeURIComponent(patientId)}/assistant`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: q,
            decision_time: decisionTime,
            history,
          }),
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted || context.current !== snapshot) return;
      if (
        result.patient_id !== patientId ||
        result.decision_time !== decisionTime
      )
        throw new Error(
          "The response did not match this patient and timestamp. Please retry.",
        );
      const text = result.claims.map((c) => c.text).join("\n\n");
      setMessages((m) => [...m, { role: "assistant", text, answer: result }]);
      if (result.simulation && result.interventions.length) {
        onRun(result.interventions);
        onSelect(result.interventions[0].intervention_type);
        onSimulation(result.simulation);
      }
      setRetry("");
    } catch (e) {
      if (context.current === snapshot)
        setError(
          controller.signal.aborted
            ? "Request stopped or timed out. No answer was substituted. You can retry."
            : (e as Error).message,
        );
    } finally {
      clearTimeout(timeout);
      if (context.current === snapshot) setPending(false);
    }
  }
  async function copy(m: Message, index: number) {
    try {
      await navigator.clipboard.writeText(m.text);
      setCopied(index);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setError(
        "Copy is unavailable in this browser. Select the response text to copy it.",
      );
    }
  }
  return (
    <section className="paper-card scenario-assistant evidence-assistant">
      <header className="assistant-heading">
        <div>
          <span className="eyebrow">
            <Sparkles size={13} /> Selected patient, explained
          </span>
          <h2>Ask. Understand. Explore.</h2>
          <p className="muted">
            Questions about the record, clear explanations, and supported
            what-if experiments—with the evidence beside every answer.
          </p>
        </div>
        <button
          className="button secondary"
          disabled={pending || !messages.length}
          onClick={() => {
            setMessages([]);
            setSources({});
            setError("");
            setRetry("");
          }}
        >
          <RotateCcw size={13} />
          New conversation
        </button>
      </header>
      <div className="assistant-context-strip">
        <span>
          <i />
          {patientId}
        </span>
        <span>
          As of {decisionTime.replace("T", " ") || "Select a reading"}
        </span>
        <span>
          {status?.configured ? "AI + patient evidence" : "Local evidence mode"}
        </span>
        <span>Read-only assistant</span>
      </div>
      <details className="assistant-privacy">
        <summary>
          <BookOpen size={12} /> How answers are grounded & where data goes
        </summary>
        <p>
          {status?.external_data ||
            "Checking the backend connection. API credentials stay on the server."}
        </p>
        <p>
          Facts, observations, model forecasts and hypothetical effects are
          labelled separately. Baseline cohort fields may be derived or imputed.
          This assistant does not prescribe medication, diagnose from a scan, or
          write to the clinical record.
        </p>
      </details>
      {!messages.length && (
        <div className="assistant-start">
          <div>
            <span className="eyebrow">Start with a question</span>
            <h3>What would you like to understand?</h3>
          </div>
          <div className="assistant-question-grid">
            {suggestions.map(([label, q]) => (
              <button
                key={q}
                onClick={() => ask(q)}
                disabled={pending || !decisionTime}
              >
                <span>{label}</span>
                <strong>{q}</strong>
                <ArrowUp size={15} />
              </button>
            ))}
          </div>
        </div>
      )}
      <div
        className="assistant-conversation"
        role="log"
        aria-label="Patient assistant conversation"
        aria-live="polite"
        aria-busy={pending}
      >
        {messages.map((m, i) => (
          <article key={i} className={`assistant-message ${m.role}`}>
            <div className="assistant-message-heading">
              <strong>
                {m.role === "user" ? "Clinician" : "Patient evidence assistant"}
              </strong>
              {m.answer && (
                <span>
                  {m.answer.provider.provider === "local"
                    ? "Evidence-only fallback"
                    : `${m.answer.provider.provider} · grounded response`}
                </span>
              )}
            </div>
            {m.answer ? (
              <>
                <h3>{m.answer.title}</h3>
                <AnswerVisual visual={m.answer.visual} patientId={patientId} />
                <div className="answer-claims">
                  {m.answer.claims.map((c, j) => (
                    <div key={j} className={`answer-claim ${c.kind}`}>
                      <span>{labels[c.kind] || c.kind}</span>
                      <p>{c.text}</p>
                      <div className="answer-citations">
                        {c.evidence_ids.map((id) => {
                          const e = m.answer!.evidence.find((e) => e.id === id);
                          return (
                            <button
                              key={id}
                              onClick={() =>
                                setSources((s) => ({ ...s, [i]: true }))
                              }
                              title={e?.source || e?.url || e?.label}
                            >
                              <BookOpen size={10} />
                              {e?.label || id}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {m.answer.notices.map((n) => (
                  <p className="notice warning" key={n}>
                    {n}
                  </p>
                ))}
                <div className="assistant-answer-actions">
                  <button
                    className="text-button"
                    aria-expanded={Boolean(sources[i])}
                    onClick={() => setSources((s) => ({ ...s, [i]: !s[i] }))}
                  >
                    <BookOpen size={13} />
                    {sources[i] ? "Hide" : "Inspect"} sources (
                    {m.answer.evidence.length})
                  </button>
                  <button className="text-button" onClick={() => copy(m, i)}>
                    {copied === i ? <Check size={13} /> : <Copy size={13} />}
                    Copy answer
                  </button>
                </div>
                {sources[i] && (
                  <div className="answer-sources">
                    {m.answer.evidence.map((e) => (
                      <section key={e.id}>
                        <span className="eyebrow">
                          {e.kind} · {e.id}
                        </span>
                        <h4>{e.label}</h4>
                        <EvidenceValue evidence={e} />
                        <p className="caption">{e.source}</p>
                        {e.url &&
                          e.url.startsWith("https://www.niddk.nih.gov/") && (
                            <a href={e.url} target="_blank" rel="noreferrer">
                              Read source at NIDDK ↗
                            </a>
                          )}
                      </section>
                    ))}
                  </div>
                )}
                {!!m.answer.followups.length && (
                  <div className="assistant-followups">
                    {m.answer.followups.map((q) => (
                      <button
                        className="button secondary"
                        key={q}
                        disabled={pending}
                        onClick={() => ask(q)}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p>{m.text}</p>
            )}
          </article>
        ))}
        {pending && (
          <div className="assistant-thinking" role="status">
            <span className="loading-spinner" />
            <div>
              <strong>Checking the record and building an explanation…</strong>
              <p>
                Charts use recorded measurements or actual simulator output.
              </p>
            </div>
            <button className="text-button" onClick={stop}>
              <Square size={12} />
              Stop
            </button>
          </div>
        )}
      </div>
      {error && (
        <div className="notice error" role="alert">
          <p>{error}</p>
          {retry && !pending && (
            <button className="text-button" onClick={() => ask(retry)}>
              Retry question
            </button>
          )}
        </div>
      )}
      <form
        className="assistant-form"
        onSubmit={(e) => {
          e.preventDefault();
          ask(prompt);
        }}
      >
        <label className="sr-only" htmlFor="patient-assistant-question">
          Ask about this patient
        </label>
        <textarea
          id="patient-assistant-question"
          rows={2}
          value={prompt}
          maxLength={2000}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(prompt);
            }
          }}
          placeholder="Ask about labs, patterns, medicines, missing evidence—or a what-if scenario…"
          disabled={!decisionTime}
        />
        <button
          className="button primary"
          disabled={pending || !prompt.trim() || !decisionTime}
        >
          <ArrowUp size={16} />
          Ask
        </button>
      </form>
      <p className="assistant-input-note">
        Enter to ask · Shift + Enter for a new line · Conversation resets when
        patient or recording time changes.
      </p>
    </section>
  );
}
