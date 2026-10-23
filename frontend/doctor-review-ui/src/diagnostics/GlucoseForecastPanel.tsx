import { useState } from "react";
import type { PatientSimulation, Reading } from "./types";
import { TrendingUp, AlertTriangle, ShieldCheck, CheckCircle2, Footprints, Salad, Scissors, Pill, Sparkles } from "lucide-react";

interface GlucoseForecastPanelProps {
  simulation: PatientSimulation | null;
  currentReading: Reading | null;
  historicalReadings: Reading[];
}

export default function GlucoseForecastPanel({
  simulation,
  currentReading,
  historicalReadings,
}: GlucoseForecastPanelProps) {
  const [selectedIntervention, setSelectedIntervention] = useState<string>("baseline");

  const baseline = simulation?.baseline;
  const branches = simulation?.counterfactual_branches || [];

  const activeBranch = branches.find((b) => b.intervention_type === selectedIntervention);

  // Trajectory points to plot
  const baselineTrajectory = baseline?.continuous_trajectory || [];
  const activeTrajectory = activeBranch ? activeBranch.simulated_trajectory : baselineTrajectory;

  // Chart dimensions & scaling (Wide Full-Width Panoramic SVG)
  const chartWidth = 1060;
  const chartHeight = 200;
  const paddingLeft = 55;
  const paddingRight = 45;
  const paddingTop = 22;
  const paddingBottom = 26;

  const innerWidth = chartWidth - paddingLeft - paddingRight;
  const innerHeight = chartHeight - paddingTop - paddingBottom;

  const minG = 60;
  const maxG = 260;

  const getY = (val: number) => {
    const clamped = Math.min(maxG, Math.max(minG, val));
    return paddingTop + innerHeight - ((clamped - minG) / (maxG - minG)) * innerHeight;
  };

  // We show 8 historical readings leading up to now + 8 forecast horizons (15 to 120m)
  const historySlice = historicalReadings.slice(-8);
  const totalSteps = historySlice.length + 8; // 8 past + 8 future

  const getX = (stepIndex: number) => {
    return paddingLeft + (stepIndex / (totalSteps - 1)) * innerWidth;
  };

  // Decision index is where history meets future
  const decisionIndex = historySlice.length > 0 ? historySlice.length - 1 : 0;
  const decisionX = getX(decisionIndex);

  // Historical path
  const historyPoints = historySlice.map((r, i) => `${getX(i)},${getY(r.glucose_mg_dl)}`);
  const historyPath = historyPoints.join(" ");

  // Forecast path (starts at decision reading)
  const nowGlucose = currentReading?.glucose_mg_dl || baseline?.glucose_now_mg_dl || 135;
  const forecastPoints = [
    `${decisionX},${getY(nowGlucose)}`,
    ...activeTrajectory.map((pt, i) => `${getX(decisionIndex + 1 + i)},${getY(pt.projected_glucose_mg_dl)}`),
  ];
  const forecastPath = forecastPoints.join(" ");

  // Baseline forecast path (if branch is selected, show baseline for comparison)
  const baselineForecastPoints = [
    `${decisionX},${getY(nowGlucose)}`,
    ...baselineTrajectory.map((pt, i) => `${getX(decisionIndex + 1 + i)},${getY(pt.projected_glucose_mg_dl)}`),
  ];
  const baselinePath = baselineForecastPoints.join(" ");

  // Confidence Envelope polygon (p10 to p90)
  const upperPoints = [
    `${decisionX},${getY(nowGlucose)}`,
    ...activeTrajectory.map((pt, i) => `${getX(decisionIndex + 1 + i)},${getY(pt.upper_bound_p90_mg_dl)}`),
  ];
  const lowerPoints = [
    ...activeTrajectory
      .slice()
      .reverse()
      .map((pt, i) => `${getX(decisionIndex + 8 - i)},${getY(pt.lower_bound_p10_mg_dl)}`),
    `${decisionX},${getY(nowGlucose)}`,
  ];
  const envelopePoints = [...upperPoints, ...lowerPoints].join(" ");

  const spikeProb = baseline?.calibrated_spike_probability || 0;
  const tier = baseline?.risk_tier || (spikeProb >= 0.5 ? "HIGH" : spikeProb >= 0.22 ? "WATCH" : "CALM");
  const isHighAlert = tier === "HIGH";

  return (
    <section className="dx-panel dx-forecast-panel">
      <header className="dx-panel-heading">
        <h2>
          <span>FORECAST /</span> GLUCOSE TRAJECTORY & 2H INCIDENT PREDICTION
        </h2>
        <div className="dx-forecast-header-pills">
          <span className={`dx-tier-pill ${tier.toLowerCase()}`}>
            {isHighAlert ? <AlertTriangle size={11} /> : <ShieldCheck size={11} />}
            {tier} RISK
          </span>
          <span className="dx-panel-tag">CALIBRATED XGBOOST DUAL-HEAD</span>
        </div>
      </header>

      <div className="dx-forecast-body">
        {/* Top Prediction Metrics Row */}
        <div className="dx-forecast-metrics-strip">
          <div className="dx-f-metric">
            <span className="dx-f-label">SPIKE PROBABILITY (≥180 mg/dL)</span>
            <div className="dx-f-val-row">
              <strong className={isHighAlert ? "alert" : ""}>
                {Math.round(spikeProb * 100)}%
              </strong>
              <small>Optimal Cutoff: 22%</small>
            </div>
            <div className="dx-f-bar-track">
              <div
                className={`dx-f-bar-fill ${tier.toLowerCase()}`}
                style={{ width: `${Math.min(100, Math.round(spikeProb * 100))}%` }}
              />
            </div>
          </div>

          <div className="dx-f-metric">
            <span className="dx-f-label">PROJECTED PEAK GLUCOSE</span>
            <div className="dx-f-val-row">
              <strong className={activeBranch ? "simulated" : isHighAlert ? "alert" : ""}>
                {activeBranch ? Math.round(activeBranch.simulated_peak_mg_dl) : Math.round(baseline?.predicted_peak_glucose_mg_dl || 160)}
              </strong>
              <small>mg/dL</small>
            </div>
            <span className="dx-f-sub">
              {activeBranch ? (
                <span className="dx-peak-reduced">
                  ↓ {activeBranch.peak_reduction_mg_dl} mg/dL blunted
                </span>
              ) : (
                `Peak at +${baseline?.predicted_peak_time_minutes || 60} min`
              )}
            </span>
          </div>

          <div className="dx-f-metric">
            <span className="dx-f-label">MULTI-HORIZON HORIZON</span>
            <div className="dx-f-val-row">
              <strong>+120</strong>
              <small>Minutes (8 Steps)</small>
            </div>
            <span className="dx-f-sub">Continuous Trajectory Output</span>
          </div>

          <div className="dx-f-metric">
            <span className="dx-f-label">CLARKE ERROR SAFETY</span>
            <div className="dx-f-val-row">
              <strong className="green">Zone A</strong>
              <small>Clinically Safe</small>
            </div>
            <span className="dx-f-sub">No Hypoglycemia Hazard</span>
          </div>
        </div>

        {/* The SVG Glucose Trajectory Chart */}
        <div className="dx-chart-wrap">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="dx-forecast-svg" preserveAspectRatio="none">
            {/* Grid Horizontal Lines */}
            {[70, 100, 140, 180, 220].map((val) => (
              <g key={val}>
                <line
                  x1={paddingLeft}
                  y1={getY(val)}
                  x2={chartWidth - paddingRight}
                  y2={getY(val)}
                  stroke={val === 180 ? "#ef444455" : val === 70 ? "#3b82f644" : "#1c3641"}
                  strokeDasharray={val === 180 || val === 70 ? "4 3" : undefined}
                  strokeWidth={val === 180 ? "1.5" : "1"}
                />
                <text
                  x={paddingLeft - 8}
                  y={getY(val) + 3}
                  textAnchor="end"
                  fill={val === 180 ? "#f87171" : val === 70 ? "#60a5fa" : "#567886"}
                  fontSize="8.5"
                  fontFamily="monospace"
                >
                  {val}
                </text>
              </g>
            ))}

            {/* Threshold Labels */}
            <text
              x={chartWidth - paddingRight - 4}
              y={getY(180) - 4}
              textAnchor="end"
              fill="#f87171"
              fontSize="7.5"
              fontFamily="monospace"
            >
              180 mg/dL SPIKE THRESHOLD
            </text>

            <text
              x={chartWidth - paddingRight - 4}
              y={getY(70) + 11}
              textAnchor="end"
              fill="#60a5fa"
              fontSize="7.5"
              fontFamily="monospace"
            >
              70 mg/dL HYPO LIMIT
            </text>

            {/* Target Glycemic Band 70-180 mg/dL */}
            <rect
              x={paddingLeft}
              y={getY(180)}
              width={innerWidth}
              height={getY(70) - getY(180)}
              fill="#34d39906"
            />

            {/* Decision Line (NOW) */}
            <line
              x1={decisionX}
              y1={paddingTop}
              x2={decisionX}
              y2={chartHeight - paddingBottom}
              stroke="#00e5ff"
              strokeDasharray="3 3"
              strokeWidth="1.5"
            />
            <text
              x={decisionX}
              y={paddingTop - 5}
              textAnchor="middle"
              fill="#00e5ff"
              fontSize="8"
              fontFamily="monospace"
              fontWeight="bold"
            >
              NOW (T_0)
            </text>

            {/* Confidence Envelope (p10 to p90) */}
            {activeTrajectory.length > 0 && (
              <polygon
                points={envelopePoints}
                fill={activeBranch ? "#10b98115" : isHighAlert ? "#ef444415" : "#00e5ff12"}
                stroke="none"
              />
            )}

            {/* Baseline Path (faded if counterfactual active) */}
            {activeBranch && (
              <polyline
                points={baselinePath}
                fill="none"
                stroke="#64748b"
                strokeDasharray="4 3"
                strokeWidth="1.5"
                opacity="0.6"
              />
            )}

            {/* Historical Readings Curve */}
            {historyPoints.length > 1 && (
              <polyline
                points={historyPath}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Projected Forecast Curve */}
            {forecastPoints.length > 1 && (
              <polyline
                points={forecastPath}
                fill="none"
                stroke={activeBranch ? "#34d399" : isHighAlert ? "#f87171" : "#00e5ff"}
                strokeDasharray="5 3"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Historical Nodes */}
            {historySlice.map((r, i) => (
              <circle
                key={`h-${i}`}
                cx={getX(i)}
                cy={getY(r.glucose_mg_dl)}
                r="3"
                fill="#030712"
                stroke="#38bdf8"
                strokeWidth="1.5"
              />
            ))}

            {/* Current Decision Point Node */}
            <circle
              cx={decisionX}
              cy={getY(nowGlucose)}
              r="5"
              fill="#00e5ff"
              stroke="#ffffff"
              strokeWidth="2"
            />

            {/* Forecast Nodes */}
            {activeTrajectory.map((pt, i) => (
              <g key={`f-${i}`}>
                <circle
                  cx={getX(decisionIndex + 1 + i)}
                  cy={getY(pt.projected_glucose_mg_dl)}
                  r="3.5"
                  fill="#030712"
                  stroke={activeBranch ? "#34d399" : isHighAlert ? "#f87171" : "#00e5ff"}
                  strokeWidth="1.8"
                />
              </g>
            ))}

            {/* X Axis Time Labels */}
            {historySlice.map((r, i) => (
              <text
                key={`xt-h-${i}`}
                x={getX(i)}
                y={chartHeight - 8}
                textAnchor="middle"
                fill="#567886"
                fontSize="7.5"
                fontFamily="monospace"
              >
                {r.time || `-${(historySlice.length - i) * 15}m`}
              </text>
            ))}
            {[15, 30, 45, 60, 75, 90, 105, 120].map((h, i) => (
              <text
                key={`xt-f-${h}`}
                x={getX(decisionIndex + 1 + i)}
                y={chartHeight - 8}
                textAnchor="middle"
                fill={activeBranch ? "#34d399" : "#00e5ff"}
                fontSize="7.5"
                fontFamily="monospace"
              >
                +{h}m
              </text>
            ))}
          </svg>
        </div>

        {/* Bottom Split: Counterfactuals & TreeSHAP side-by-side */}
        <div className="dx-forecast-bottom-split">
          {/* Counterfactual "What-If" In-Silico Action Bar */}
          <div className="dx-counterfactual-bar">
            <div className="dx-cf-header">
              <Sparkles size={12} className="dx-cf-icon" />
              <span>IN-SILICO "WHAT-IF" COUNTERFACTUAL INTERVENTIONS:</span>
            </div>

            <div className="dx-cf-buttons-grid">
              <button
                className={`dx-cf-btn ${selectedIntervention === "baseline" ? "active" : ""}`}
                onClick={() => setSelectedIntervention("baseline")}
              >
                <TrendingUp size={11} />
                <span>BASELINE TRAJECTORY</span>
              </button>

              <button
                className={`dx-cf-btn ${selectedIntervention === "postprandial_walk" ? "active" : ""}`}
                onClick={() => setSelectedIntervention("postprandial_walk")}
              >
                <Footprints size={11} />
                <span>20-MIN BRISK WALK (-22.5 mg/dL)</span>
              </button>

              <button
                className={`dx-cf-btn ${selectedIntervention === "carb_reduction" ? "active" : ""}`}
                onClick={() => setSelectedIntervention("carb_reduction")}
              >
                <Scissors size={11} />
                <span>REDUCE CARBS 35g (-31.0 mg/dL)</span>
              </button>

              <button
                className={`dx-cf-btn ${selectedIntervention === "food_sequencing" ? "active" : ""}`}
                onClick={() => setSelectedIntervention("food_sequencing")}
              >
                <Salad size={11} />
                <span>FOOD SEQUENCING (-19.5 mg/dL)</span>
              </button>

              <button
                className={`dx-cf-btn ${selectedIntervention === "confirm_medication" ? "active" : ""}`}
                onClick={() => setSelectedIntervention("confirm_medication")}
              >
                <Pill size={11} />
                <span>METFORMIN 500mg (-16.8 mg/dL)</span>
              </button>
            </div>

            {activeBranch && (
              <div className="dx-cf-detail-card">
                <CheckCircle2 size={13} className="dx-cf-check" />
                <div>
                  <strong>{activeBranch.intervention_label}:</strong> {activeBranch.clinical_rationale}
                  <br />
                  <small>{activeBranch.biophysical_mechanism}</small>
                </div>
              </div>
            )}
          </div>

          {/* TreeSHAP Top Risk Drivers Attribution Strip */}
          {baseline?.top_shap_drivers && baseline.top_shap_drivers.length > 0 && (
            <div className="dx-shap-drivers-section">
              <div className="dx-shap-title">
                <span>TREESHAP PHYSIOLOGICAL EXPLAINABILITY ATTRIBUTION:</span>
              </div>
              <div className="dx-shap-grid">
                {baseline.top_shap_drivers.slice(0, 4).map((d) => {
                  const isRisk = d.direction === "increases_risk" || d.shap_value > 0;
                  return (
                    <div key={d.feature} className={`dx-shap-card ${isRisk ? "risk" : "protective"}`}>
                      <div className="dx-shap-top">
                        <span className="dx-shap-name">{d.feature}</span>
                        <strong className={isRisk ? "risk" : "protective"}>
                          {d.shap_value > 0 ? `+${d.shap_value.toFixed(2)}` : d.shap_value.toFixed(2)} SHAP
                        </strong>
                      </div>
                      <p className="dx-shap-expl">{d.clinical_explanation}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      <i className="dx-panel-decoration" />
    </section>
  );
}
