import { useEffect, useState } from "react";
import type {
  InterventionSpec,
  PatientSimulation,
  SimulationBranch,
} from "./types";
import "./scenario-assistant.css";
type Message = {
  role: "user" | "assistant";
  text: string;
  branch?: SimulationBranch;
  simulation?: PatientSimulation;
};
type Pending = {
  prompt: string;
  type: string;
  previous: PatientSimulation | null;
};
function explain(s: PatientSimulation, branch?: SimulationBranch): Message {
  const b = s.baseline;
  const drivers = b.top_shap_drivers
    .slice(0, 3)
    .map(
      (d) =>
        `${d.feature.replaceAll("_", " ")} ${d.shap_value >= 0 ? "raises" : "lowers"} the model score (SHAP ${d.shap_value.toFixed(3)}). ${d.clinical_explanation}`,
    )
    .join("\n\n");
  const text = `For ${s.person_id} at ${s.decision_time}, glucose is ${b.glucose_now_mg_dl.toFixed(1)} mg/dL. The baseline two-hour peak is ${b.predicted_peak_glucose_mg_dl.toFixed(1)} mg/dL, around +${b.predicted_peak_time_minutes} minutes. The incident-spike probability is ${(b.calibrated_spike_probability * 100).toFixed(1)}%.${b.model_applicable === false ? " This recording is outside the incident-spike model’s evaluated domain; that probability should not be interpreted as a new-event estimate." : ""}\n\n${branch ? `With “${branch.intervention_label}”, the simulated peak is ${branch.simulated_peak_mg_dl.toFixed(1)} mg/dL (${branch.peak_reduction_mg_dl.toFixed(1)} mg/dL lower than baseline). The simulator reports ${(branch.simulated_risk_probability * 100).toFixed(1)}% risk, a ${branch.risk_reduction_percentage_points.toFixed(1)} percentage-point change.\n\nWhy this scenario changes the curve: ${branch.clinical_rationale}\n\nMechanism assumed by the simulator: ${branch.biophysical_mechanism}\n\n` : ""}Why the baseline model made this prediction:\n\n${drivers || "No SHAP explanation was returned; I cannot supply a model reason."}\n\nSHAP describes model contributions, not proof of causation. What-if curves use mechanistic assumptions and are not measured treatment responses. ${b.uncertainty_method || s.uncertainty_method || "Prediction bands are approximate, not an individual guarantee."}${branch?.hypoglycemia_risk_warning ? " The simulator also flagged possible hypoglycaemia in this scenario." : ""}`;
  return { role: "assistant", text, branch, simulation: s };
}
export default function ScenarioAssistant({
  patientId,
  decisionTime,
  simulation,
  busy,
  error,
  onRun,
  onSelect,
}: {
  patientId: string;
  decisionTime: string;
  simulation: PatientSimulation | null;
  busy: boolean;
  error: string;
  onRun: (specs: InterventionSpec[]) => void;
  onSelect: (type: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]),
    [prompt, setPrompt] = useState(""),
    [pending, setPending] = useState<Pending | null>(null);
  useEffect(() => {
    setMessages([]);
    setPending(null);
    setPrompt("");
  }, [patientId, decisionTime]);
  useEffect(() => {
    if (
      !pending ||
      busy ||
      !simulation ||
      simulation === pending.previous ||
      simulation.person_id !== patientId ||
      simulation.decision_time !== decisionTime
    )
      return;
    const branch = simulation.counterfactual_branches.find(
      (b) => b.intervention_type === pending.type,
    );
    setMessages((m) => [
      ...m,
      branch
        ? explain(simulation, branch)
        : {
            role: "assistant",
            text: "The backend did not return this scenario. I cannot provide predicted values for it.",
          },
    ]);
    setPending(null);
  }, [pending, busy, simulation, patientId, decisionTime]);
  useEffect(() => {
    if (pending && error) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: `The model request failed: ${error}. No scenario values are available.`,
        },
      ]);
      setPending(null);
    }
  }, [error, pending]);
  function ask(value: string) {
    const q = value.trim();
    if (!q || pending || busy) return;
    setPrompt("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    const lower = q.toLowerCase();
    if (/insulin|dose|medication|tablet|metformin/.test(lower)) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "I can explain the current forecast and simulate supported lifestyle assumptions. I cannot choose or change medication doses. Use the clinician review workflow for medication decisions.",
        },
      ]);
      return;
    }
    if (/[-−]\s*\d/.test(lower)) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "Use a non-negative duration or an explicit carbohydrate reduction in grams.",
        },
      ]);
      return;
    }
    let specs: InterventionSpec[] = [],
      type = "";
    const walk = /walk|exercise/.test(lower),
      carbs = /carb|carbohydrate/.test(lower),
      delay = /delay|sequence|sequencing/.test(lower);
    const duration = Number(
      lower.match(/(?:walk|exercise)(?:\s+for)?\s+(\d+)/)?.[1] ??
        lower.match(/(\d+)\s*(?:min|minute)/)?.[1] ??
        20,
    );
    const grams = Number(
      lower.match(
        /(?:reduce|less|remove|cut|reduction|by)\s+(\d+)\s*(?:g|gram)/,
      )?.[1] ??
        lower.match(/(\d+)\s*(?:g|gram)/)?.[1] ??
        25,
    );
    if (
      (walk && (duration < 0 || duration > 60)) ||
      (carbs && (grams < 0 || grams > 60))
    ) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "Use walking durations of 0–60 minutes and carbohydrate reductions of 0–60 g, within the demonstration simulator’s bounds.",
        },
      ]);
      return;
    }
    if (walk && carbs) {
      type = "compound_lifestyle";
      specs = [
        {
          intervention_type: type,
          parameters: { duration_minutes: duration, carb_reduction_g: grams },
        },
      ];
    } else if (walk) {
      type = "postprandial_walk";
      specs = [
        {
          intervention_type: type,
          parameters: { duration_minutes: duration, intensity: "brisk" },
        },
      ];
    } else if (delay) {
      const mins = Number(lower.match(/(\d+)\s*(?:min|minute)/)?.[1] ?? 15);
      if (mins > 60) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text: "Choose a carbohydrate delay between 0 and 60 minutes.",
          },
        ]);
        return;
      }
      type = "food_sequencing";
      specs = [
        {
          intervention_type: type,
          parameters: {
            delay_carbs_minutes: mins,
            preload_type: "fiber_protein",
          },
        },
      ];
    } else if (carbs) {
      type = "carb_reduction";
      specs = [
        { intervention_type: type, parameters: { carb_reduction_g: grams } },
      ];
    }
    if (type) {
      if (!simulation) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text: "Wait for the shared baseline model to load before running a scenario.",
          },
        ]);
        return;
      }
      setPending({ prompt: q, type, previous: simulation });
      onSelect(type);
      onRun(specs);
      return;
    }
    if (
      /why|explain|predict|forecast|risk|glucose|compare|baseline|current|peak/.test(
        lower,
      ) &&
      simulation
    ) {
      setMessages((m) => [...m, explain(simulation)]);
      return;
    }
    setMessages((m) => [
      ...m,
      {
        role: "assistant",
        text: "Try “Explain my forecast”, “What if I walk for 30 minutes?”, “Reduce carbs by 20 g”, “Delay carbs 15 minutes”, or “Walk 20 minutes and reduce carbs by 25 g”. I interpret these supported requests locally and explain the actual model output; I do not invent answers to other clinical questions.",
      },
    ]);
  }
  return (
    <section className="paper-card scenario-assistant">
      <div className="card-heading">
        <div>
          <span className="eyebrow">Conversation with the model evidence</span>
          <h2>Ask your twin.</h2>
        </div>
        <span className="subtle-tag">Local · no external AI data transfer</span>
      </div>
      <p className="muted">
        Ask in plain language. Supported requests run the shared glucose model
        and show its predicted values and reasons. Responses use a bounded local
        language parser and evidence templates, not a general-purpose language
        model.
      </p>
      <div className="assistant-suggestions">
        {[
          "Explain my forecast",
          "What if I walk for 30 minutes?",
          "Reduce carbs by 20 g",
          "Delay carbs 15 minutes",
        ].map((q) => (
          <button
            className="button secondary"
            key={q}
            disabled={busy || Boolean(pending)}
            onClick={() => ask(q)}
          >
            {q}
          </button>
        ))}
      </div>
      <div className="assistant-conversation" role="log" aria-live="polite">
        {messages.length === 0 && (
          <p className="assistant-empty">
            Start with the forecast, then explore a supported change. The chart
            below follows the same response.
          </p>
        )}
        {messages.map((m, i) => (
          <article key={i} className={`assistant-message ${m.role}`}>
            <strong>{m.role === "user" ? "You" : "Twin assistant"}</strong>
            <p>{m.text}</p>
            {m.branch && (
              <div className="assistant-evidence">
                <span>
                  Simulated peak{" "}
                  <b>{m.branch.simulated_peak_mg_dl.toFixed(1)} mg/dL</b>
                </span>
                <span>
                  Risk change{" "}
                  <b>
                    {m.branch.risk_reduction_percentage_points.toFixed(1)} pp
                  </b>
                </span>
              </div>
            )}
            {m.simulation && (
              <details>
                <summary>Inspect forecast values & evidence</summary>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Horizon</th>
                      <th>Glucose</th>
                      <th>Approx. band</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      m.branch?.simulated_trajectory ||
                      m.simulation.baseline.continuous_trajectory
                    )
                      .filter((p) => p.horizon_minutes % 30 === 0)
                      .map((p) => (
                        <tr key={p.horizon_minutes}>
                          <td>+{p.horizon_minutes} min</td>
                          <td>{p.projected_glucose_mg_dl.toFixed(1)}</td>
                          <td>
                            {p.lower_bound_p10_mg_dl.toFixed(1)}–
                            {p.upper_bound_p90_mg_dl.toFixed(1)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                <p className="caption">
                  Snapshot: {m.simulation.person_id} ·{" "}
                  {m.simulation.decision_time}. Values in mg/dL.{" "}
                  {m.simulation.assumptions?.join(" ")}
                </p>
              </details>
            )}
          </article>
        ))}
        {pending && (
          <p role="status">
            Running the selected scenario against the shared model…
          </p>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(prompt);
        }}
        className="assistant-form"
      >
        <input
          aria-label="Ask the twin assistant"
          value={prompt}
          maxLength={1000}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="What if I walk for 20 minutes?"
        />
        <button
          className="button primary"
          disabled={busy || Boolean(pending) || !prompt.trim()}
        >
          Ask twin
        </button>
      </form>
    </section>
  );
}
