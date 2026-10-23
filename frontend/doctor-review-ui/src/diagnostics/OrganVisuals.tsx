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

/* 1. BRAIN: Neurons Transmitting Synaptic Signals */
function BrainNeuronOverlay({ telemetry }: { telemetry?: KineticTelemetry }) {
  const signalColor = telemetry?.brain?.brainColor || "#00e5ff";

  // Synaptic network paths across the cerebrum
  const axonPaths = [
    { id: "ax1", d: "M 105 130 Q 125 105, 155 95 Q 185 85, 215 90", delay: 0 },
    { id: "ax2", d: "M 215 90 Q 255 95, 280 120 Q 300 145, 310 165", delay: 0.7 },
    { id: "ax3", d: "M 135 125 Q 165 140, 195 155", delay: 0.35 },
    { id: "ax4", d: "M 195 155 Q 225 165, 255 175 Q 275 180, 290 195", delay: 1.1 },
    { id: "ax5", d: "M 235 110 Q 240 140, 255 175", delay: 1.4 },
    { id: "ax6", d: "M 195 155 Q 198 190, 200 235", delay: 0.5 },
  ];

  const synapses = [
    { x: 105, y: 130 },
    { x: 155, y: 95 },
    { x: 215, y: 90 },
    { x: 280, y: 120 },
    { x: 310, y: 165 },
    { x: 195, y: 155 },
    { x: 255, y: 175 },
    { x: 200, y: 235 },
  ];

  return (
    <svg className="ot-organ-overlay-svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet">
      <defs>
        <filter id="neuron-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Synaptic Axon Branch Filaments */}
      <g fill="none" stroke={signalColor} opacity="0.32" strokeWidth="1">
        {axonPaths.map((p) => (
          <path key={p.id} d={p.d} strokeDasharray="3 3" />
        ))}
      </g>

      {/* Dynamic Action Potential Pulses Transmitting Across Axons */}
      <g fill="none" stroke={signalColor} strokeWidth="2.2" filter="url(#neuron-glow)">
        {axonPaths.map((p) => (
          <path
            key={`pulse-${p.id}`}
            d={p.d}
            className="ot-axon-signal-pulse"
            strokeDasharray="14 55"
            style={{ animationDelay: `${p.delay}s` }}
          />
        ))}
      </g>

      {/* Synaptic Junction Nodes Flashing as Signals Fire */}
      {synapses.map((s, i) => (
        <g key={`syn-${i}`} className="ot-synapse-node" style={{ animationDelay: `${(i * 0.4) % 2.4}s` }}>
          <circle cx={s.x} cy={s.y} r="5.5" fill="none" stroke={signalColor} strokeWidth="1.2" className="ot-synapse-halo" />
          <circle cx={s.x} cy={s.y} r="2.6" fill={signalColor} filter="url(#neuron-glow)" />
          <circle cx={s.x} cy={s.y} r="1" fill="#ffffff" />
        </g>
      ))}
    </svg>
  );
}

/* 2. KIDNEYS: Glomerular Filtration & Urine Formation Streaming Down Ureters */
function KidneysUrineOverlay({ telemetry }: { telemetry?: KineticTelemetry }) {
  const urineColor = telemetry?.kidneys?.isSaturated ? "#f59e0b" : "#38bdf8";

  return (
    <svg className="ot-organ-overlay-svg" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid meet">
      <defs>
        <filter id="urine-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Nephron Filtration Sparkles inside Left & Right Parenchyma */}
      {[
        { cx: 88, cy: 150 },
        { cx: 104, cy: 190 },
        { cx: 122, cy: 140 },
        { cx: 278, cy: 140 },
        { cx: 296, cy: 190 },
        { cx: 312, cy: 150 },
      ].map((pt, i) => (
        <circle
          key={`glom-${i}`}
          cx={pt.cx}
          cy={pt.cy}
          r="4"
          fill="none"
          stroke={urineColor}
          strokeWidth="1.2"
          className="ot-nephron-sparkle"
          style={{ animationDelay: `${i * 0.35}s` }}
        />
      ))}

      {/* Bilateral Ureter Channels from Renal Pelvis down into Bladder */}
      <path
        d="M 142 185 Q 155 240, 172 300 Q 182 335, 185 365"
        fill="none"
        stroke={urineColor}
        strokeWidth="1.2"
        opacity="0.25"
      />
      <path
        d="M 258 185 Q 245 240, 228 300 Q 218 335, 215 365"
        fill="none"
        stroke={urineColor}
        strokeWidth="1.2"
        opacity="0.25"
      />

      {/* Urine Stream Trickling Down Both Ureters (Normal Physiological Flow) */}
      <path
        d="M 142 185 Q 155 240, 172 300 Q 182 335, 185 365"
        fill="none"
        stroke={urineColor}
        strokeWidth="2.4"
        strokeDasharray="7 14"
        className="ot-urine-stream-flow"
        filter="url(#urine-glow)"
      />
      <path
        d="M 258 185 Q 245 240, 228 300 Q 218 335, 215 365"
        fill="none"
        stroke={urineColor}
        strokeWidth="2.4"
        strokeDasharray="7 14"
        className="ot-urine-stream-flow"
        filter="url(#urine-glow)"
        style={{ animationDelay: "-0.5s" }}
      />
    </svg>
  );
}

