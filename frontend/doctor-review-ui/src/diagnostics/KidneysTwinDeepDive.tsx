import { useState } from "react";
import type { Patient, Reading } from "./types";
import type { KineticTelemetry } from "./kineticEngine";
import { AlertOctagon, CheckCircle2 } from "lucide-react";

interface KidneysTwinDeepDiveProps {
  patient?: Patient;
  reading?: Reading;
  telemetry: KineticTelemetry;
}

export default function KidneysTwinDeepDive({
  patient: _patient,
  telemetry,
}: KidneysTwinDeepDiveProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const { kidneys, glucose } = telemetry;

  return (
    <div className="dt-organ-deep-dive dt-kidneys-deep-dive">
      {/* 1. Underlying Anatomical Atlas */}
      <div className="dt-atlas-layer">
        {!imgFailed ? (
          <img
            src="/diagnostics/kidneys-atlas.png"
            alt="Biophysical Kidneys Atlas"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <svg viewBox="0 0 320 240" className="dt-kidneys-fallback">
            <path
              d="M89 37C48 29 29 75 35 119C40 165 76 185 104 169C127 155 121 133 105 124C87 114 87 96 102 84C121 69 114 43 89 37ZM231 37C272 29 291 75 285 119C280 165 244 185 216 169C193 155 199 133 215 124C233 114 233 96 218 84C199 69 206 43 231 37Z"
              fill="#0f2b3888"
              stroke="#8adbd2"
              strokeWidth="1.5"
            />
          </svg>
        )}
      </div>

      {/* 2. OPTION 3: Glomerular Filtration Beam & SGLT-2 Reabsorption / Glycosuria Overlay */}
      <svg
        className="dt-biophysical-overlay"
        viewBox="0 0 400 300"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="kidney-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <linearGradient id="filtration-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.8" />
            <stop offset="100%" stopColor={kidneys.sglt2Color} stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* Central Aorta & Vena Cava Vessels */}
        <path d="M 190 20 L 190 280" stroke="#ef4444" strokeWidth="6" opacity="0.4" />
        <path d="M 210 20 L 210 280" stroke="#3b82f6" strokeWidth="6" opacity="0.4" />

        {/* Bilateral Renal Arteries (Glomerular Influx Beam) */}
        <g stroke="url(#filtration-grad)" strokeWidth="3" fill="none" filter="url(#kidney-glow)">
          {/* Left Renal Inflow */}
          <path
            d="M 190 125 Q 150 120, 115 135"
            className="dt-filtration-stream"
            style={{ animationDuration: `${kidneys.filtrationSpeedSec}s` }}
          />
          {/* Right Renal Inflow */}
          <path
            d="M 190 135 Q 240 130, 285 145"
            className="dt-filtration-stream"
            style={{ animationDuration: `${kidneys.filtrationSpeedSec}s` }}
          />
        </g>

        {/* Cortex Glomerular Filtration Clusters */}
        {[
          { cx: 85, cy: 95 },
          { cx: 65, cy: 135 },
          { cx: 80, cy: 175 },
          { cx: 315, cy: 105 },
          { cx: 335, cy: 145 },
          { cx: 320, cy: 185 },
        ].map((pt, i) => (
          <g key={i}>
            <circle
              cx={pt.cx}
              cy={pt.cy}
              r="10"
              fill="none"
              stroke={kidneys.sglt2Color}
              strokeWidth="1.5"
              strokeDasharray="3 3"
              className="dt-glomerulus-pulse"
              style={{ animationDuration: `${kidneys.filtrationSpeedSec * 1.2}s` }}
            />
            <circle cx={pt.cx} cy={pt.cy} r="4" fill={kidneys.sglt2Color} opacity="0.8" />
          </g>
        ))}

        {/* SGLT-2 Tubular Dynamics: Reabsorption vs Glycosuria Spilling */}
        {kidneys.isSaturated ? (
          /* GLYCOSURIA ACTIVE: Particles spilling down bilateral ureters */
          <g stroke="#ef4444" strokeWidth="3.2" fill="none" strokeDasharray="5 5" className="dt-glycosuria-spill">
            <path d="M 115 155 Q 135 180, 150 280" />
            <path d="M 285 165 Q 265 190, 250 280" />
          </g>
        ) : (
          /* 100% REABSORPTION: Healthy cyan loop back into renal vein */
          <g stroke="#00e5ff" strokeWidth="2.5" fill="none" strokeDasharray="4 3" className="dt-reabsorption-loop">
            <path d="M 115 150 Q 155 165, 210 145" />
            <path d="M 285 160 Q 245 175, 210 155" />
          </g>
        )}
      </svg>

      {/* 3. OPTION 3: Deep Dive Biophysical Telemetry Dashboard */}
      <div className="dt-organ-telemetry-overlay">
        {/* State Banner */}
        <div
          className={`dt-organ-status-banner ${kidneys.isSaturated ? "alarm" : ""}`}
          style={{ borderColor: kidneys.sglt2Color }}
        >
          <div className="dt-banner-left">
            {kidneys.isSaturated ? (
              <AlertOctagon size={16} color="#ef4444" />
            ) : (
              <CheckCircle2 size={16} color="#00e5ff" />
            )}
            <div>
              <strong>{kidneys.sglt2Status}</strong>
              <span>
                {kidneys.isSaturated
                  ? `Interstitial glucose ${Math.round(glucose)} mg/dL exceeds 180 mg/dL renal transporter threshold`
                  : `Glycemia below 180 mg/dL threshold; 100% proximal tubule reabsorption intact`}
              </span>
            </div>
          </div>
          <div className="dt-banner-badge" style={{ color: kidneys.sglt2Color }}>
            {kidneys.isSaturated ? `${kidneys.glycosuriaRate} mg/min SPILL` : "ZERO GLYCOSURIA"}
          </div>
        </div>

        {/* 4 Interactive Nephrology Metric Cards */}
        <div className="dt-organ-metric-grid">
          <div className="dt-metric-box">
            <span className="dt-mb-title">RENAL CLEARANCE (eGFR)</span>
            <div className="dt-mb-val">
              <strong style={{ color: kidneys.egfr < 60 ? "#f59e0b" : "#34d399" }}>
                {kidneys.egfr}
              </strong>
              <small>mL/min/1.73m²</small>
            </div>
            <div className="dt-mb-bar-track">
              <div
                className="dt-mb-bar-fill"
                style={{
                  width: `${Math.min(100, (kidneys.egfr / 120) * 100)}%`,
                  background: kidneys.egfr < 60 ? "#f59e0b" : "#34d399",
                }}
              />
            </div>
            <span className="dt-mb-sub">{kidneys.ckdStage}</span>
          </div>

          <div className="dt-metric-box">
            <span className="dt-mb-title">SERUM CREATININE</span>
            <div className="dt-mb-val">
              <strong style={{ color: kidneys.creatinine > 1.2 ? "#ef4444" : "#f8fafc" }}>
                {kidneys.creatinine}
              </strong>
              <small>mg/dL</small>
            </div>
            <div className="dt-mb-bar-track">
              <div
                className="dt-mb-bar-fill"
                style={{
                  width: `${Math.min(100, (kidneys.creatinine / 2.0) * 100)}%`,
                  background: kidneys.creatinine > 1.2 ? "#ef4444" : "#00e5ff",
                }}
              />
            </div>
            <span className="dt-mb-sub">Reference: 0.60 – 1.20 mg/dL</span>
          </div>

          <div className="dt-metric-box">
            <span className="dt-mb-title">SGLT-2 CAPACITY UTILIZATION</span>
            <div className="dt-mb-val">
              <strong style={{ color: kidneys.sglt2Color }}>
                {Math.min(150, Math.round((glucose / 180) * 100))}%
              </strong>
            </div>
            <div className="dt-mb-bar-track">
              <div
                className="dt-mb-bar-fill"
                style={{
                  width: `${Math.min(100, (glucose / 180) * 100)}%`,
                  background: kidneys.sglt2Color,
                }}
              />
            </div>
            <span className="dt-mb-sub">Threshold: 180 mg/dL ({kidneys.isSaturated ? "Saturated" : "Sub-Threshold"})</span>
          </div>

          <div className="dt-metric-box">
            <span className="dt-mb-title">ACTIVE GLYCOSURIA RATE</span>
            <div className="dt-mb-val">
              <strong style={{ color: kidneys.isSaturated ? "#ef4444" : "#34d399" }}>
                {kidneys.glycosuriaRate}
              </strong>
              <small>mg/min</small>
            </div>
            <div className="dt-mb-sub" style={{ marginTop: "12px" }}>
              Spilling to Bladder: <strong>{kidneys.isSaturated ? `${Math.round(kidneys.glycosuriaRate * 60 / 1000 * 10) / 10} g/hr` : "0.0 g/hr"}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
