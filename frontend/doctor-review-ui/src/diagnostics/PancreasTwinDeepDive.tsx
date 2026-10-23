import { useState } from "react";
import type { Patient, Reading } from "./types";
import type { KineticTelemetry } from "./kineticEngine";
import { AlertTriangle, Zap } from "lucide-react";

interface PancreasTwinDeepDiveProps {
  patient?: Patient;
  reading?: Reading;
  telemetry: KineticTelemetry;
}

export default function PancreasTwinDeepDive({
  patient: _patient,
  telemetry,
}: PancreasTwinDeepDiveProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const { pancreas, velocity } = telemetry;

  // Islet pulse frequency scales with demand
  const isletPulseDuration = pancreas.isExhaustion ? "0.7s" : pancreas.betaDemandIndex > 130 ? "1.1s" : "2.2s";

  return (
    <div className="dt-organ-deep-dive dt-pancreas-deep-dive">
      {/* 1. Underlying Anatomical Atlas */}
      <div className="dt-atlas-layer">
        {!imgFailed ? (
          <img
            src="/diagnostics/pancreas-atlas.png"
            alt="Biophysical Pancreas Atlas"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <svg viewBox="0 0 420 180" className="dt-pancreas-fallback">
            <path
              d="M69 62C42 46 28 65 32 93C27 114 42 137 62 132C79 149 99 135 104 116C131 115 148 109 165 101C197 108 220 96 237 88C260 95 281 78 293 72C322 78 346 59 365 51C384 45 389 26 376 28C352 27 341 40 325 38C306 30 287 45 270 47C249 39 230 53 214 57C191 51 177 69 158 69C136 57 121 81 105 78C94 56 80 50 69 62Z"
              fill="#0f2b3888"
              stroke="#8adbd2"
              strokeWidth="1.5"
            />
          </svg>
        )}
      </div>

      {/* 2. OPTION 3: Biophysical Islet Secretory & Endocrine Wave Overlay */}
      <svg
        className="dt-biophysical-overlay"
        viewBox="0 0 420 180"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <radialGradient id="islet-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={pancreas.stressColor} stopOpacity="0.9" />
            <stop offset="70%" stopColor={pancreas.stressColor} stopOpacity="0.4" />
            <stop offset="100%" stopColor={pancreas.stressColor} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Pancreatic Main Duct with Animated Secretory Flow */}
        <path
          d="M 68 112 Q 110 95, 160 88 T 240 78 T 320 58 T 365 42"
          fill="none"
          stroke={pancreas.stressColor}
          strokeWidth="2.8"
          strokeDasharray="6 4"
          className="dt-duct-flow"
        />

        {/* Branching Interlobular Ducts */}
        <g stroke={pancreas.stressColor} strokeWidth="1" opacity="0.6">
          <path d="M 120 94 L 110 75 M 140 91 L 148 112 M 190 84 L 180 65 M 220 81 L 228 100 M 270 70 L 260 52 M 310 60 L 315 78" />
        </g>

        {/* Distributed Islets of Langerhans (Head, Body, Tail Clusters) */}
        {[
          { cx: 72, cy: 90, r: 12, label: "HEAD ISLETS" },
          { cx: 95, cy: 118, r: 9, label: "UNCINATE" },
          { cx: 145, cy: 80, r: 14, label: "BODY ISLETS" },
          { cx: 185, cy: 95, r: 11, label: "BODY CAPILLARY" },
          { cx: 235, cy: 75, r: 13, label: "ISTHMUS" },
          { cx: 285, cy: 62, r: 12, label: "TAIL ISLETS" },
          { cx: 340, cy: 48, r: 10, label: "SPLENIC TAIL" },
        ].map((islet, i) => (
          <g key={i}>
            {/* Islet Secretory Halo */}
            <circle
              cx={islet.cx}
              cy={islet.cy}
              r={islet.r * 1.8}
              fill="url(#islet-glow)"
              className="dt-islet-halo"
              style={{ animationDuration: isletPulseDuration }}
            />
            {/* Islet Core Beta-Cell Cluster */}
            <circle
              cx={islet.cx}
              cy={islet.cy}
              r={islet.r}
              fill={`${pancreas.stressColor}33`}
              stroke={pancreas.stressColor}
              strokeWidth="1.5"
            />
            {/* Inner Calcium Spark */}
            <circle
              cx={islet.cx}
              cy={islet.cy}
              r={islet.r * 0.4}
              fill="#ffffff"
              opacity="0.85"
            />
          </g>
        ))}
      </svg>

      {/* 3. OPTION 3: Deep Dive Biophysical Telemetry Dashboard */}
      <div className="dt-organ-telemetry-overlay">
        {/* State Banner */}
        <div
          className={`dt-organ-status-banner ${pancreas.isExhaustion ? "alarm" : ""}`}
          style={{ borderColor: pancreas.stressColor }}
        >
          <div className="dt-banner-left">
            {pancreas.isExhaustion ? (
              <AlertTriangle size={16} color="#ef4444" />
            ) : (
              <Zap size={16} color={pancreas.stressColor} />
            )}
            <div>
              <strong>{pancreas.stressState}</strong>
              <span>
                {pancreas.isExhaustion
                  ? "Hyperglycemia exceeding beta-cell secretory reserve capacity"
                  : "Active insulin biosynthesis compensating for glycemic load"}
              </span>
            </div>
          </div>
          <div className="dt-banner-badge" style={{ color: pancreas.stressColor }}>
            {pancreas.betaDemandIndex}% DEMAND
          </div>
        </div>

        {/* 4 Interactive Kinetic Metric Cards */}
        <div className="dt-organ-metric-grid">
          <div className="dt-metric-box">
            <span className="dt-mb-title">ENDOGENOUS C-PEPTIDE</span>
            <div className="dt-mb-val">
              <strong style={{ color: pancreas.cPeptide < 0.4 ? "#ef4444" : "#34d399" }}>
                {pancreas.cPeptide}
              </strong>
              <small>nmol/L</small>
            </div>
            <div className="dt-mb-bar-track">
              <div
                className="dt-mb-bar-fill"
                style={{
                  width: `${pancreas.betaReservePct}%`,
                  background: pancreas.cPeptide < 0.4 ? "#ef4444" : "#34d399",
                }}
              />
            </div>
            <span className="dt-mb-sub">Reserve: {pancreas.betaReservePct}% of normal</span>
          </div>

          <div className="dt-metric-box">
            <span className="dt-mb-title">BETA-CELL LOAD INDEX</span>
            <div className="dt-mb-val">
              <strong style={{ color: pancreas.stressColor }}>
                {pancreas.betaDemandIndex}%
              </strong>
            </div>
            <div className="dt-mb-bar-track">
              <div
                className="dt-mb-bar-fill"
                style={{
                  width: `${Math.min(100, (pancreas.betaDemandIndex / 200) * 100)}%`,
                  background: pancreas.stressColor,
                }}
              />
            </div>
            <span className="dt-mb-sub">Demand/Capacity Ratio</span>
          </div>

          <div className="dt-metric-box">
            <span className="dt-mb-title">HOVORKA INSULIN APPEARANCE</span>
            <div className="dt-mb-val">
              <strong style={{ color: "#00e5ff" }}>
                {pancreas.insulinAppearance}
              </strong>
              <small>mU/min</small>
            </div>
            <div className="dt-mb-bar-track">
              <div
                className="dt-mb-bar-fill"
                style={{
                  width: `${Math.min(100, (pancreas.insulinAppearance / 18) * 100)}%`,
                  background: "#00e5ff",
                }}
              />
            </div>
            <span className="dt-mb-sub">Current Portal Secretion Flux</span>
          </div>

          <div className="dt-metric-box">
            <span className="dt-mb-title">ENDOCRINE PHASE</span>
            <div className="dt-mb-val">
              <strong style={{ fontSize: "13px", color: "#f8fafc" }}>
                {velocity > 20 ? "Phase 1 Rapid Influx" : velocity > 5 ? "Phase 2 Sustained" : "Basal Secretion"}
              </strong>
            </div>
            <div className="dt-mb-sub" style={{ marginTop: "12px" }}>
              Velocity: <strong>{velocity > 0 ? `+${velocity}` : velocity}</strong> mg/dL/h
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
