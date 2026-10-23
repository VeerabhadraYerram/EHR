import type { Patient, Reading } from "./types";

export interface KineticTelemetry {
  glucose: number;
  velocity: number;
  trendArrow: "↑↑" | "↑" | "→" | "↓" | "↓↓";
  statusColor: string;
  statusTier: "HYPOGLYCEMIA" | "EUGLYCEMIA" | "ELEVATED" | "ACUTE SPIKE";
  timeLabel: string;
  
  // Pancreas biophysics
  pancreas: {
    cPeptide: number;
    betaReservePct: number;
    betaDemandIndex: number;
    insulinAppearance: number; // mU/min
    stressState: "BASAL SECRETION" | "COMPENSATED HYPERSECRETION" | "SECRETORY EXHAUSTION WARNING";
    stressColor: string;
    isExhaustion: boolean;
  };

  // Hepatic biophysics (Liver)
  liver: {
    onMetformin: boolean;
    egpRate: number; // mg/kg/min
    state: "EGP SUPPRESSED (POSTPRANDIAL)" | "EGP SUPPRESSED (METFORMIN)" | "GLUCONEOGENESIS ACTIVE";
    storagePct: number;
    stateColor: string;
  };

  // Gut kinetics (Hovorka absorption)
  gut: {
    isMealActive: boolean;
    mealCarbs: number;
    minutesSinceMeal: number;
    absorptionRate: number; // mg/min
    status: string;
    gutColor: string;
  };

  // Renal biophysics (Kidneys)
  kidneys: {
    egfr: number;
    creatinine: number;
    isSaturated: boolean;
    glycosuriaRate: number; // mg/min
    filtrationSpeedSec: number;
    sglt2Status: "100% REABSORPTION" | "RENAL THRESHOLD BREACHED (GLYCOSURIA)";
    sglt2Color: string;
    ckdStage: string;
  };

  // Cardiovascular biophysics (Heart)
  heart: {
    heartRate: number; // bpm
    pulseDurationSec: number;
    vascularShearStress: number; // 0-100%
    cardioStatus: "HEMODYNAMIC HOMEOSTASIS" | "MODERATE VASCULAR TENSION" | "ELEVATED SHEAR STRESS";
    stressColor: string;
  };

  // Neurological biophysics (Brain)
  brain: {
    interstitialSensor: number;
    dawnPhenomenon: boolean;
    hypoAlarm: boolean;
    hyperAlarm: boolean;
    brainStatus: "AUTONOMIC HOMEOSTASIS" | "DAWN COUNTER-REGULATION" | "NEUROGLYCOPENIC RISK" | "HYPERGLYCEMIC SOMNOLENCE";
    brainColor: string;
  };
}