/* 3. PANCREAS: Endocrine Islet Biosynthesis & Insulin Appearance Wave */
function PancreasIsletOverlay({ telemetry }: { telemetry?: KineticTelemetry }) {
  const secretionColor = telemetry?.pancreas?.stressColor || "#00e5ff";

  const islets = [
    { cx: 145, cy: 215, r: 11, delay: 0 },
    { cx: 185, cy: 200, r: 10, delay: 0.6 },
    { cx: 230, cy: 185, r: 10.5, delay: 1.2 },
    { cx: 275, cy: 168, r: 9, delay: 1.8 },
  ];

  return (
    <svg className="ot-organ-overlay-svg" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid meet">
      <defs>
        <filter id="islet-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Pancreatic Duct Conduit */}
      <path
        d="M 285 165 Q 230 185, 185 200 Q 155 210, 135 220"
        fill="none"
        stroke={secretionColor}
        strokeWidth="1.2"
        strokeDasharray="3 4"
        opacity="0.3"
      />

      {/* Secretory Pulse Flux Stream along Duct */}
      <path
        d="M 285 165 Q 230 185, 185 200 Q 155 210, 135 220"
        fill="none"
        stroke={secretionColor}
        strokeWidth="2"
        strokeDasharray="6 16"
        className="ot-insulin-flux-stream"
        filter="url(#islet-glow)"
      />

      {/* Islets of Langerhans Beta-Cell Clusters with Pulsing Concentric Halos */}
      {islets.map((islet, i) => (
        <g key={`islet-${i}`}>
          <circle
            cx={islet.cx}
            cy={islet.cy}
            r={islet.r}
            fill="none"
            stroke={secretionColor}
            strokeWidth="1.3"
            className="ot-islet-pulse-ring"
            style={{ animationDelay: `${islet.delay}s` }}
          />
          <circle cx={islet.cx} cy={islet.cy} r="3" fill={secretionColor} filter="url(#islet-glow)" />
          <circle cx={islet.cx} cy={islet.cy} r="1.1" fill="#ffffff" />
        </g>
      ))}
    </svg>
  );
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

  const organAnimClass = `ot-anim-${organ}`;
  const pulseDuration =
    organ === "heart"
      ? (telemetry?.heart?.pulseDurationSec || 0.82)
      : undefined;

  const organStyle = pulseDuration
    ? {
        animationDuration: `${pulseDuration}s`,
        transformOrigin: "50% 50%",
      }
    : { transformOrigin: "50% 50%" };

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

      {/* 3. Centered Functional Animated Organ Stage with Micro-Animation Overlay */}
      <div className={`ot-organ-stage-wrapper ${organAnimClass}`} style={organStyle}>
        {!failed ? (
          <img
            className="ot-organ-artwork ot-organ-img-centered"
            src={`/diagnostics/${organ === "brain" ? "brain" : `${organ}-atlas`}.png`}
            alt={`Illustrative ${organInfo[organ].name.toLowerCase()} anatomy`}
            onError={() => setFailed(true)}
          />
        ) : organ === "pancreas" ? (
          <div className="ot-organ-img-centered">
            <PancreasArtwork />
          </div>
        ) : organ === "brain" ? (
          <div className="ot-organ-img-centered">
            <BrainMap compact />
          </div>
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

        {/* Functional Micro-Animation Overlays */}
        {organ === "brain" && <BrainNeuronOverlay telemetry={telemetry} />}
        {organ === "kidneys" && <KidneysUrineOverlay telemetry={telemetry} />}
        {organ === "pancreas" && <PancreasIsletOverlay telemetry={telemetry} />}
      </div>
    </div>
  );
}
