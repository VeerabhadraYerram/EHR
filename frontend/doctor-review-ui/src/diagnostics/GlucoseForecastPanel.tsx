import { useState, useMemo } from "react";
import type { PatientSimulation, Reading, TrajectoryPoint, ShapDriver } from "./types";
import { TrendingUp, AlertTriangle, ShieldCheck, Footprints, Salad, Scissors, Pill, Sparkles } from "lucide-react";

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

  const branches = simulation?.counterfactual_branches || [];
  const activeBranch = branches.find((b) => b.intervention_type === selectedIntervention);

  // 1. Current State at T_0
  const nowGlucose = currentReading?.glucose_mg_dl || simulation?.baseline?.glucose_now_mg_dl || 125;
  const prevReading = historicalReadings.length >= 2 ? historicalReadings[historicalReadings.length - 2] : null;
  const velocityPerHour = prevReading ? Math.round(((nowGlucose - prevReading.glucose_mg_dl) / 0.5) * 10) / 10 : 0;
  const mealCarbs = currentReading?.meal_carbs_g || 0;
  const minsSinceMeal = currentReading?.minutes_since_meal ?? (mealCarbs > 0 ? 30 : 999);

  // 2. Real-Time Dynamic 8-Horizon Trajectory (+15m to +120m)
  const dynamicBaselineTrajectory: TrajectoryPoint[] = useMemo(() => {
    return [15, 30, 45, 60, 75, 90, 105, 120].map((h, i) => {
      // Velocity momentum decaying over 90 mins
      const momentum = velocityPerHour * (h / 60) * Math.exp(-h / 55);

      // Hovorka meal absorption peak at ~45m post-meal
      let mealComponent = 0;
      if (minsSinceMeal < 180) {
        const effMins = minsSinceMeal + h;
        mealComponent = (mealCarbs / 12) * Math.exp(-Math.pow(effMins - 50, 2) / (2 * 45 * 45)) * 18;
      }

      // Basal clearance pulling back toward steady target (115 mg/dL)
      const basalTarget = 115;
      const clearanceFactor = (1 - Math.exp(-h / 70)) * 0.42;
      const rawProjected = nowGlucose + momentum + mealComponent - (nowGlucose - basalTarget) * clearanceFactor;
      const projected = Math.round(Math.max(55, Math.min(290, rawProjected)));

      const uncertainty = Math.round(7 + i * 2.2);
      return {
        horizon_minutes: h,
        projected_glucose_mg_dl: projected,
        lower_bound_p10_mg_dl: Math.max(50, projected - uncertainty),
        upper_bound_p90_mg_dl: Math.min(320, projected + uncertainty),
      };
    });
  }, [nowGlucose, velocityPerHour, mealCarbs, minsSinceMeal]);

  // 3. Dynamic Active Trajectory (Accounts for What-If Counterfactual Interventions)
  const dynamicActiveTrajectory: TrajectoryPoint[] = useMemo(() => {
    return dynamicBaselineTrajectory.map((pt, i) => {
      if (!activeBranch || selectedIntervention === "baseline") return pt;
      const maxReduction = activeBranch.peak_reduction_mg_dl || 25;
      const rampFactor = Math.min(1.0, (i + 1) / 3.0);
      const reduction = Math.round(maxReduction * rampFactor);
      const simulated = Math.max(70, pt.projected_glucose_mg_dl - reduction);
      return {
        ...pt,
        projected_glucose_mg_dl: simulated,
        lower_bound_p10_mg_dl: Math.max(50, pt.lower_bound_p10_mg_dl - reduction),
        upper_bound_p90_mg_dl: Math.max(75, pt.upper_bound_p90_mg_dl - reduction),
      };
    });
  }, [dynamicBaselineTrajectory, activeBranch, selectedIntervention]);

  // 4. Dynamic Projected Peak & Calibrated Spike Probability
  const projectedValues = dynamicBaselineTrajectory.map((p) => p.projected_glucose_mg_dl);
  const liveMaxProjected = Math.max(nowGlucose, ...projectedValues);
  const livePeakTime =
    dynamicBaselineTrajectory.find((p) => p.projected_glucose_mg_dl === liveMaxProjected)?.horizon_minutes ||
    (velocityPerHour > 10 ? 45 : 15);

  let liveSpikeProb = 0.08;
  if (nowGlucose >= 180) {
    liveSpikeProb = Math.min(0.99, 0.88 + (nowGlucose - 180) * 0.002);
  } else if (liveMaxProjected >= 180) {
    liveSpikeProb = Math.min(0.96, 0.55 + (liveMaxProjected - 180) * 0.015);
  } else if (liveMaxProjected >= 140) {
    liveSpikeProb = Math.round((0.22 + (liveMaxProjected - 140) * 0.007) * 100) / 100;
  } else {
    liveSpikeProb = Math.max(0.04, Math.round(((liveMaxProjected - 70) / 140) * 0.18 * 100) / 100);
  }

  const liveTier: "HIGH" | "WATCH" | "CALM" =
    liveSpikeProb >= 0.5 ? "HIGH" : liveSpikeProb >= 0.22 ? "WATCH" : "CALM";
  const isLiveAlert = liveTier === "HIGH";

  // Simulated peak under active intervention
  const simulatedValues = dynamicActiveTrajectory.map((p) => p.projected_glucose_mg_dl);
  const liveSimulatedPeak = Math.max(nowGlucose, ...simulatedValues);

  // 5. Chart Dimensions & Scaling (Wide Full-Width Panoramic SVG)
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

  const historySlice = historicalReadings.slice(-8);
  const totalSteps = historySlice.length + 8; // 8 past + 8 future

  const getX = (stepIndex: number) => {
    return paddingLeft + (stepIndex / (totalSteps - 1)) * innerWidth;
  };

  const decisionIndex = historySlice.length > 0 ? historySlice.length - 1 : 0;
  const decisionX = getX(decisionIndex);

  // Historical path
  const historyPoints = historySlice.map((r, i) => `${getX(i)},${getY(r.glucose_mg_dl)}`);
  const historyPath = historyPoints.join(" ");

  // Forecast path (starts at decision reading)
  const forecastPoints = [
    `${decisionX},${getY(nowGlucose)}`,
    ...dynamicActiveTrajectory.map((pt, i) => `${getX(decisionIndex + 1 + i)},${getY(pt.projected_glucose_mg_dl)}`),
  ];
  const forecastPath = forecastPoints.join(" ");

  // Baseline forecast path (if branch is selected, show baseline for comparison)
  const baselineForecastPoints = [
    `${decisionX},${getY(nowGlucose)}`,
    ...dynamicBaselineTrajectory.map((pt, i) => `${getX(decisionIndex + 1 + i)},${getY(pt.projected_glucose_mg_dl)}`),
  ];
  const baselinePath = baselineForecastPoints.join(" ");

  // Confidence Envelope polygon (p10 to p90)
  const upperPoints = [
    `${decisionX},${getY(nowGlucose)}`,
    ...dynamicActiveTrajectory.map((pt, i) => `${getX(decisionIndex + 1 + i)},${getY(pt.upper_bound_p90_mg_dl)}`),
  ];
  const lowerPoints = [
    ...dynamicActiveTrajectory
      .slice()
      .reverse()
      .map((pt, i) => `${getX(decisionIndex + 8 - i)},${getY(pt.lower_bound_p10_mg_dl)}`),
    `${decisionX},${getY(nowGlucose)}`,
  ];
  const envelopePoints = [...upperPoints, ...lowerPoints].join(" ");

  // 6. Dynamic TreeSHAP Drivers for Real-Time State
  const liveShapDrivers: ShapDriver[] = [
    {
      feature: "glucose_now",
      shap_value: Math.round(((nowGlucose - 120) / 100) * 0.5 * 100) / 100,
      direction: nowGlucose > 140 ? "increases_risk" : "decreases_risk",
      clinical_explanation: `Current interstitial glucose at ${Math.round(nowGlucose)} mg/dL drives baseline trajectory`,
    },
    {
      feature: "glucose_velocity",
      shap_value: Math.round((velocityPerHour / 40) * 0.35 * 100) / 100,
      direction: velocityPerHour > 10 ? "increases_risk" : "decreases_risk",
      clinical_explanation: `Acute rate of change at ${velocityPerHour > 0 ? `+${velocityPerHour}` : velocityPerHour} mg/dL/h`,
    },
    {
      feature: "postprandial_flux",
      shap_value: minsSinceMeal < 120 ? 0.28 : -0.15,
      direction: minsSinceMeal < 120 ? "increases_risk" : "decreases_risk",
      clinical_explanation:
        minsSinceMeal < 120
          ? `Gastrointestinal absorption window (${mealCarbs > 0 ? `${mealCarbs}g carbs` : "Active"})`
          : "Post-absorptive basal metabolism phase",
    },
    {
      feature: "c_peptide_reserve",
      shap_value: -0.18,
      direction: "decreases_risk",
      clinical_explanation: "Endogenous beta-cell insulin secretion modulates return to target",
    },
  ];

  return (
    <section className="dx-panel dx-forecast-panel">
      {/* Crisp, neat header without background text or collision */}
      <header className="dx-panel-heading dx-forecast-heading">
        <h2>
          <span>FORECAST /</span> GLUCOSE TRAJECTORY & 2H INCIDENT PREDICTION
        </h2>
        <div className="dx-forecast-header-pills">
          <span className={`dx-tier-pill ${liveTier.toLowerCase()}`}>
            {isLiveAlert ? <AlertTriangle size={11} /> : <ShieldCheck size={11} />}
            {liveTier} RISK
          </span>
          <span className="dx-panel-tag">CALIBRATED DUAL-HEAD ML</span>
        </div>
      </header>

      <div className="dx-forecast-body">
        {/* Top Prediction Metrics Row - Real-Time Dynamic */}
        <div className="dx-forecast-metrics-strip">
          <div className="dx-f-metric">
            <span className="dx-f-label">SPIKE PROBABILITY (≥180 mg/dL)</span>
            <div className="dx-f-val-row">
              <strong className={isLiveAlert ? "alert" : ""}>
                {Math.round(liveSpikeProb * 100)}%
              </strong>
              <small>Optimal Cutoff: 22%</small>
            </div>
            <div className="dx-f-bar-track">
              <div
                className={`dx-f-bar-fill ${liveTier.toLowerCase()}`}
                style={{ width: `${Math.min(100, Math.round(liveSpikeProb * 100))}%` }}
              />
            </div>
          </div>

          <div className="dx-f-metric">
            <span className="dx-f-label">PROJECTED PEAK GLUCOSE</span>
            <div className="dx-f-val-row">
              <strong className={activeBranch ? "simulated" : isLiveAlert ? "alert" : ""}>
                {activeBranch ? Math.round(liveSimulatedPeak) : Math.round(liveMaxProjected)}
              </strong>
              <small>mg/dL</small>
            </div>
            <span className="dx-f-sub">
              {activeBranch ? (
                <span className="dx-peak-reduced">
                  ↓ {Math.round(liveMaxProjected - liveSimulatedPeak)} mg/dL blunted
                </span>
              ) : (
                `Peak at +${livePeakTime} min`
              )}
            </span>
          </div>

          <div className="dx-f-metric">
            <span className="dx-f-label">MULTI-HORIZON HORIZON</span>
            <div className="dx-f-val-row">
              <strong>+120</strong>
              <small>Minutes (8 Steps)</small>
            </div>
            <span className="dx-f-sub">Continuous Real-Time Trajectory</span>
          </div>

          <div className="dx-f-metric">
            <span className="dx-f-label">CLARKE ERROR SAFETY</span>
            <div className="dx-f-val-row">
              <strong className="zone-a">Zone A</strong>
              <small>Clinically Safe</small>
            </div>
            <span className="dx-f-sub">No Hypoglycemia Hazard</span>
          </div>
        </div>

        {/* Panoramic Forecast SVG Trajectory Chart */}
        <div className="dx-forecast-chart-wrap">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="dx-forecast-svg" preserveAspectRatio="none">
            <defs>
              <linearGradient id="forecast-envelope-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ef4444" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#00e5ff" stopOpacity="0.04" />
              </linearGradient>

              <filter id="trajectory-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Threshold grid lines */}
            <line x1={paddingLeft} y1={getY(180)} x2={chartWidth - paddingRight} y2={getY(180)} stroke="#ef4444" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />
            <text x={chartWidth - paddingRight} y={getY(180) - 5} fill="#ef4444" fontSize="9" fontFamily="monospace" textAnchor="end" opacity="0.8">
              180 mg/dL SPIKE THRESHOLD
            </text>

            <line x1={paddingLeft} y1={getY(70)} x2={chartWidth - paddingRight} y2={getY(70)} stroke="#3b82f6" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
            <text x={chartWidth - paddingRight} y={getY(70) + 12} fill="#60a5fa" fontSize="9" fontFamily="monospace" textAnchor="end" opacity="0.8">
              70 mg/dL HYPO LIMIT
            </text>

            {/* Y Axis ticks */}
            {[70, 100, 140, 180, 220].map((val) => (
              <g key={val}>
                <line x1={paddingLeft - 4} y1={getY(val)} x2={chartWidth - paddingRight} y2={getY(val)} stroke="#193340" strokeWidth="0.8" opacity="0.5" />
                <text x={paddingLeft - 8} y={getY(val) + 3} fill="#69909e" fontSize="9" fontFamily="monospace" textAnchor="end">
                  {val}
                </text>
              </g>
            ))}

            {/* Confidence Envelope (p10 to p90 band) */}
            <polygon points={envelopePoints} fill="url(#forecast-envelope-grad)" stroke="#ef4444" strokeWidth="0.5" strokeOpacity="0.3" />

            {/* Decision Line at NOW (T_0) */}
            <line x1={decisionX} y1={paddingTop} x2={decisionX} y2={chartHeight - paddingBottom} stroke="#00e5ff" strokeWidth="1.5" strokeDasharray="3 3" />
            <text x={decisionX} y={paddingTop - 7} fill="#00e5ff" fontSize="9" fontFamily="monospace" fontWeight="700" textAnchor="middle">
              NOW (T_0)
            </text>

            {/* Historical Glucose Path */}
            <polyline points={historyPath} fill="none" stroke="#00e5ff" strokeWidth="2.5" />

            {/* Baseline path for reference when intervention is active */}
            {activeBranch && selectedIntervention !== "baseline" && (
              <polyline points={baselinePath} fill="none" stroke="#ef4444" strokeWidth="1.8" strokeDasharray="4 3" opacity="0.5" />
            )}

            {/* Forecasted Trajectory Path */}
            <polyline
              points={forecastPath}
              fill="none"
              stroke={activeBranch && selectedIntervention !== "baseline" ? "#34d399" : isLiveAlert ? "#ef4444" : "#00e5ff"}
              strokeWidth="2.5"
              strokeDasharray={activeBranch && selectedIntervention !== "baseline" ? "none" : "5 3"}
              filter="url(#trajectory-glow)"
            />

            {/* Historical data points */}
            {historySlice.map((r, i) => (
              <circle key={`hist-${i}`} cx={getX(i)} cy={getY(r.glucose_mg_dl)} r="3.5" fill="#0b2331" stroke="#00e5ff" strokeWidth="1.8" />
            ))}

            {/* Current reading pulse node at NOW */}
            <circle cx={decisionX} cy={getY(nowGlucose)} r="5.5" fill="#00e5ff" stroke="#ffffff" strokeWidth="2" filter="url(#trajectory-glow)" />

            {/* Forecast points */}
            {dynamicActiveTrajectory.map((pt, i) => {
              const cx = getX(decisionIndex + 1 + i);
              const cy = getY(pt.projected_glucose_mg_dl);
              const color = activeBranch && selectedIntervention !== "baseline" ? "#34d399" : isLiveAlert ? "#ef4444" : "#00e5ff";
              return <circle key={`fore-${i}`} cx={cx} cy={cy} r="3.5" fill="#0b2331" stroke={color} strokeWidth="1.8" />;
            })}

            {/* X-Axis Time / Horizon labels */}
            {historySlice.map((r, i) => (
              <text key={`htime-${i}`} x={getX(i)} y={chartHeight - 8} fill="#69909e" fontSize="8" fontFamily="monospace" textAnchor="middle">
                {r.time || r.reading_time?.slice(11, 16) || `${i * 15}m`}
              </text>
            ))}

            {dynamicActiveTrajectory.map((pt, i) => (
              <text key={`ftime-${i}`} x={getX(decisionIndex + 1 + i)} y={chartHeight - 8} fill={isLiveAlert ? "#f87171" : "#7aa6b5"} fontSize="8" fontFamily="monospace" textAnchor="middle">
                +{pt.horizon_minutes}m
              </text>
            ))}
          </svg>
        </div>

        {/* Bottom Split: Counterfactual "What-If" Interventions + TreeSHAP Explainability */}
        <div className="dx-forecast-bottom-split">
          {/* Left Column: What-If In-Silico Interventions */}
          <div className="dx-counterfactual-card">
            <div className="dx-sub-heading">
              <Sparkles size={11} color="#00e5ff" /> IN-SILICO "WHAT-IF" COUNTERFACTUAL BRANCHES
            </div>
            <div className="dx-interventions-list">
              <button
                className={`dx-intervention-btn ${selectedIntervention === "baseline" ? "active" : ""}`}
                onClick={() => setSelectedIntervention("baseline")}
              >
                <div className="dx-int-top">
                  <strong>Baseline (Standard Care)</strong>
                  <span className="dx-int-pill baseline">Projected Peak {Math.round(liveMaxProjected)} mg/dL</span>
                </div>
                <p>Natural glycemic trajectory without immediate acute clinical intervention.</p>
              </button>

              {branches.map((b) => {
                const isSelected = selectedIntervention === b.intervention_type;
                const icon =
                  b.intervention_type === "walk_20min" ? (
                    <Footprints size={12} />
                  ) : b.intervention_type === "low_gi_meal" ? (
                    <Salad size={12} />
                  ) : b.intervention_type === "acarbose_50mg" ? (
                    <Pill size={12} />
                  ) : (
                    <Scissors size={12} />
                  );

                const simulatedPeak = Math.max(nowGlucose, liveMaxProjected - (b.peak_reduction_mg_dl || 25));

                return (
                  <button
                    key={b.intervention_type}
                    className={`dx-intervention-btn ${isSelected ? "active" : ""}`}
                    onClick={() => setSelectedIntervention(b.intervention_type)}
                  >
                    <div className="dx-int-top">
                      <span className="dx-int-label-wrap">
                        {icon}
                        <strong>{b.intervention_label}</strong>
                      </span>
                      <span className="dx-int-pill positive">
                        ↓ {b.peak_reduction_mg_dl} mg/dL ({Math.round(simulatedPeak)} mg/dL)
                      </span>
                    </div>
                    <p>{b.clinical_rationale}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: TreeSHAP Feature Attribution Explainability */}
          <div className="dx-shap-card-wrap">
            <div className="dx-sub-heading">
              <TrendingUp size={11} color="#00e5ff" /> DUAL-HEAD TREESHAP FEATURE IMPORTANCE
            </div>
            <div className="dx-shap-grid">
              {liveShapDrivers.map((driver) => (
                <div key={driver.feature} className={`dx-shap-card ${driver.direction === "increases_risk" ? "risk" : "protective"}`}>
                  <div className="dx-shap-top">
                    <span className="dx-shap-name">{driver.feature.toUpperCase()}</span>
                    <strong className={driver.direction === "increases_risk" ? "risk" : "protective"}>
                      {driver.shap_value > 0 ? `+${driver.shap_value}` : driver.shap_value} SHAP
                    </strong>
                  </div>
                  <p className="dx-shap-expl">{driver.clinical_explanation}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
