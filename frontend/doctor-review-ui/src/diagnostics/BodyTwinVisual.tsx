import { useState } from "react";
import type { Patient, Reading } from "./types";
import type { KineticTelemetry } from "./kineticEngine";
import type { Organ } from "./organDefinitions";
import { BodyFallback } from "./MedicalVisuals";

interface BodyTwinVisualProps {
  patient?: Patient;
  reading?: Reading;
  telemetry: KineticTelemetry;
  labels: boolean;
  onSelectOrgan: (organ: Organ) => void;
}

export default function BodyTwinVisual({
  patient: _patient,
  telemetry,
  labels,
  onSelectOrgan,
}: BodyTwinVisualProps) {
  const [bodyReady, setBodyReady] = useState(true);

  const { statusColor, pancreas, liver, gut, kidneys, heart, brain } = telemetry;

  return (
    <div className="ot-body-registration dt-kinetic-body">
      {/* 1. Underlying Anatomical Atlas */}
      <div className="ot-body-art">
        {bodyReady ? (
          <img
            src="/diagnostics/anatomy.png"
            alt="Full-body anterior anatomical reference"
            onError={() => setBodyReady(false)}
          />
        ) : (
          <BodyFallback />
        )}
      </div>

      {/* 2. OPTION 4: Dynamic Systemic Arterial Perfusion Overlay */}
      <svg
        className="dt-vascular-network"
        viewBox="0 0 400 800"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <defs>
          <filter id="arterial-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <linearGradient id="arterial-pulse-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.9" />
            <stop offset="50%" stopColor={statusColor} stopOpacity="1" />
            <stop offset="100%" stopColor={statusColor} stopOpacity="0.4" />
          </linearGradient>
        </defs>

        {/* Arterial Network Paths */}
        <g
          stroke={statusColor}
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          filter="url(#arterial-glow)"
          style={{
            transition: "stroke 0.4s ease",
          }}
        >
          {/* Ascending & Descending Aorta */}
          <path
            d="M 200 230 C 200 200, 206 195, 204 225 L 202 320 L 200 450"
            className="dt-artery-pulse"
            style={{ animationDuration: `${heart.pulseDurationSec}s` }}
          />

          {/* Carotid Arteries (Ascending to Brain) */}
          <path
            d="M 197 215 C 193 180, 192 130, 192 75 M 207 215 C 211 180, 212 130, 212 75"
            className="dt-artery-pulse"
            strokeWidth="1.8"
            style={{ animationDuration: `${heart.pulseDurationSec * 1.1}s` }}
          />

          {/* Subclavian & Brachial Arteries (Shoulders & Arms) */}
          <path
            d="M 196 215 C 180 220, 145 250, 115 350 M 208 215 C 224 220, 259 250, 289 350"
            className="dt-artery-pulse"
            strokeWidth="1.6"
            strokeDasharray="4 3"
            style={{ animationDuration: `${heart.pulseDurationSec * 1.3}s` }}
          />

          {/* Celiac Trunk & Mesenteric to Liver / Pancreas / Gut */}
          <path
            d="M 202 305 Q 170 315, 155 330 M 202 315 Q 230 325, 245 340 M 201 340 Q 200 365, 201 390"
            className="dt-artery-pulse"
            strokeWidth="1.8"
            style={{ animationDuration: `${heart.pulseDurationSec * 0.9}s` }}
          />

          {/* Left & Right Renal Arteries (to Kidneys) */}
          <path
            d="M 201 385 L 165 398 M 201 387 L 238 398"
            className="dt-artery-pulse"
            strokeWidth="2.2"
            strokeDasharray={kidneys.isSaturated ? "2 2" : "none"}
            stroke={kidneys.isSaturated ? "#ef4444" : statusColor}
            style={{ animationDuration: `${kidneys.filtrationSpeedSec}s` }}
          />

          {/* Common Iliac & Femoral Arteries (Descending into Legs) */}
          <path
            d="M 200 450 Q 185 490, 175 580 L 168 730 M 200 450 Q 215 490, 225 580 L 232 730"
            className="dt-artery-pulse"
            strokeWidth="2.2"
            style={{ animationDuration: `${heart.pulseDurationSec * 1.4}s` }}
          />
        </g>

        {/* Dynamic Blood Velocity Kinetic Particles */}
        <g fill={statusColor} opacity="0.85">
          <circle cx="201" cy="275" r="3" className="dt-perfusion-particle p1" />
          <circle cx="202" cy="330" r="2.5" className="dt-perfusion-particle p2" />
          <circle cx="193" cy="140" r="2" className="dt-perfusion-particle p3" />
          <circle cx="211" cy="140" r="2" className="dt-perfusion-particle p4" />
          <circle cx="168" cy="397" r="2.8" className="dt-perfusion-particle p5" />
          <circle cx="236" cy="397" r="2.8" className="dt-perfusion-particle p6" />
        </g>
      </svg>

      {/* 3. OPTION 4: Reactive Organ Hotspots with Floating Telemetry Chips */}

      {/* BRAIN HOTSPOT */}
      <div className="dt-hotspot-container brain">
        <button
          className="dt-organ-node"
          onClick={() => onSelectOrgan("brain")}
          aria-label="Inspect Brain Digital Twin"
          style={{ borderColor: brain.brainColor }}
        >
          <span className="dt-node-ripple" style={{ borderColor: brain.brainColor }} />
          <span className="dt-node-center" style={{ background: brain.brainColor }} />
        </button>
        {labels && (
          <div
            className="dt-telemetry-chip brain"
            onClick={() => onSelectOrgan("brain")}
            title="Click to view Brain Deep Dive"
          >
            <div className="dt-chip-header">
              <span className="dt-chip-title">BRAIN · NEURAL</span>
              <span className="dt-chip-status" style={{ color: brain.brainColor, borderColor: brain.brainColor }}>
                {brain.dawnPhenomenon ? "DAWN" : brain.hypoAlarm ? "HYPO" : "HOMEO"}
              </span>
            </div>
            <div className="dt-chip-metrics">
              <span>Sensor: <strong>{brain.interstitialSensor}</strong> mg/dL</span>
              <small>{brain.brainStatus}</small>
            </div>
          </div>
        )}
      </div>

      {/* HEART HOTSPOT */}
      <div className="dt-hotspot-container heart">
        <button
          className="dt-organ-node"
          onClick={() => onSelectOrgan("heart")}
          aria-label="Inspect Heart Digital Twin"
          style={{ borderColor: heart.stressColor }}
        >
          <span
            className="dt-node-ripple pulse"
            style={{
              borderColor: heart.stressColor,
              animationDuration: `${heart.pulseDurationSec}s`,
            }}
          />
          <span className="dt-node-center" style={{ background: heart.stressColor }} />
        </button>
        {labels && (
          <div
            className="dt-telemetry-chip heart"
            onClick={() => onSelectOrgan("heart")}
            title="Click to view Heart Deep Dive"
          >
            <div className="dt-chip-header">
              <span className="dt-chip-title">HEART · CARDIAC</span>
              <span className="dt-chip-status" style={{ color: heart.stressColor, borderColor: heart.stressColor }}>
                {heart.heartRate} BPM
              </span>
            </div>
            <div className="dt-chip-metrics">
              <span>Shear Stress: <strong>{heart.vascularShearStress}%</strong></span>
              <small>{heart.cardioStatus}</small>
            </div>
          </div>
        )}
      </div>

      {/* LIVER HOTSPOT */}
      <div className="dt-hotspot-container liver">
        <div className="dt-organ-node non-clickable" style={{ borderColor: liver.stateColor }}>
          <span className="dt-node-ripple" style={{ borderColor: liver.stateColor }} />
          <span className="dt-node-center" style={{ background: liver.stateColor }} />
        </div>
        {labels && (
          <div className="dt-telemetry-chip liver">
            <div className="dt-chip-header">
              <span className="dt-chip-title">LIVER · HEPATIC</span>
              <span className="dt-chip-status" style={{ color: liver.stateColor, borderColor: liver.stateColor }}>
                EGP {liver.egpRate}
              </span>
            </div>
            <div className="dt-chip-metrics">
              <span>Rate: <strong>{liver.egpRate}</strong> mg/kg/min</span>
              <small>{liver.onMetformin ? "Metformin Suppressed" : "Basal Output"}</small>
            </div>
          </div>
        )}
      </div>

      {/* PANCREAS HOTSPOT */}
      <div className="dt-hotspot-container pancreas">
        <button
          className="dt-organ-node"
          onClick={() => onSelectOrgan("pancreas")}
          aria-label="Inspect Pancreas Digital Twin"
          style={{ borderColor: pancreas.stressColor }}
        >
          <span
            className="dt-node-ripple"
            style={{
              borderColor: pancreas.stressColor,
              animationDuration: pancreas.isExhaustion ? "0.6s" : "1.8s",
            }}
          />
          <span className="dt-node-center" style={{ background: pancreas.stressColor }} />
        </button>
        {labels && (
          <div
            className="dt-telemetry-chip pancreas"
            onClick={() => onSelectOrgan("pancreas")}
            title="Click to view Pancreas Deep Dive"
          >
            <div className="dt-chip-header">
              <span className="dt-chip-title">PANCREAS · ISLET</span>
              <span className="dt-chip-status" style={{ color: pancreas.stressColor, borderColor: pancreas.stressColor }}>
                {pancreas.isExhaustion ? "EXHAUSTION" : `${pancreas.betaDemandIndex}%`}
              </span>
            </div>
            <div className="dt-chip-metrics">
              <span>C-Pep: <strong>{pancreas.cPeptide}</strong> nmol/L</span>
              <small>Insulin: {pancreas.insulinAppearance} mU/min</small>
            </div>
          </div>
        )}
      </div>

      {/* KIDNEYS HOTSPOT */}
      <div className="dt-hotspot-container kidneys">
        <button
          className="dt-organ-node"
          onClick={() => onSelectOrgan("kidneys")}
          aria-label="Inspect Kidneys Digital Twin"
          style={{ borderColor: kidneys.sglt2Color }}
        >
          <span
            className="dt-node-ripple"
            style={{
              borderColor: kidneys.sglt2Color,
              animationDuration: `${kidneys.filtrationSpeedSec}s`,
            }}
          />
          <span className="dt-node-center" style={{ background: kidneys.sglt2Color }} />
        </button>
        {labels && (
          <div
            className="dt-telemetry-chip kidneys"
            onClick={() => onSelectOrgan("kidneys")}
            title="Click to view Kidneys Deep Dive"
          >
            <div className="dt-chip-header">
              <span className="dt-chip-title">KIDNEYS · SGLT-2</span>
              <span className="dt-chip-status" style={{ color: kidneys.sglt2Color, borderColor: kidneys.sglt2Color }}>
                {kidneys.isSaturated ? "SATURATED" : "REABSORB"}
              </span>
            </div>
            <div className="dt-chip-metrics">
              <span>eGFR: <strong>{kidneys.egfr}</strong> mL/min</span>
              <small>{kidneys.isSaturated ? `Spill: ${kidneys.glycosuriaRate} mg/m` : "Zero Glycosuria"}</small>
            </div>
          </div>
        )}
      </div>

      {/* 4. OPTION 4: Synchronized Multi-Organ Kinetic HUD Bar */}
      <div className="dt-organ-kinetic-hud">
        <div className="dt-hud-chip" onClick={() => onSelectOrgan("pancreas")}>
          <div className="dt-hud-chip-top">
            <span className="dt-hud-organ-name">PANCREAS β-CELL</span>
            <span className="dt-hud-badge" style={{ color: pancreas.stressColor }}>
              {pancreas.stressState.split(" ")[0]}
            </span>
          </div>
          <div className="dt-hud-meter-wrap">
            <div
              className="dt-hud-meter-bar"
              style={{
                width: `${Math.min(100, (pancreas.betaDemandIndex / 180) * 100)}%`,
                background: pancreas.stressColor,
              }}
            />
          </div>
          <div className="dt-hud-chip-sub">
            Demand <strong>{pancreas.betaDemandIndex}%</strong> · C-Pep {pancreas.cPeptide}
          </div>
        </div>

        <div className="dt-hud-chip">
          <div className="dt-hud-chip-top">
            <span className="dt-hud-organ-name">HEPATIC EGP</span>
            <span className="dt-hud-badge" style={{ color: liver.stateColor }}>
              {liver.onMetformin ? "METFORMIN" : "BASAL"}
            </span>
          </div>
          <div className="dt-hud-meter-wrap">
            <div
              className="dt-hud-meter-bar"
              style={{
                width: `${Math.min(100, (liver.egpRate / 2.2) * 100)}%`,
                background: liver.stateColor,
              }}
            />
          </div>
          <div className="dt-hud-chip-sub">
            Rate <strong>{liver.egpRate}</strong> mg/kg/min
          </div>
        </div>

        <div className="dt-hud-chip">
          <div className="dt-hud-chip-top">
            <span className="dt-hud-organ-name">GUT Ra(t)</span>
            <span className="dt-hud-badge" style={{ color: gut.gutColor }}>
              {gut.isMealActive ? "MEAL ACTIVE" : "BASAL"}
            </span>
          </div>
          <div className="dt-hud-meter-wrap">
            <div
              className="dt-hud-meter-bar"
              style={{
                width: `${Math.min(100, (gut.absorptionRate / 8.0) * 100)}%`,
                background: gut.gutColor,
              }}
            />
          </div>
          <div className="dt-hud-chip-sub">
            Flux <strong>{gut.absorptionRate}</strong> mg/min
          </div>
        </div>

        <div className="dt-hud-chip" onClick={() => onSelectOrgan("kidneys")}>
          <div className="dt-hud-chip-top">
            <span className="dt-hud-organ-name">RENAL SGLT-2</span>
            <span className="dt-hud-badge" style={{ color: kidneys.sglt2Color }}>
              {kidneys.isSaturated ? "SPILLING" : "INTACT"}
            </span>
          </div>
          <div className="dt-hud-meter-wrap">
            <div
              className="dt-hud-meter-bar"
              style={{
                width: `${Math.min(100, (telemetry.glucose / 180) * 100)}%`,
                background: kidneys.sglt2Color,
              }}
            />
          </div>
          <div className="dt-hud-chip-sub">
            {kidneys.isSaturated ? `Spill ${kidneys.glycosuriaRate} mg/m` : `eGFR ${kidneys.egfr} mL/m`}
          </div>
        </div>

        <div className="dt-hud-chip" onClick={() => onSelectOrgan("heart")}>
          <div className="dt-hud-chip-top">
            <span className="dt-hud-organ-name">CARDIAC STRESS</span>
            <span className="dt-hud-badge" style={{ color: heart.stressColor }}>
              {heart.heartRate} BPM
            </span>
          </div>
          <div className="dt-hud-meter-wrap">
            <div
              className="dt-hud-meter-bar"
              style={{
                width: `${heart.vascularShearStress}%`,
                background: heart.stressColor,
              }}
            />
          </div>
          <div className="dt-hud-chip-sub">
            Shear Tension <strong>{heart.vascularShearStress}%</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
