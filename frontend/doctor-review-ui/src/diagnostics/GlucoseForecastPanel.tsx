import { useState } from "react";
import ShapContributionChart from './ShapContributionChart';
import { Activity, HeartPulse, ClipboardCheck, Dna, Users, ArrowRight } from "lucide-react";
import type { PatientSimulation, Reading, SimulationBranch } from "./types";

interface Props {
  simulation: PatientSimulation | null;
  currentReading: Reading | null;
  historicalReadings: Reading[];
  futureReadings?: Reading[];
  branch?: SimulationBranch | null;
  compact?: boolean;
  loading?: boolean;
  onNavigate?: (page: any) => void;
}
export default function GlucoseForecastPanel({
  simulation,
  historicalReadings,
  futureReadings = [],
  branch,
  compact = false,
  loading = false,
  onNavigate,
}: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [showObserved, setShowObserved] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [showHistory, setShowHistory] = useState(true);
  const [showForecast, setShowForecast] = useState(true);
  const [showBand, setShowBand] = useState(true);
  const [showBranch, setShowBranch] = useState(true);
  const [activeCursor, setActiveCursor] = useState<{
    svgX: number;
    svgY: number;
    time: string;
    glucose: number;
    isForecast: boolean;
    idx?: number;
    p10?: number;
    p90?: number;
    branchGlucose?: number;
    delta?: number;
  } | null>(null);
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
  const handleChartMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const svgX = (clientX / rect.width) * width;

    if (svgX < left - 15 || svgX > width - right + 15) {
      setActiveCursor(null);
      return;
    }

    const frac = Math.max(0, Math.min(1, (svgX - left) / (width - left - right)));
    const nearestIdx = Math.round(frac * (n - 1));

    if (nearestIdx < history.length) {
      const hPoint = history[nearestIdx];
      setActiveCursor({
        svgX: x(nearestIdx),
        svgY: y(hPoint.glucose_mg_dl),
        time: hPoint.time || hPoint.reading_time || "",
        glucose: hPoint.glucose_mg_dl,
        isForecast: false,
        idx: nearestIdx,
      });
    } else {
      const fIdx = nearestIdx - history.length;
      if (fIdx < trajectory.length) {
        const fPoint = trajectory[fIdx];
        const branchP = branch?.simulated_trajectory[fIdx];
        const delta = branchP ? branchP.projected_glucose_mg_dl - fPoint.projected_glucose_mg_dl : undefined;
        setActiveCursor({
          svgX: x(nearestIdx),
          svgY: y(fPoint.projected_glucose_mg_dl),
          time: `+${fPoint.horizon_minutes}m`,
          glucose: fPoint.projected_glucose_mg_dl,
          isForecast: true,
          idx: nearestIdx,
          p10: fPoint.lower_bound_p10_mg_dl,
          p90: fPoint.upper_bound_p90_mg_dl,
          branchGlucose: branchP?.projected_glucose_mg_dl,
          delta,
        });
      }
    }
  };

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
          className="glucose-chart interactive-chart"
          onMouseMove={handleChartMouseMove}
          onMouseLeave={() => setActiveCursor(null)}
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
          {showBand && <polygon points={envelope} className="uncertainty-band" />}
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
          {showHistory && <polyline points={historicalLine} className="history-line" />}
          {showForecast && <polyline points={forecastLine} className="forecast-line" />}
          {branch && showBranch && (
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
          {showForecast && trajectory.map((p, i) => (
            <g key={p.horizon_minutes}>
              <text x={x(now + i + 1)} y={height - 13} textAnchor="middle">
                +{p.horizon_minutes}m
              </text>
              <circle
                cx={x(now + i + 1)}
                cy={y(p.projected_glucose_mg_dl)}
                r={hover === i || (activeCursor?.idx === now + i + 1) ? 6 : 3.5}
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

          {/* Interactive Scrubbing Crosshair & Floating Tooltip */}
          {activeCursor && (
            <g className="chart-interactive-guide">
              <line
                x1={activeCursor.svgX}
                x2={activeCursor.svgX}
                y1={top - 8}
                y2={height - bottom}
                className="active-crosshair-line"
                stroke="#0d7653"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
              <circle
                cx={activeCursor.svgX}
                cy={activeCursor.svgY}
                r="6.5"
                fill="#10b981"
                stroke="#ffffff"
                strokeWidth="2.5"
              />
              {activeCursor.branchGlucose !== undefined && (
                <circle
                  cx={activeCursor.svgX}
                  cy={y(activeCursor.branchGlucose)}
                  r="5.5"
                  fill="#0d9488"
                  stroke="#ffffff"
                  strokeWidth="2"
                />
              )}
              {/* Dynamic Floating Tooltip */}
              <g transform={`translate(${Math.min(width - 250, Math.max(left + 10, activeCursor.svgX - 120))}, 4)`}>
                <rect
                  width="240"
                  height="26"
                  rx="6"
                  fill="#08251e"
                  stroke="#124738"
                  strokeWidth="1"
                />
                <text
                  x="120"
                  y="17"
                  textAnchor="middle"
                  fill="#ecfdf5"
                  fontSize="11"
                  fontWeight="500"
                >
                  {activeCursor.isForecast ? `Forecast ${activeCursor.time}: ` : `Recorded ${activeCursor.time}: `}
                  <tspan fill="#34d399" fontWeight="700">
                    {Math.round(activeCursor.glucose)} mg/dL
                  </tspan>
                  {activeCursor.delta !== undefined && (
                    <tspan fill="#6ee7b7">
                      {" "}(What-If: {Math.round(activeCursor.branchGlucose!)} mg/dL)
                    </tspan>
                  )}
                </text>
              </g>
            </g>
          )}
        </svg>
      </div>

      {/* Interactive Legend with Layer Toggle Filters */}
      <div className="chart-legend interactive-legend">
        <button
          type="button"
          className={`legend-toggle-pill ${showHistory ? "active" : "muted"}`}
          onClick={() => setShowHistory(!showHistory)}
          title="Click to toggle historical CGM readings"
        >
          <i className="legend-history" />
          <span>Recorded history</span>
        </button>
        <button
          type="button"
          className={`legend-toggle-pill ${showForecast ? "active" : "muted"}`}
          onClick={() => setShowForecast(!showForecast)}
          title="Click to toggle model forecasted trajectory"
        >
          <i className="legend-forecast" />
          <span>Model forecast</span>
        </button>
        {branch && (
          <button
            type="button"
            className={`legend-toggle-pill ${showBranch ? "active" : "muted"}`}
            onClick={() => setShowBranch(!showBranch)}
            title="Click to toggle what-if scenario trajectory"
          >
            <i className="legend-scenario" />
            <span>What-if estimate</span>
          </button>
        )}
        <button
          type="button"
          className={`legend-toggle-pill ${showBand ? "active" : "muted"}`}
          onClick={() => setShowBand(!showBand)}
          title="Toggle the illustrative model sensitivity range; coverage is not calibrated"
        >
          <i className="legend-band" />
          <span>Model sensitivity range</span>
        </button>
        {!compact && (
          <label className="observed-toggle">
            <input
              type="checkbox"
              checked={showObserved}
              onChange={(e) => setShowObserved(e.target.checked)}
            />
            <span>Reveal recorded future</span>
          </label>
        )}
      </div>

      {compact && onNavigate && (
        <div className="graph-sub-navigation" role="group" aria-label="Clinical workspace navigation">
          <button
            type="button"
            className="graph-nav-pill-btn primary"
            onClick={() => onNavigate("forecast")}
            title="Open 120-minute continuous glucose forecast & CGM timeline"
          >
            <Activity size={14} />
            <span>Forecast<small>Timeline & model factors</small></span>
            <ArrowRight size={13} />
          </button>
          <button
            type="button"
            className="graph-nav-pill-btn"
            onClick={() => onNavigate("anatomy")}
            title="Explore the body reference and imaging evidence"
          >
            <HeartPulse size={14} />
            <span>Body & imaging<small>Atlas & scan evidence</small></span>
          </button>
          <button
            type="button"
            className="graph-nav-pill-btn"
            onClick={() => onNavigate("review")}
            title="Clinical review & fact reconciliation"
          >
            <ClipboardCheck size={14} />
            <span>Clinical review<small>Verify clinical evidence</small></span>
          </button>
          <button
            type="button"
            className="graph-nav-pill-btn"
            onClick={() => onNavigate("genomics")}
            title="Inspect DNA sequence & genetic risk alleles"
          >
            <Dna size={14} />
            <span>Genomics explorer<small>Variants & evidence</small></span>
          </button>
          <button
            type="button"
            className="graph-nav-pill-btn"
            onClick={() => onNavigate("patients")}
            title="View cohort patient profiles"
          >
            <Users size={14} />
            <span>Patient profiles<small>Explore the cohort</small></span>
          </button>
          <button
            type="button"
            className="graph-nav-pill-btn"
            onClick={() => onNavigate("operations")}
            title="Open alerts, similar cases, delivery receipts and access audit"
          >
            <ClipboardCheck size={14} />
            <span>Care operations<small>Alerts, cases & audit</small></span>
          </button>
        </div>
      )}
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
          <ShapContributionChart drivers={drivers} features={baseline.features} />
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
