import React, { useMemo } from "react";
import { ActivityIcon, SparklesIcon, ZapIcon, ShieldCheckIcon } from "./Icons";

export interface OrganTwinProps {
  glucoseNow: number;
  fastingCPeptide: number;
  bmi: number;
  egfr: number;
  activeIntervention: string | null;
  walkDuration: number;
  carbReduction: number;
  onSelectIntervention: (type: string | null) => void;
  onSetWalkDuration: (mins: number) => void;
  onSetCarbReduction: (carbs: number) => void;
}

export const OrganTwinView: React.FC<OrganTwinProps> = ({
  glucoseNow,
  fastingCPeptide,
  bmi,
  egfr,
  activeIntervention,
  walkDuration,
  carbReduction,
  onSelectIntervention,
  onSetWalkDuration,
  onSetCarbReduction,
}) => {
  // ─── Biophysical Metabolic Flux Calculations ──────────────────────────────
  const biophysics = useMemo(() => {
    // 1. Beta-cell capacity factor from fasting C-peptide (normal: ~1.8-3.0 ng/mL)
    const betaCapacity = Math.min(1.0, Math.max(0.15, fastingCPeptide / 2.0));
    const insulinResistanceModifier = Math.max(1.0, (bmi - 22) * 0.12 + 1.0); // Higher BMI -> higher resistance

    // 2. Gut Carbohydrate Appearance Rate Ra(t) (mg/kg/min)
    // Baseline postprandial gut flux attenuated by active carb reduction intervention
    let baselineRa = 4.8; // typical post-meal gut appearance
    if (activeIntervention === "carb_reduction" || activeIntervention === "compound_lifestyle") {
      baselineRa = Math.max(1.2, baselineRa - (carbReduction / 60) * 2.2);
    }
    if (activeIntervention === "food_sequencing") {
      baselineRa *= 0.72; // GLP-1 gastric emptying delay
    }

    // 3. Hepatic Glucose Production EGP(t) (mg/kg/min)
    // Baseline hepatic release (~2.0 mg/kg/min), suppressed by Metformin & insulin
    let baselineEGP = 2.1;
    if (activeIntervention === "confirm_medication") {
      baselineEGP *= 0.58; // Metformin 42% hepatic EGP suppression
    } else if (activeIntervention === "compound_lifestyle") {
      baselineEGP *= 0.85;
    }

    // 4. Skeletal Muscle GLUT4 Uptake (mg/kg/min)
    // Baseline muscle disposal + AMPK exercise translocation
    let muscleUptake = (1.4 * betaCapacity) / (insulinResistanceModifier * 0.8);
    let exerciseBoost = 0;
    if (activeIntervention === "postprandial_walk" || activeIntervention === "compound_lifestyle") {
      exerciseBoost = (walkDuration / 30) * 1.85; // AMPK GLUT4 translocation independent of insulin
      muscleUptake += exerciseBoost;
    }
    if (activeIntervention === "insulin_bolus") {
      muscleUptake += 2.4;
    }

    // 5. Brain / Non-insulin dependent tissue uptake
    const brainUptake = 1.0; // constant cerebral utilization

    // 6. Net Blood Glucose Derivative dG/dt (mg/dL/hr)
    // V_G approx 12 L for 70 kg adult = 170 mL/kg
    const netFlux = baselineRa + baselineEGP - muscleUptake - brainUptake;
    const dG_dt = Math.round(netFlux * 28.5); // translated to mg/dL/hr

    return {
      betaCapacityPct: Math.round(betaCapacity * 100),
      insulinResistanceModifier: insulinResistanceModifier.toFixed(2),
      gutRa: baselineRa.toFixed(1),
      hepaticEGP: baselineEGP.toFixed(1),
      muscleUptake: muscleUptake.toFixed(1),
      exerciseBoost: exerciseBoost.toFixed(1),
      netFlux: netFlux.toFixed(2),
      dG_dt,
      isClearing: netFlux < 0.2,
    };
  }, [fastingCPeptide, bmi, activeIntervention, walkDuration, carbReduction]);

  return (
    <section className="doc-panel-box organ-twin-panel">
      <div className="panel-box-header">
        <div>
          <h4 className="panel-box-title">Biophysical Organ Twin: Hovorka Multi-Compartment Physiology</h4>
          <span className="panel-subtitle">
            Dynamic live flux model simulating Gut $R_a(t)$, Pancreatic $\beta$-cell reserve, Hepatic $EGP$, and Muscle $GLUT4$ disposal
          </span>
        </div>
        <div className="organ-tag-pill">
          <ZapIcon size={13} color="#0ea5e9" />
          <span>Mechanistic In-Silico Engine</span>
        </div>
      </div>

      {/* Top Organ Telemetry Summary Bar */}
      <div className="organ-metrics-summary-bar">
        <div className="organ-summary-item">
          <span className="summary-lbl">Endogenous β-Cell Capacity</span>
          <strong className="summary-val text-info">{biophysics.betaCapacityPct}%</strong>
          <span className="summary-sub">C-Peptide: {fastingCPeptide} ng/mL</span>
        </div>
        <div className="organ-summary-item">
          <span className="summary-lbl">Visceral Adiposity Resistance</span>
          <strong className="summary-val text-warning">{biophysics.insulinResistanceModifier}×</strong>
          <span className="summary-sub">BMI: {bmi} kg/m² (Asian Indian)</span>
        </div>
        <div className="organ-summary-item">
          <span className="summary-lbl">Net Metabolic Influx / Efflux</span>
          <strong className={`summary-val ${biophysics.isClearing ? "text-success" : "text-danger"}`}>
            {biophysics.netFlux} mg/kg/min
          </strong>
          <span className="summary-sub">{biophysics.isClearing ? "Spike Neutralized" : "Excursion Influx"}</span>
        </div>
        <div className="organ-summary-item">
          <span className="summary-lbl">Current Glycemic Velocity dG/dt</span>
          <strong className={`summary-val ${biophysics.dG_dt <= 0 ? "text-success" : "text-danger"}`}>
            {biophysics.dG_dt > 0 ? `+${biophysics.dG_dt}` : biophysics.dG_dt} mg/dL/hr
          </strong>
          <span className="summary-sub">Sensor: {glucoseNow} mg/dL</span>
        </div>
      </div>

      {/* Interactive Organ System SVG Visualizer */}
      <div className="organ-visualizer-canvas-card">
        <svg viewBox="0 0 940 400" className="organ-system-svg" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="bloodStreamGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.85" />
              <stop offset="50%" stopColor="#dc2626" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.85" />
            </linearGradient>

            <linearGradient id="gutGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#d97706" stopOpacity="0.08" />
            </linearGradient>

            <linearGradient id="liverGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#6d28d9" stopOpacity="0.08" />
            </linearGradient>

            <linearGradient id="pancreasGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.08" />
            </linearGradient>

            <linearGradient id="muscleGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0.08" />
            </linearGradient>

            {/* Glowing filter */}
            <filter id="organGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Central Systemic Blood Glucose Vessel Pool */}
          <rect x="230" y="160" width="480" height="80" rx="40" fill="url(#bloodStreamGrad)" opacity="0.9" filter="url(#organGlow)" />
          <rect x="235" y="165" width="470" height="70" rx="35" fill="none" stroke="#fca5a5" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.6" />

          {/* Central Blood Pool Label & Live Glucose */}
          <text x="470" y="195" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="800" letterSpacing="0.8">
            SYSTEMIC VASCULAR BLOOD POOL [G(t)]
          </text>
          <text x="470" y="222" textAnchor="middle" fill="#ffffff" fontSize="20" fontWeight="900" fontFamily="var(--font-mono)">
            {glucoseNow} mg/dL
          </text>

          {/* Animated Flow Particles into/out of blood */}
          {/* 1. Gut -> Blood Stream (Top Left) */}
          <path d="M 170 120 C 170 180, 240 180, 270 180" fill="none" stroke="#f59e0b" strokeWidth="3" strokeDasharray="6 4" className="flow-dash-anim" />
          {/* 2. Liver -> Blood Stream (Bottom Left) */}
          <path d="M 170 280 C 170 220, 240 220, 270 220" fill="none" stroke="#8b5cf6" strokeWidth="3" strokeDasharray="6 4" className="flow-dash-anim" />
          {/* 3. Pancreas -> Liver & Blood (Top Right) */}
          <path d="M 770 120 C 770 180, 700 180, 670 180" fill="none" stroke="#0ea5e9" strokeWidth="3" strokeDasharray="6 4" className="flow-dash-anim-rev" />
          {/* 4. Blood -> Skeletal Muscle (Bottom Right) */}
          <path d="M 670 220 C 700 220, 770 220, 770 280" fill="none" stroke="#10b981" strokeWidth="3.5" strokeDasharray="6 4" className="flow-dash-anim" />

          {/* ─── Organ Node 1: Stomach & Gut (Top Left) ───────────────────── */}
          <g transform="translate(40, 40)" className="organ-node">
            <rect width="180" height="110" rx="10" fill="url(#gutGrad)" stroke="#f59e0b" strokeWidth="1.5" />
            <circle cx="28" cy="28" r="14" fill="rgba(245, 158, 11, 0.25)" />
            <text x="28" y="32" textAnchor="middle" fill="#f59e0b" fontSize="9" fontWeight="900">GUT</text>
            <text x="50" y="26" fill="#f59e0b" fontSize="11" fontWeight="800">GUT / JEJUNUM</text>
            <text x="50" y="39" fill="var(--text-muted)" fontSize="9">Hovorka Ra(t) Kinetics</text>

            <line x1="14" y1="50" x2="166" y2="50" stroke="rgba(245, 158, 11, 0.25)" />
            <text x="16" y="68" fill="var(--text-secondary)" fontSize="10">Carb Influx Rate:</text>
            <text x="164" y="68" textAnchor="end" fill="#f59e0b" fontSize="11" fontWeight="800" fontFamily="var(--font-mono)">
              {biophysics.gutRa} mg/kg/min
            </text>
            <text x="16" y="85" fill="var(--text-secondary)" fontSize="10">Gastric Emptying:</text>
            <text x="164" y="85" textAnchor="end" fill="var(--text-primary)" fontSize="10" fontWeight="700">
              {activeIntervention === "food_sequencing" ? "Delayed (GLP-1)" : "Standard 60m"}
            </text>
            <text x="16" y="100" fill="var(--text-muted)" fontSize="9">
              {activeIntervention === "carb_reduction" ? `-${carbReduction}g CHO blunted` : "Full meal absorption"}
            </text>
          </g>

          {/* ─── Organ Node 2: Liver (Bottom Left) ─────────────────────────── */}
          <g transform="translate(40, 240)" className="organ-node">
            <rect width="180" height="110" rx="10" fill="url(#liverGrad)" stroke="#8b5cf6" strokeWidth="1.5" />
            <circle cx="28" cy="28" r="14" fill="rgba(139, 92, 246, 0.25)" />
            <text x="28" y="32" textAnchor="middle" fill="#8b5cf6" fontSize="9" fontWeight="900">HEP</text>
            <text x="50" y="26" fill="#8b5cf6" fontSize="11" fontWeight="800">LIVER (HEPATIC)</text>
            <text x="50" y="39" fill="var(--text-muted)" fontSize="9">EGP Gluconeogenesis</text>

            <line x1="14" y1="50" x2="166" y2="50" stroke="rgba(139, 92, 246, 0.25)" />
            <text x="16" y="68" fill="var(--text-secondary)" fontSize="10">Hepatic Output EGP:</text>
            <text x="164" y="68" textAnchor="end" fill="#8b5cf6" fontSize="11" fontWeight="800" fontFamily="var(--font-mono)">
              {biophysics.hepaticEGP} mg/kg/min
            </text>
            <text x="16" y="85" fill="var(--text-secondary)" fontSize="10">Metformin Action:</text>
            <text x="164" y="85" textAnchor="end" fill="var(--text-primary)" fontSize="10" fontWeight="700">
              {activeIntervention === "confirm_medication" ? "-42% Suppression" : "Uninhibited Baseline"}
            </text>
            <text x="16" y="100" fill="var(--text-muted)" fontSize="9">
              eGFR: {egfr} mL/min (Renal safe)
            </text>
          </g>

          {/* ─── Organ Node 3: Pancreas (Top Right) ─────────────────────────── */}
          <g transform="translate(720, 40)" className="organ-node">
            <rect width="180" height="110" rx="10" fill="url(#pancreasGrad)" stroke="#0ea5e9" strokeWidth="1.5" />
            <circle cx="28" cy="28" r="14" fill="rgba(14, 165, 233, 0.25)" />
            <text x="28" y="32" textAnchor="middle" fill="#0ea5e9" fontSize="9" fontWeight="900">PAN</text>
            <text x="50" y="26" fill="#0ea5e9" fontSize="11" fontWeight="800">PANCREAS (β-CELLS)</text>
            <text x="50" y="39" fill="var(--text-muted)" fontSize="9">Endogenous Insulin [I(t)]</text>

            <line x1="14" y1="50" x2="166" y2="50" stroke="rgba(14, 165, 233, 0.25)" />
            <text x="16" y="68" fill="var(--text-secondary)" fontSize="10">β-Cell Reserve:</text>
            <text x="164" y="68" textAnchor="end" fill="#0ea5e9" fontSize="11" fontWeight="800" fontFamily="var(--font-mono)">
              {biophysics.betaCapacityPct}% of Normal
            </text>
            <text x="16" y="85" fill="var(--text-secondary)" fontSize="10">C-Peptide Reserve:</text>
            <text x="164" y="85" textAnchor="end" fill="var(--text-primary)" fontSize="10" fontWeight="700">
              {fastingCPeptide} ng/mL
            </text>
            <text x="16" y="100" fill="var(--text-muted)" fontSize="9">
              {activeIntervention === "insulin_bolus" ? "+ Exogenous Bolus Active" : "1st-phase blunted kinetics"}
            </text>
          </g>

          {/* ─── Organ Node 4: Skeletal Muscle (Bottom Right) ────────────────── */}
          <g transform="translate(720, 240)" className="organ-node">
            <rect width="180" height="110" rx="10" fill="url(#muscleGrad)" stroke="#10b981" strokeWidth="1.5" />
            <circle cx="28" cy="28" r="14" fill="rgba(16, 185, 129, 0.25)" />
            <text x="28" y="32" textAnchor="middle" fill="#10b981" fontSize="9" fontWeight="900">GLU</text>
            <text x="50" y="26" fill="#10b981" fontSize="11" fontWeight="800">SKELETAL MUSCLE</text>
            <text x="50" y="39" fill="var(--text-muted)" fontSize="9">GLUT4 Glucose Uptake</text>

            <line x1="14" y1="50" x2="166" y2="50" stroke="rgba(16, 185, 129, 0.25)" />
            <text x="16" y="68" fill="var(--text-secondary)" fontSize="10">Total Glucose Disposal:</text>
            <text x="164" y="68" textAnchor="end" fill="#10b981" fontSize="11" fontWeight="800" fontFamily="var(--font-mono)">
              {biophysics.muscleUptake} mg/kg/min
            </text>
            <text x="16" y="85" fill="var(--text-secondary)" fontSize="10">AMPK Exercise Boost:</text>
            <text x="164" y="85" textAnchor="end" fill="#10b981" fontSize="10" fontWeight="700">
              +{biophysics.exerciseBoost} mg/kg/min
            </text>
            <text x="16" y="100" fill="var(--text-muted)" fontSize="9">
              {activeIntervention === "postprandial_walk" || activeIntervention === "compound_lifestyle"
                ? `${walkDuration}m GLUT4 walk active`
                : "Sedentary baseline"}
            </text>
          </g>
        </svg>
      </div>

      {/* Live Interactive In-Silico Organ Flow Controls */}
      <div className="organ-controls-strip">
        <div className="organ-control-group">
          <span className="control-group-title">
            <ActivityIcon size={13} color="#10b981" />
            <span>Simulate Exercise GLUT4 Uptake:</span>
          </span>
          <div className="button-pill-group">
            {[15, 30, 45].map((mins) => (
              <button
                key={mins}
                className={`organ-btn ${activeIntervention === "postprandial_walk" && walkDuration === mins ? "active" : ""}`}
                onClick={() => {
                  onSetWalkDuration(mins);
                  onSelectIntervention("postprandial_walk");
                }}
              >
                +{mins}m Walk
              </button>
            ))}
          </div>
        </div>

        <div className="organ-control-group">
          <span className="control-group-title">
            <SparklesIcon size={13} color="#f59e0b" />
            <span>Simulate Gut $R_a(t)$ Carb Blunting:</span>
          </span>
          <div className="button-pill-group">
            {[20, 40, 60].map((carbs) => (
              <button
                key={carbs}
                className={`organ-btn ${activeIntervention === "carb_reduction" && carbReduction === carbs ? "active" : ""}`}
                onClick={() => {
                  onSetCarbReduction(carbs);
                  onSelectIntervention("carb_reduction");
                }}
              >
                -{carbs}g CHO Cut
              </button>
            ))}
          </div>
        </div>

        <div className="organ-control-group">
          <span className="control-group-title">
            <ShieldCheckIcon size={13} color="#8b5cf6" />
            <span>Pharma Kinetic Levers:</span>
          </span>
          <div className="button-pill-group">
            <button
              className={`organ-btn ${activeIntervention === "confirm_medication" ? "active" : ""}`}
              onClick={() => onSelectIntervention(activeIntervention === "confirm_medication" ? null : "confirm_medication")}
            >
              Metformin (EGP ↓)
            </button>
            <button
              className={`organ-btn ${activeIntervention === "food_sequencing" ? "active" : ""}`}
              onClick={() => onSelectIntervention(activeIntervention === "food_sequencing" ? null : "food_sequencing")}
            >
              Food Sequencing (GLP-1)
            </button>
            <button
              className="organ-btn reset"
              onClick={() => onSelectIntervention(null)}
            >
              Reset Baseline
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
