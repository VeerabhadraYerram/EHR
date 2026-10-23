import { useState } from "react";
import type { Patient, Reading } from "./types";
import type { KineticTelemetry } from "./kineticEngine";
import { Heart } from "lucide-react";

interface HeartTwinDeepDiveProps {
  patient?: Patient;
  reading?: Reading;
  telemetry: KineticTelemetry;
}

export default function HeartTwinDeepDive({
  patient,
  telemetry,
}: HeartTwinDeepDiveProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const { heart, velocity } = telemetry;

  const isHypertensive =
    patient?.comorbidities?.toLowerCase().includes("hypertension") ||
    patient?.comorbidities?.toLowerCase().includes("htn");

  return (
    <div className="dt-organ-deep-dive dt-heart-deep-dive">
      {/* 1. Underlying Anatomical Atlas with Cardiac Rhythm Pulse */}
      <div
        className="dt-atlas-layer dt-cardiac-rhythm-box"
        style={{ animationDuration: `${heart.pulseDurationSec}s` }}
      >
        {!imgFailed ? (
          <img
            src="/diagnostics/heart-atlas.png"
            alt="Biophysical Heart Atlas"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <svg viewBox="0 0 320 240" className="dt-heart-fallback">
            <g fill="#0f2b3888" stroke="#8adbd2" strokeWidth="1.5">
              <path d="M137 78C119 48 74 66 72 104C44 147 110 202 170 219C209 199 247 169 244 124C243 89 218 64 189 78C191 49 182 24 163 22L143 24L147 51L157 62L155 84Z" />
              <path d="M169 29L180 10L193 18L184 39M151 24L145 5L132 11L138 37M162 22L161 4L174 3L176 26M190 80L215 51L241 51L243 66L224 67L207 89M136 83L113 47L96 53L114 88" />
            </g>
          </svg>
        )}
      </div>

      {/* 2. OPTION 3: Coronary Vascular Network & Endothelial Shear Stress Wave */}
      <svg
        className="dt-biophysical-overlay"
        viewBox="0 0 320 240"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="heart-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Pulsing Aorta Arch */}
        <path
          d="M 160 35 Q 165 15, 185 20 Q 200 30, 195 55"
          fill="none"
          stroke="#ef4444"
          strokeWidth="5"
          opacity="0.85"
        />

        {/* Coronary Arteries (Left Anterior Descending & Right Coronary) */}
        <g
          stroke={heart.stressColor}
          strokeWidth="2.4"
          fill="none"
          filter="url(#heart-glow)"
          strokeLinecap="round"
        >
          {/* LAD branch down anterior interventricular groove */}
          <path
            d="M 165 75 Q 155 110, 168 150 Q 175 180, 172 210"
            className="dt-coronary-pulse"
            style={{ animationDuration: `${heart.pulseDurationSec}s` }}
          />
          {/* Circumflex & Diagonal branches */}
          <path
            d="M 162 95 Q 135 115, 110 130 M 165 125 Q 140 145, 125 165"
            strokeWidth="1.8"
            strokeDasharray="4 2"
          />
          {/* Right Coronary Artery */}
          <path
            d="M 175 78 Q 205 95, 218 125 Q 225 155, 215 185"
            strokeWidth="2"
            className="dt-coronary-pulse"
            style={{ animationDuration: `${heart.pulseDurationSec * 1.1}s` }}
          />
        </g>

        {/* Dynamic Myocardial Systolic Wave Rings */}
        <circle
          cx="165"
          cy="145"
          r="48"
          fill="none"
          stroke={heart.stressColor}
          strokeWidth="1.5"
          strokeDasharray="5 5"
          className="dt-systolic-wave"
          style={{ animationDuration: `${heart.pulseDurationSec}s` }}
        />
      </svg>

      {/* 3. OPTION 3: Deep Dive Cardiovascular Telemetry Dashboard */}
      <div className="dt-organ-telemetry-overlay">
        {/* State Banner */}
        <div
          className={`dt-organ-status-banner ${heart.vascularShearStress > 75 ? "alarm" : ""}`}
          style={{ borderColor: heart.stressColor }}
        >
          <div className="dt-banner-left">
            <Heart size={16} color={heart.stressColor} className="dt-heart-icon-pulse" />
            <div>
              <strong>{heart.cardioStatus}</strong>
              <span>
                {heart.vascularShearStress > 75
                  ? "Elevated glycemic variability driving endothelial nitric oxide uncoupling"
                  : "Laminar coronary perfusion within calibrated hemodynamic limits"}
              </span>
            </div>
          </div>
          <div className="dt-banner-badge" style={{ color: heart.stressColor }}>
            {heart.heartRate} BPM
          </div>
        </div>

        {/* 4 Interactive Cardiovascular Metric Cards */}
        <div className="dt-organ-metric-grid">
          <div className="dt-metric-box">
            <span className="dt-mb-title">SYMPATHETIC CARDIAC RATE</span>
            <div className="dt-mb-val">
              <strong style={{ color: heart.stressColor }}>
                {heart.heartRate}
              </strong>
              <small>BPM</small>
            </div>
            <div className="dt-mb-bar-track">
              <div
                className="dt-mb-bar-fill"
                style={{
                  width: `${Math.min(100, ((heart.heartRate - 50) / 70) * 100)}%`,
                  background: heart.stressColor,
                }}
              />
            </div>
            <span className="dt-mb-sub">Cycle: {heart.pulseDurationSec}s per beat</span>
          </div>

          <div className="dt-metric-box">
            <span className="dt-mb-title">ENDOTHELIAL SHEAR TENSION</span>
            <div className="dt-mb-val">
              <strong style={{ color: heart.stressColor }}>
                {heart.vascularShearStress}%
              </strong>
            </div>
            <div className="dt-mb-bar-track">
              <div
                className="dt-mb-bar-fill"
                style={{
                  width: `${heart.vascularShearStress}%`,
                  background: heart.stressColor,
                }}
              />
            </div>
            <span className="dt-mb-sub">Microvascular Wall Stress</span>
          </div>

          <div className="dt-metric-box">
            <span className="dt-mb-title">GLYCEMIC VOLATILITY FLUX</span>
            <div className="dt-mb-val">
              <strong style={{ color: Math.abs(velocity) > 30 ? "#ef4444" : "#00e5ff" }}>
                {velocity > 0 ? `+${velocity}` : velocity}
              </strong>
              <small>mg/dL/h</small>
            </div>
            <div className="dt-mb-sub" style={{ marginTop: "12px" }}>
              Acute Rate: <strong>{Math.abs(velocity) > 25 ? "High Kinetic Flux" : "Steady Perfusion"}</strong>
            </div>
          </div>

          <div className="dt-metric-box">
            <span className="dt-mb-title">VASCULAR COMORBIDITY PROFILE</span>
            <div className="dt-mb-val">
              <strong style={{ fontSize: "12px", color: "#f8fafc" }}>
                {isHypertensive ? "Stage 1 HTN (Active)" : "Normotensive Baseline"}
              </strong>
            </div>
            <div className="dt-mb-sub" style={{ marginTop: "12px" }}>
              LDL: <strong>{patient?.ldl_mg_dl || 105} mg/dL</strong> · TG: <strong>{patient?.triglycerides_mg_dl || 140} mg/dL</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