export function computeKineticTelemetry(
  patient?: Patient,
  reading?: Reading,
  prevReading?: Reading,
): KineticTelemetry {
  const glucose = reading?.glucose_mg_dl ?? 120;
  const prevG = prevReading?.glucose_mg_dl ?? glucose;
  // Change over 30 min (0.5 hour)
  const velocity = Math.round(((glucose - prevG) / 0.5) * 10) / 10;

  // Trend direction
  const trendArrow: "↑↑" | "↑" | "→" | "↓" | "↓↓" =
    velocity > 40 ? "↑↑" : velocity > 15 ? "↑" : velocity < -40 ? "↓↓" : velocity < -15 ? "↓" : "→";

  // Glycemic tier & theme color
  let statusTier: "HYPOGLYCEMIA" | "EUGLYCEMIA" | "ELEVATED" | "ACUTE SPIKE" = "EUGLYCEMIA";
  let statusColor = "#00e5ff"; // Bioluminescent cyan

  if (glucose < 70) {
    statusTier = "HYPOGLYCEMIA";
    statusColor = "#3b82f6"; // Alert blue
  } else if (glucose >= 180) {
    statusTier = "ACUTE SPIKE";
    statusColor = "#ef4444"; // Alarm red
  } else if (glucose >= 140) {
    statusTier = "ELEVATED";
    statusColor = "#f59e0b"; // Warning amber
  } else {
    statusTier = "EUGLYCEMIA";
    statusColor = "#34d399"; // Optimal emerald / cyan
  }

  // --- 1. PANCREAS KINETICS ---
  const cPeptide = Number(patient?.fasting_c_peptide_nmol_l ?? 0.65);
  const betaReservePct = Math.min(100, Math.max(12, Math.round((cPeptide / 1.1) * 100)));
  // Beta demand scales with glucose elevation and low C-peptide reserve
  const betaDemandIndex = Math.min(
    250,
    Math.round((glucose / 100) * (0.75 / Math.max(0.18, cPeptide)) * 100),
  );

  const isExhaustion = glucose >= 180 && cPeptide < 0.45;
  const isCompensating = glucose > 135 || betaDemandIndex > 115;
  const pancreasStress: KineticTelemetry["pancreas"]["stressState"] = isExhaustion
    ? "SECRETORY EXHAUSTION WARNING"
    : isCompensating
    ? "COMPENSATED HYPERSECRETION"
    : "BASAL SECRETION";

  const pancreasStressColor = isExhaustion ? "#ef4444" : isCompensating ? "#f59e0b" : "#34d399";
  // Hovorka insulin secretion model appearance
  const insulinAppearance =
    glucose > 95
      ? Math.round(((glucose - 95) * 0.14 * (cPeptide / 0.6) + 3.2) * 10) / 10
      : 2.8;

  // --- 2. HEPATIC KINETICS (LIVER) ---
  const onMetformin =
    patient?.on_metformin === "yes" ||
    patient?.on_metformin === 1 ||
    (Array.isArray((patient as any)?.medications) &&
      (patient as any).medications.some((m: string) => m.toLowerCase().includes("metformin")));

  // Endogenous Glucose Production (EGP) in mg/kg/min:
  // Basal fasting ~1.8 - 2.0; suppressed postprandially by insulin to ~0.4; Metformin provides 25-35% suppression
  let egpRate = onMetformin ? (glucose > 140 ? 0.35 : 1.15) : glucose > 140 ? 0.65 : 1.85;
  egpRate = Math.round(egpRate * 100) / 100;

  const liverState: KineticTelemetry["liver"]["state"] =
    glucose > 150
      ? "EGP SUPPRESSED (POSTPRANDIAL)"
      : onMetformin
      ? "EGP SUPPRESSED (METFORMIN)"
      : "GLUCONEOGENESIS ACTIVE";

  const liverColor =
    liverState === "GLUCONEOGENESIS ACTIVE"
      ? "#f59e0b"
      : onMetformin
      ? "#34d399"
      : "#00e5ff";

  const storagePct = Math.min(100, Math.max(20, Math.round(40 + (glucose / 250) * 55)));

  // --- 3. GUT ABSORPTION KINETICS ---
  const mealCarbs = reading?.meal_carbs_g ?? 0;
  const minsSinceMeal = reading?.minutes_since_meal ?? (mealCarbs > 0 ? 30 : 999);
  const isMealActive = mealCarbs > 0 || minsSinceMeal < 180;

  // Ra(t) Hovorka gut absorption model: peak at ~40-50m postprandial
  let absorptionRate = 0.0;
  if (isMealActive && minsSinceMeal < 180) {
    const peakTime = 45;
    const factor = Math.exp(-Math.pow(minsSinceMeal - peakTime, 2) / (2 * 40 * 40));
    absorptionRate = Math.round((factor * (mealCarbs / 15 + 2.5)) * 10) / 10;
  }
  const gutStatus = isMealActive
    ? `ACTIVE DIGESTION (${mealCarbs > 0 ? `${mealCarbs}g carbs` : "Post-Meal"})`
    : "POST-ABSORPTIVE / BASAL";
  const gutColor = isMealActive ? "#f59e0b" : "#64748b";

  // --- 4. RENAL KINETICS (KIDNEYS) ---
  const egfr = Number(patient?.egfr ?? 90);
  const creatinine = Number(patient?.creatinine_mg_dl ?? 0.88);
  const isSaturated = glucose >= 180;
  // Glycosuria occurs above 180 mg/dL renal threshold
  const glycosuriaRate = isSaturated
    ? Math.round(((glucose - 180) * (egfr / 100) * 0.12) * 10) / 10
    : 0.0;

  // Glomerular filtration animation speed (faster with normal eGFR ~90, slower with CKD)
  const filtrationSpeedSec = Math.max(0.8, Math.min(3.5, 2.5 - (egfr - 60) * 0.02));

  const ckdStage =
    egfr >= 90
      ? "Stage 1 (Normal / High GFR)"
      : egfr >= 60
      ? "Stage 2 (Mild GFR Reduction)"
      : egfr >= 45
      ? "Stage 3a (Moderate GFR Reduction)"
      : "Stage 3b+ (Advanced GFR Reduction)";

  const sglt2Status: KineticTelemetry["kidneys"]["sglt2Status"] = isSaturated
    ? "RENAL THRESHOLD BREACHED (GLYCOSURIA)"
    : "100% REABSORPTION";
  const sglt2Color = isSaturated ? "#ef4444" : "#00e5ff";

  // --- 5. CARDIOVASCULAR KINETICS (HEART) ---
  // Sympathetic tone scales with acute rate of change and severe hyperglycemic/hypoglycemic stress
  const baseHR = 72;
  const velocityStress = Math.min(22, Math.max(-6, Math.round(velocity * 0.22)));
  const acuteStress = glucose >= 180 ? 10 : glucose < 70 ? 14 : 0;
  const heartRate = Math.max(58, Math.min(115, baseHR + velocityStress + acuteStress));
  const pulseDurationSec = Math.round((60 / heartRate) * 100) / 100;

  // Endothelial vascular shear stress (high variability + high glucose increases shear stress)
  const vascularShearStress = Math.min(
    100,
    Math.round(35 + (glucose / 280) * 35 + (Math.abs(velocity) / 50) * 30),
  );

  const cardioStatus: KineticTelemetry["heart"]["cardioStatus"] =
    vascularShearStress > 75
      ? "ELEVATED SHEAR STRESS"
      : vascularShearStress > 55
      ? "MODERATE VASCULAR TENSION"
      : "HEMODYNAMIC HOMEOSTASIS";

  const cardioColor =
    cardioStatus === "ELEVATED SHEAR STRESS"
      ? "#ef4444"
      : cardioStatus === "MODERATE VASCULAR TENSION"
      ? "#f59e0b"
      : "#34d399";

  // --- 6. NEUROLOGICAL BIOPHYSICS (BRAIN) ---
  const timeStr = reading?.time || reading?.reading_time?.slice(11, 16) || "12:00";
  const hour = parseInt(timeStr.split(":")[0], 10);
  const dawnPhenomenon = hour >= 5 && hour <= 8 && velocity >= 5;
  const hypoAlarm = glucose < 70;
  const hyperAlarm = glucose >= 180;

  let brainStatus: KineticTelemetry["brain"]["brainStatus"] = "AUTONOMIC HOMEOSTASIS";
  let brainColor = "#00e5ff";

  if (hypoAlarm) {
    brainStatus = "NEUROGLYCOPENIC RISK";
    brainColor = "#3b82f6";
  } else if (dawnPhenomenon) {
    brainStatus = "DAWN COUNTER-REGULATION";
    brainColor = "#f59e0b";
  } else if (hyperAlarm) {
    brainStatus = "HYPERGLYCEMIC SOMNOLENCE";
    brainColor = "#ef4444";
  }

  return {
    glucose,
    velocity,
    trendArrow,
    statusColor,
    statusTier,
    timeLabel: timeStr,
    pancreas: {
      cPeptide,
      betaReservePct,
      betaDemandIndex,
      insulinAppearance,
      stressState: pancreasStress,
      stressColor: pancreasStressColor,
      isExhaustion,
    },
    liver: {
      onMetformin,
      egpRate,
      state: liverState,
      storagePct,
      stateColor: liverColor,
    },
    gut: {
      isMealActive,
      mealCarbs,
      minutesSinceMeal: minsSinceMeal,
      absorptionRate,
      status: gutStatus,
      gutColor,
    },
    kidneys: {
      egfr,
      creatinine,
      isSaturated,
      glycosuriaRate,
      filtrationSpeedSec,
      sglt2Status,
      sglt2Color,
      ckdStage,
    },
    heart: {
      heartRate,
      pulseDurationSec,
      vascularShearStress,
      cardioStatus,
      stressColor: cardioColor,
    },
    brain: {
      interstitialSensor: Math.round(glucose),
      dawnPhenomenon,
      hypoAlarm,
      hyperAlarm,
      brainStatus,
      brainColor,
    },
  };
}
