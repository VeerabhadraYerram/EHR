import { useState } from "react";
import type { Organ } from "./organDefinitions";
import { organInfo } from "./organDefinitions";
import type { Patient, Reading } from "./types";
import type { KineticTelemetry } from "./kineticEngine";
import { BrainMap } from "./MedicalVisuals";
import { PancreasArtwork } from "./PancreasTwin";

interface OrganVisualProps {
  organ: Organ;
  patient?: Patient;
  reading?: Reading;
  telemetry: KineticTelemetry;
}

export function OrganVisual({ organ, telemetry }: OrganVisualProps) {
  const [failed, setFailed] = useState(false);

  // Minimalist single-line status using color and simple text (no boxes, no tables)
  let statusColor = "#00e5ff";
  let statusText = "";

  if (organ === "pancreas") {
    statusColor = telemetry.pancreas.stressColor;
    statusText = `${telemetry.pancreas.stressState} · Demand ${telemetry.pancreas.betaDemandIndex}% · C-Pep ${telemetry.pancreas.cPeptide} nmol/L`;
  } else if (organ === "kidneys") {
    statusColor = telemetry.kidneys.sglt2Color;
    statusText = `${telemetry.kidneys.sglt2Status} · eGFR ${telemetry.kidneys.egfr} · ${
      telemetry.kidneys.isSaturated ? `Spill ${telemetry.kidneys.glycosuriaRate} mg/min` : "Zero Spill"
    }`;
  } else if (organ === "heart") {
    statusColor = telemetry.heart.stressColor;
    statusText = `${telemetry.heart.cardioStatus} · ${telemetry.heart.heartRate} BPM · Shear ${telemetry.heart.vascularShearStress}%`;
  } else if (organ === "brain") {
    statusColor = telemetry.brain.brainColor;
    statusText = `${telemetry.brain.brainStatus} · Sensor ${telemetry.brain.interstitialSensor} mg/dL`;
  }

  return (
    <div className="ot-organ-hero-wrapper">
      {/* 1. Subtle, minimalist single-line telemetry status chip using simple text and color */}
      <div className="ot-organ-minimal-hud" style={{ borderColor: `${statusColor}55` }}>
        <span className="ot-hud-dot" style={{ background: statusColor, boxShadow: `0 0 8px ${statusColor}` }} />
        <span className="ot-hud-text" style={{ color: statusColor }}>
          {statusText}
        </span>
      </div>

      {/* 2. The Organ Itself — Centered, Floating, Occupying the Entire Stage */}
      {!failed ? (
        <img
          className="ot-organ-artwork ot-floating-organ"
          src={`/diagnostics/${organ === "brain" ? "brain" : `${organ}-atlas`}.png`}
          alt={`Illustrative ${organInfo[organ].name.toLowerCase()} anatomy`}
          onError={() => setFailed(true)}
        />
      ) : organ === "pancreas" ? (
        <div className="ot-floating-organ">
          <PancreasArtwork />
        </div>
      ) : organ === "brain" ? (
        <div className="ot-floating-organ">
          <BrainMap compact />
        </div>
      ) : (
        <svg viewBox="0 0 320 240" className="ot-floating-organ" role="img">
          <g fill="#8adbd218" stroke="#8adbd2" strokeWidth="1.4">
            <path d="M89 37C48 29 29 75 35 119C40 165 76 185 104 169C127 155 121 133 105 124C87 114 87 96 102 84C121 69 114 43 89 37ZM231 37C272 29 291 75 285 119C280 165 244 185 216 169C193 155 199 133 215 124C233 114 233 96 218 84C199 69 206 43 231 37Z" />
          </g>
        </svg>
      )}
    </div>
  );
}
