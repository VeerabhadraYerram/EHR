import { useState } from "react";
import type { PatientSimulation, Reading, SimulationBranch } from "./types";

interface Props {
  simulation: PatientSimulation | null;
  currentReading: Reading | null;
  historicalReadings: Reading[];
  futureReadings?: Reading[];
  branch?: SimulationBranch | null;
  compact?: boolean;
  loading?: boolean;
}
export default function GlucoseForecastPanel({
  simulation,
  historicalReadings,
  futureReadings = [],
  branch,
  compact = false,
  loading = false,
}: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [showObserved, setShowObserved] = useState(false);
  const [showAll, setShowAll] = useState(false);
  if (!simulation)
    return (
      <section className="paper-card empty-state" aria-live="polite">
        <span className="eyebrow">Glucose forecast</span>
        <h3>
          {loading
            ? "Computing patient-specific forecast…"
            : "No forecast for this moment"}
        </h3>
        <p>
          Choose a reading with at least two hours of continuous history.
          Predictions are never substituted with demo numbers.
        </p>
      </section>
    );
  const baseline = simulation.baseline;
  const trajectory = baseline.continuous_trajectory;
  const asOf = new Date(baseline.decision_time).getTime();
  const recordedFuture = futureReadings.map((reading) => ({
    ...reading,
    horizon: (new Date(reading.reading_time).getTime() - asOf) / 60000,
  })).filter((reading) => Number.isFinite(reading.horizon) && reading.horizon > 0 && reading.horizon <= 120);
  const history = historicalReadings.slice(-9);
  const width = 940,
    height = compact ? 210 : 300,
    left = 48,
    right = 22,
    top = 34,
    bottom = 40;
  const values = [
    ...history.map((r) => r.glucose_mg_dl),
    ...trajectory.flatMap((p) => [
      p.projected_glucose_mg_dl,
      p.lower_bound_p10_mg_dl,
      p.upper_bound_p90_mg_dl,
    ]),
    ...(branch?.simulated_trajectory.map((p) => p.projected_glucose_mg_dl) ||
      []),
    ...(showObserved
      ? recordedFuture.map((r) => r.glucose_mg_dl)
      : []),
  ];
  const low = Math.min(50, Math.floor(Math.min(...values) / 20) * 20),
    high = Math.max(220, Math.ceil(Math.max(...values) / 40) * 40);
  const n = history.length + trajectory.length;
  const x = (i: number) =>
    left + (i / Math.max(1, n - 1)) * (width - left - right);
  const y = (g: number) =>
    top + ((high - g) / (high - low)) * (height - top - bottom);
  const now = Math.max(0, history.length - 1);
  const observedPath = recordedFuture.map((reading, index) => {
    const previousHorizon = index > 0 ? recordedFuture[index - 1].horizon : 0;
    const command = reading.horizon - previousHorizon === 15 ? "L" : "M";
    return `${command}${x(now + reading.horizon / 15)},${y(reading.glucose_mg_dl)}`;
  }).join(" ");
  const historicalLine = history
    .map((r, i) => `${x(i)},${y(r.glucose_mg_dl)}`)
    .join(" ");
  const forecastLine = [
    `${x(now)},${y(baseline.glucose_now_mg_dl)}`,
    ...trajectory.map(
      (p, i) => `${x(now + i + 1)},${y(p.projected_glucose_mg_dl)}`,
    ),
  ].join(" ");
  const envelope = [
    ...trajectory.map(
      (p, i) => `${x(now + i + 1)},${y(p.upper_bound_p90_mg_dl)}`,
    ),
    ...[...trajectory]
      .reverse()
      .map(
        (p, i) =>
          `${x(now + trajectory.length - i)},${y(p.lower_bound_p10_mg_dl)}`,
      ),
  ].join(" ");
  const ongoing =
    baseline.model_applicable === false ||
    baseline.event_status === "ongoing_hyperglycemia";
  const explanation = baseline.explanation || {};
  const all = explanation.all_contributions as
    Record<string, number> | undefined;
  const drivers =
    showAll && all
      ? Object.entries(all)
          .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
          .map(([feature, shap_value]) => ({
            feature,
            shap_value,
            clinical_explanation: `Input: ${baseline.features?.[feature] ?? "see source snapshot"}`,
          }))
      : baseline.top_shap_drivers;
  const maximum = Math.max(...drivers.map((d) => Math.abs(d.shap_value)), 0.01);
  return (
    <section
      className="paper-card forecast-card"
      aria-label="Shared model forecast"
    >
      <div className="card-heading">
        <div>
          <span className="eyebrow">Trained XGBoost · 120-minute horizon</span>
          <h2>
            {compact
              ? "The next two hours"
              : "Glucose trajectory & explanation"}
          </h2>
        </div>
        <span
          className={`risk-pill ${ongoing ? "watch" : baseline.risk_tier.toLowerCase()}`}
        >
          {ongoing
            ? "Already above threshold"
            : baseline.risk_tier === "CALM"
              ? "Low risk"
              : `${baseline.risk_tier.toLowerCase()} risk`}
        </span>
      </div>
      {!compact && (
        <div className="forecast-summary">
          <div>
            <span>Incident spike probability</span>
            <strong data-testid="forecast-risk">
              {ongoing
                ? "Not applicable"
                : `${Math.round(baseline.calibrated_spike_probability * 100)}%`}
            </strong>
            <small>
              {ongoing
                ? "Current glucose ≥180 mg/dL"
                : "Calibrated classifier output"}
            </small>
          </div>
          <div>
            <span>Projected peak</span>
            <strong>
              {baseline.predicted_peak_glucose_mg_dl.toFixed(1)}{" "}
              <small>mg/dL</small>
            </strong>
            <small>In {baseline.predicted_peak_time_minutes} minutes</small>
          </div>
          <div>
            <span>As-of reading</span>
            <strong>{baseline.decision_time.slice(11, 16)}</strong>
            <small>
              {baseline.decision_time.slice(0, 10)} · recorded replay
            </small>
          </div>
        </div>
      )}
      {ongoing && (
        <p className="notice warning">
          This reading is already above 180 mg/dL. Both trained heads were
          evaluated on readings below that threshold; outputs here are
          extrapolations, not a validated incident warning.
        </p>
      )}
      <div className="chart-wrap">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Recorded glucose history and trained model forecast"
          className="glucose-chart"
        >
          {[70, 100, 140, 180, 220, 260, 300, 340, 380]
            .filter((v) => v <= high)
            .map((v) => (
              <g key={v}>
                <line
                  x1={left}
                  x2={width - right}
                  y1={y(v)}
                  y2={y(v)}
                  className={
                    v === 180 || v === 70 ? "threshold-line" : "grid-line"
                  }
                />
                <text x={left - 10} y={y(v) + 4} textAnchor="end">
                  {v}
                </text>
              </g>
            ))}
          <polygon points={envelope} className="uncertainty-band" />
          <line
            x1={x(now)}
            x2={x(now)}
            y1={top - 8}
            y2={height - bottom}
            className="now-line"
          />
          <text x={x(now)} y={top - 17} textAnchor="middle">
            AS OF {baseline.decision_time.slice(11, 16)}
          </text>
          <polyline points={historicalLine} className="history-line" />
          <polyline points={forecastLine} className="forecast-line" />
          {branch && (
            <polyline
              points={[
                `${x(now)},${y(baseline.glucose_now_mg_dl)}`,
                ...branch.simulated_trajectory.map(
                  (p, i) => `${x(now + i + 1)},${y(p.projected_glucose_mg_dl)}`,
                ),
              ].join(" ")}
              className="scenario-line"
            />
          )}
          {showObserved && (
            <g>
              <path d={`M${x(now)},${y(baseline.glucose_now_mg_dl)} ${observedPath}`} className="observed-line" />
              {recordedFuture.map((reading) => <circle key={reading.reading_time} cx={x(now + reading.horizon / 15)} cy={y(reading.glucose_mg_dl)} r="3" fill="#555d55"><title>{reading.time}: {reading.glucose_mg_dl} mg/dL</title></circle>)}
            </g>
          )}
          {trajectory.map((p, i) => (
            <g key={p.horizon_minutes}>
              <text x={x(now + i + 1)} y={height - 13} textAnchor="middle">
                +{p.horizon_minutes}m
              </text>
              <circle
                cx={x(now + i + 1)}
                cy={y(p.projected_glucose_mg_dl)}
                r={hover === i ? 6 : 3.5}
                className="forecast-point"
                tabIndex={0}
                aria-label={`${p.horizon_minutes} minutes: ${p.projected_glucose_mg_dl} mg/dL`}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          ))}
          {hover !== null && trajectory[hover] && (
            <g>
              <rect
                x={Math.min(width - 177, Math.max(3, x(now + hover + 1) - 80))}
                y={4}
                width="170"
                height="23"
                rx="6"
                fill="#292e27"
              />
              <text
                x={Math.min(width - 92, Math.max(88, x(now + hover + 1) + 5))}
                y={20}
                textAnchor="middle"
                fill="white"
              >
                +{trajectory[hover].horizon_minutes}m ·{" "}
                {trajectory[hover].projected_glucose_mg_dl} mg/dL
              </text>
            </g>
          )}
        </svg>
      </div>
      <div className="chart-legend">
        <span>
          <i className="legend-history" />
          Recorded history
        </span>
        <span>
          <i className="legend-forecast" />
          Model forecast
        </span>
        {branch && (
          <span>
            <i className="legend-scenario" />
            What-if estimate
          </span>
        )}
        <span>
          <i className="legend-band" />
          Illustrative range
        </span>
        {!compact && (
          <label>
            <input
              type="checkbox"
              checked={showObserved}
              onChange={(e) => setShowObserved(e.target.checked)}
            />
            Reveal recorded future
          </label>
        )}
      </div>
      {showObserved && (
        <p className="caption">
          Retrospective comparison only. Future readings are displayed after
          prediction and never sent as model inputs. Missing intervals remain gaps.
        </p>
      )}
      {!compact && (
        <>
          <p className="caption">
            {baseline.uncertainty_method ||
              "Illustrative sensitivity range; interval coverage has not been clinically validated."}
          </p>
          <div className="section-divider" />
          <div className="card-heading">
            <div>
              <span className="eyebrow">
                TreeSHAP · raw classifier log-odds
              </span>
              <h3>Why the model reached this result</h3>
            </div>
            {all && (
              <button
                className="text-button"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll
                  ? "Show top factors"
                  : `Inspect all ${Object.keys(all).length} factors`}
              </button>
            )}
          </div>
          <p className="caption">
            These are backend TreeExplainer contributions. They explain the
            classifier before isotonic calibration, not percentage-point changes
            in calibrated risk.
          </p>
          <div className="shap-list">
            {drivers.map((d) => (
              <div className="shap-row" key={d.feature}>
                <div>
                  <span>{d.feature.replaceAll("_", " ")}</span>
                  <small>{d.clinical_explanation}</small>
                </div>
                <div className="shap-track">
                  <i
                    className={d.shap_value > 0 ? "increasing" : "decreasing"}
                    style={{
                      width: `${(Math.abs(d.shap_value) / maximum) * 100}%`,
                    }}
                  />
                </div>
                <strong>
                  {d.shap_value > 0 ? "+" : ""}
                  {d.shap_value.toFixed(3)}
                </strong>
              </div>
            ))}
          </div>
          <details className="technical-details">
            <summary>Inspect model explanation and source inputs</summary>
            <pre>
              {JSON.stringify(
                {
                  explanation,
                  features: baseline.features,
                  provenance: baseline.feature_provenance,
                  model: baseline.model_provenance,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </>
      )}
    </section>
  );
}
