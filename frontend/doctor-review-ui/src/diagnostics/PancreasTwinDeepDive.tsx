import { useState } from "react";
import type { Patient, Reading } from "./types";
import type { KineticTelemetry } from "./kineticEngine";

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

  return (
    <div className="dt-organ-deep-dive dt-pancreas-deep-dive">
      {/* 1. Underlying Anatomical Atlas (Full Center Focus) */}
      <div className="dt-atlas-layer full-focus">
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

      {/* 2. Delicate Bioluminescent Islet Glows on Anatomical Loci */}
      <svg
        className="dt-biophysical-overlay full-focus"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="pancreas-islet-pulse" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={pancreas.stressColor} stopOpacity="0.8" />
            <stop offset="60%" stopColor={pancreas.stressColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={pancreas.stressColor} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Head cluster */}
        <circle cx="34" cy="46" r="8" fill="url(#pancreas-islet-pulse)" className="dt-islet-halo" />
        <circle cx="34" cy="46" r="2.2" fill={pancreas.stressColor} />

        {/* Body cluster */}
        <circle cx="52" cy="40" r="7" fill="url(#pancreas-islet-pulse)" className="dt-islet-halo" />
        <circle cx="52" cy="40" r="2" fill={pancreas.stressColor} />

        {/* Tail cluster */}
        <circle cx="70" cy="36" r="6" fill="url(#pancreas-islet-pulse)" className="dt-islet-halo" />
        <circle cx="70" cy="36" r="1.8" fill={pancreas.stressColor} />
      </svg>

      {/* 3. Minimalist Floating Telemetry Tags (Just like Body Twin) */}
      <div className="dt-minimal-tag top-left">
        <div className="dt-tag-header">
          <span className="dt-tag-dot" style={{ background: pancreas.stressColor }} />
          <span className="dt-tag-title">ISLET SECRETION</span>
          <span className="dt-tag-badge" style={{ color: pancreas.stressColor, borderColor: pancreas.stressColor }}>
            {pancreas.isExhaustion ? "EXHAUSTION" : `${pancreas.betaDemandIndex}% DEMAND`}
          </span>
        </div>
        <div className="dt-tag-body">
          <span>{pancreas.stressState}</span>
          <small>Insulin Appearance: <strong>{pancreas.insulinAppearance}</strong> mU/min</small>
        </div>
      </div>

      <div className="dt-minimal-tag top-right">
        <div className="dt-tag-header">
          <span className="dt-tag-dot" style={{ background: pancreas.cPeptide < 0.4 ? "#ef4444" : "#34d399" }} />
          <span className="dt-tag-title">BETA-CELL RESERVE</span>
          <span
            className="dt-tag-badge"
            style={{
              color: pancreas.cPeptide < 0.4 ? "#ef4444" : "#34d399",
              borderColor: pancreas.cPeptide < 0.4 ? "#ef4444" : "#34d399",
            }}
          >
            {pancreas.betaReservePct}% NORMAL
          </span>
        </div>
        <div className="dt-tag-body">
          <span>Fasting C-Peptide: <strong>{pancreas.cPeptide}</strong> nmol/L</span>
          <small>Velocity: <strong>{velocity > 0 ? `+${velocity}` : velocity}</strong> mg/dL/h</small>
        </div>
      </div>
    </div>
  );
}
