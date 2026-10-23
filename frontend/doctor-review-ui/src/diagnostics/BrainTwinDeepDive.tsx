import { useState } from "react";
import type { Patient, Reading } from "./types";
import type { KineticTelemetry } from "./kineticEngine";
import { BrainMap } from "./MedicalVisuals";
import { AlertTriangle, Sun, Zap } from "lucide-react";

interface BrainTwinDeepDiveProps {
  patient?: Patient;
  reading?: Reading;
  telemetry: KineticTelemetry;
}

export default function BrainTwinDeepDive({
  patient: _patient,
  telemetry,
}: BrainTwinDeepDiveProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const { brain, glucose, velocity } = telemetry;

  return (
    <div className="dt-organ-deep-dive dt-brain-deep-dive">
      {/* 1. Underlying Anatomical Atlas */}
      <div className="dt-atlas-layer">
        {!imgFailed ? (
          <img
            src="/diagnostics/brain.png"
            alt="Biophysical Brain Atlas"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <BrainMap />
        )}
      </div>

      {/* 2. OPTION 3: Hypothalamic Autonomic Sensing Ripple & Cortical Wave Overlay */}
      <svg
        className="dt-biophysical-overlay"
        viewBox="0 0 320 240"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="brain-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Cortical Hemispheric Outline & Synaptic Tracks */}
        <g stroke={brain.brainColor} strokeWidth="1.2" opacity="0.5" fill="none">
          <path d="M 90 90 Q 75 140, 120 180 Q 180 200, 240 170 Q 260 120, 230 70 Q 180 40, 120 50 Z" />
          <path d="M 120 70 Q 150 90, 180 70 M 110 110 Q 160 130, 210 110 M 130 150 Q 170 165, 210 150" strokeDasharray="3 3" />
        </g>

        {/* Hypothalamus Metabolic Command Center (Ventromedial Glucose Sensor) */}
        <g transform="translate(160, 125)">
          {/* Concentric Autonomic Sensing Ripples */}
          <circle
            cx="0"
            cy="0"
            r="16"
            fill="none"
            stroke={brain.brainColor}
            strokeWidth="1.8"
            className="dt-neural-ripple r1"
          />
          <circle
            cx="0"
            cy="0"
            r="32"
            fill="none"
            stroke={brain.brainColor}
            strokeWidth="1.4"
            className="dt-neural-ripple r2"
          />
          <circle
            cx="0"
            cy="0"
            r="52"
            fill="none"
            stroke={brain.brainColor}
            strokeWidth="1"
            strokeDasharray="4 4"
            className="dt-neural-ripple r3"
          />
          {/* Hypothalamic Core Node */}
          <circle cx="0" cy="0" r="7" fill={brain.brainColor} filter="url(#brain-glow)" />
          <circle cx="0" cy="0" r="3" fill="#ffffff" />
        </g>

        {/* Autonomic Brainstem Vagal Projection Beam */}
        <path
          d="M 160 135 L 160 215"
          stroke={brain.brainColor}
          strokeWidth="2.5"
          strokeDasharray="4 3"
          className="dt-vagal-projection"
        />
      </svg>

      {/* 3. OPTION 3: Deep Dive Neurological Telemetry Dashboard */}
      <div className="dt-organ-telemetry-overlay">
        {/* State Banner */}
        <div
          className={`dt-organ-status-banner ${brain.hypoAlarm || brain.hyperAlarm ? "alarm" : ""}`}
          style={{ borderColor: brain.brainColor }}
        >
          <div className="dt-banner-left">
            {brain.dawnPhenomenon ? (
              <Sun size={16} color="#f59e0b" />
            ) : brain.hypoAlarm ? (
              <AlertTriangle size={16} color="#3b82f6" />
            ) : (
              <Zap size={16} color={brain.brainColor} />
            )}
            <div>
              <strong>{brain.brainStatus}</strong>
              <span>
                {brain.hypoAlarm
                  ? "Glucose below 70 mg/dL: Urgent autonomic counter-regulatory adrenaline surge active"
                  : brain.dawnPhenomenon
                  ? "Circadian dawn phenomenon: Morning cortisol & GH surge stimulating hepatic glucose output"
                  : brain.hyperAlarm
                  ? "Severe hyperglycemia: Postprandial neuro-vascular sluggishness and osmotic strain"
                  : "Central glucose sensing intact; homeostatic autonomic equilibrium"}
              </span>
            </div>
          </div>
          <div className="dt-banner-badge" style={{ color: brain.brainColor }}>
            {Math.round(glucose)} mg/dL
          </div>
        </div>

        {/* 4 Interactive Neuro-Metabolic Metric Cards */}
        <div className="dt-organ-metric-grid">
          <div className="dt-metric-box">
            <span className="dt-mb-title">INTERSTITIAL SENSING</span>
            <div className="dt-mb-val">
              <strong style={{ color: brain.brainColor }}>
                {brain.interstitialSensor}
              </strong>
              <small>mg/dL</small>
            </div>
            <div className="dt-mb-bar-track">
              <div
                className="dt-mb-bar-fill"
                style={{
                  width: `${Math.min(100, (glucose / 240) * 100)}%`,
                  background: brain.brainColor,
                }}
              />
            </div>
            <span className="dt-mb-sub">Target TIR: 70 – 180 mg/dL</span>
          </div>

          <div className="dt-metric-box">
            <span className="dt-mb-title">AUTONOMIC TONE</span>
            <div className="dt-mb-val">
              <strong style={{ fontSize: "13px", color: "#f8fafc" }}>
                {velocity > 25 || brain.hypoAlarm ? "Sympathetic Drive" : "Parasympathetic"}
              </strong>
            </div>
            <div className="dt-mb-bar-track">
              <div
                className="dt-mb-bar-fill"
                style={{
                  width: `${Math.min(100, Math.max(20, Math.abs(velocity) * 2 + 35))}%`,
                  background: brain.brainColor,
                }}
              />
            </div>
            <span className="dt-mb-sub">Central Neural Sympathetic Index</span>
          </div>

          <div className="dt-metric-box">
            <span className="dt-mb-title">CIRCADIAN DAWN DRIVE</span>
            <div className="dt-mb-val">
              <strong style={{ color: brain.dawnPhenomenon ? "#f59e0b" : "#34d399" }}>
                {brain.dawnPhenomenon ? "ACTIVE SURGE" : "QUIESCENT"}
              </strong>
            </div>
            <div className="dt-mb-sub" style={{ marginTop: "12px" }}>
              Diurnal Phase: <strong>{telemetry.timeLabel}</strong>
            </div>
          </div>

          <div className="dt-metric-box">
            <span className="dt-mb-title">NEUROGLYCOPENIA RISK</span>
            <div className="dt-mb-val">
              <strong style={{ color: brain.hypoAlarm ? "#3b82f6" : "#34d399" }}>
                {brain.hypoAlarm ? "HIGH RISK (<70)" : "MINIMAL / SAFE"}
              </strong>
            </div>
            <div className="dt-mb-sub" style={{ marginTop: "12px" }}>
              Cerebral Supply: <strong>{glucose >= 70 ? "Preserved Glucose Flux" : "Hypoglycemic Alert"}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
