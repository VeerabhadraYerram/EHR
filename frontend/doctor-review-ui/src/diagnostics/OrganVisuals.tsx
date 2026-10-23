import { useState } from "react";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
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
  telemetry?: KineticTelemetry;
}

interface OrganMetric {
  name: string;
  value: string | number;
  units: string;
  arrow: "up" | "down" | "flat";
  color: string;
}

export function OrganVisual({
  organ,
  telemetry,
}: OrganVisualProps) {
  const [failed, setFailed] = useState(false);

  // Compute minimalist indicators for each organ
  let metricLeft: OrganMetric | null = null;
  let metricRight: OrganMetric | null = null;

  if (telemetry) {
    if (organ === "pancreas") {
      metricLeft = {
        name: "INSULIN FLUX",
        value: telemetry.pancreas.insulinAppearance,
        units: "mU/min",
        arrow: telemetry.velocity >= 0 ? "up" : "down",
        color: telemetry.pancreas.stressColor,
      };
      metricRight = {
        name: "C-PEPTIDE",
        value: telemetry.pancreas.cPeptide,
        units: "nmol/L",
        arrow: telemetry.pancreas.cPeptide >= 0.4 ? "up" : "down",
        color: telemetry.pancreas.cPeptide < 0.4 ? "#ef4444" : "#34d399",
      };
    } else if (organ === "kidneys") {
      metricLeft = {
        name: "SGLT-2 THRESHOLD",
        value: telemetry.glucose >= 180 ? telemetry.kidneys.glycosuriaRate : 0,
        units: "mg/min",
        arrow: telemetry.glucose >= 180 ? "up" : "down",
        color: telemetry.kidneys.sglt2Color,
      };
      metricRight = {
        name: "eGFR",
        value: telemetry.kidneys.egfr,
        units: "mL/min",
        arrow: telemetry.kidneys.egfr >= 90 ? "up" : "down",
        color:
          telemetry.kidneys.egfr < 60
            ? "#ef4444"
            : telemetry.kidneys.egfr < 90
            ? "#f59e0b"
            : "#34d399",
      };
    } else if (organ === "heart") {
      metricLeft = {
        name: "HEART RATE",
        value: telemetry.heart.heartRate,
        units: "bpm",
        arrow: telemetry.heart.heartRate > 80 ? "up" : "down",
        color: telemetry.heart.stressColor,
      };
      metricRight = {
        name: "SHEAR STRESS",
        value: telemetry.heart.vascularShearStress,
        units: "%",
        arrow: telemetry.heart.vascularShearStress > 20 ? "up" : "down",
        color:
          telemetry.heart.vascularShearStress > 30 ? "#ef4444" : "#00e5ff",
      };
    } else if (organ === "brain") {
      metricLeft = {
        name: "GLUCOSE SENSING",
        value: telemetry.brain.interstitialSensor,
        units: "mg/dL",
        arrow:
          telemetry.velocity > 0
            ? "up"
            : telemetry.velocity < 0
            ? "down"
            : "flat",
        color: telemetry.brain.brainColor,
      };
      metricRight = {
        name: "COUNTER-REGULATION",
        value:
          telemetry.velocity > 0
            ? `+${telemetry.velocity}`
            : telemetry.velocity,
        units: "mg/dL/h",
        arrow:
          telemetry.brain.dawnPhenomenon || telemetry.velocity > 0
            ? "up"
            : "down",
        color: telemetry.brain.dawnPhenomenon ? "#f59e0b" : "#34d399",
      };
    }
  }

  return (
    <div className="ot-organ-viewport">
      {/* 1. Left Minimal Indicator: Colored Arrow Ring + Minimal Data & Units */}
      {metricLeft && (
        <div className="ot-mini-tag top-left">
          <div
            className="ot-arrow-circle"
            style={{
              borderColor: metricLeft.color,
              boxShadow: `0 0 12px ${metricLeft.color}44`,
              color: metricLeft.color,
            }}
          >
            {metricLeft.arrow === "up" ? (
              <ArrowUp size={13} strokeWidth={2.6} />
            ) : metricLeft.arrow === "down" ? (
              <ArrowDown size={13} strokeWidth={2.6} />
            ) : (
              <Minus size={13} strokeWidth={2.6} />
            )}
          </div>
          <div className="ot-badge-content">
            <span className="ot-badge-name">{metricLeft.name}</span>
            <span className="ot-badge-stat" style={{ color: metricLeft.color }}>
              <strong>{metricLeft.value}</strong>
              <small>{metricLeft.units}</small>
            </span>
          </div>
        </div>
      )}

      {/* 2. Right Minimal Indicator: Colored Arrow Ring + Minimal Data & Units */}
      {metricRight && (
        <div className="ot-mini-tag top-right">
          <div
            className="ot-arrow-circle"
            style={{
              borderColor: metricRight.color,
              boxShadow: `0 0 12px ${metricRight.color}44`,
              color: metricRight.color,
            }}
          >
            {metricRight.arrow === "up" ? (
              <ArrowUp size={13} strokeWidth={2.6} />
            ) : metricRight.arrow === "down" ? (
              <ArrowDown size={13} strokeWidth={2.6} />
            ) : (
              <Minus size={13} strokeWidth={2.6} />
            )}
          </div>
          <div className="ot-badge-content">
            <span className="ot-badge-name">{metricRight.name}</span>
            <span className="ot-badge-stat" style={{ color: metricRight.color }}>
              <strong>{metricRight.value}</strong>
              <small>{metricRight.units}</small>
            </span>
          </div>
        </div>
      )}

      {/* 3. Centered Floating Transparent Organ Atlas */}
      {!failed ? (
        <img
          className="ot-organ-artwork ot-organ-img-centered"
          src={`/diagnostics/${organ === "brain" ? "brain" : `${organ}-atlas`}.png`}
          alt={`Illustrative ${organInfo[organ].name.toLowerCase()} anatomy`}
          onError={() => setFailed(true)}
        />
      ) : organ === "pancreas" ? (
        <PancreasArtwork />
      ) : organ === "brain" ? (
        <BrainMap compact />
      ) : organ === "heart" ? (
        <svg
          viewBox="0 0 320 240"
          role="img"
          aria-label="Schematic heart anatomy"
          className="ot-organ-img-centered"
        >
          <g fill="#8adbd218" stroke="#8adbd2" strokeWidth="1.4">
            <path d="M137 78C119 48 74 66 72 104C44 147 110 202 170 219C209 199 247 169 244 124C243 89 218 64 189 78C191 49 182 24 163 22L143 24L147 51L157 62L155 84Z" />
          </g>
        </svg>
      ) : (
        <svg
          viewBox="0 0 320 240"
          role="img"
          aria-label="Schematic kidneys"
          className="ot-organ-img-centered"
        >
          <g fill="#8adbd218" stroke="#8adbd2" strokeWidth="1.4">
            <path d="M89 37C48 29 29 75 35 119C40 165 76 185 104 169C127 155 121 133 105 124C87 114 87 96 102 84C121 69 114 43 89 37ZM231 37C272 29 291 75 285 119C280 165 244 185 216 169C193 155 199 133 215 124C233 114 233 96 218 84C199 69 206 43 231 37Z" />
          </g>
        </svg>
      )}
    </div>
  );
}
