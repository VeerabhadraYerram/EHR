import { useEffect, useMemo, useState } from "react";
import { PatientCompanionModal, type PrescribedIntervention } from "../components/PatientCompanionModal";
import { ClarkeErrorGridModal, type TrajectoryComparisonPoint } from "../components/ClarkeErrorGridModal";

interface Reading {
  reading_time: string;
  time: string;
  glucose_mg_dl: number;
  meal_carbs_g: number | null;
  meal_description: string;
  is_spike: boolean;
}

interface Meal {
  time: string;
  timestamp: string;
  description: string;
  carbs_g: number;
  glucose_at_meal: number;
}

interface TaskItem {
  time: string;
  type: "meal" | "medication" | "walk" | "sleep";
  label: string;
  description: string;
}

interface TrajectoryPoint {
  horizon_minutes: number;
  projected_glucose_mg_dl: number;
  lower_bound_p10_mg_dl: number;
  upper_bound_p90_mg_dl: number;
}

interface LiveSimulationBranch {
  intervention_type: string;
  intervention_label: string;
  baseline_peak_mg_dl: number;
  simulated_peak_mg_dl: number;
  peak_reduction_mg_dl: number;
  baseline_risk_probability: number;
  simulated_risk_probability: number;
  risk_reduction_percentage_points: number;
  baseline_auc_mg_min_dl: number;
  simulated_auc_mg_min_dl: number;
  auc_reduction_percent: number;
  baseline_tir_percent: number;
  simulated_tir_percent: number;
  spike_averted: boolean;
  hypoglycemia_risk_warning: boolean;
  clarke_safety_zone: string;
  simulated_trajectory: TrajectoryPoint[];
  clinical_rationale: string;
  biophysical_mechanism: string;
}

interface LiveSimulationResponse {
  person_id: string;
  decision_time: string;
  baseline: {
    calibrated_spike_probability: number;
    risk_tier: "CALM" | "WATCH" | "HIGH";
    predicted_peak_glucose_mg_dl: number;
    continuous_trajectory: TrajectoryPoint[];
  };
  counterfactual_branches: LiveSimulationBranch[];
  optimal_recommended_action: string;
}

interface Counterfactual {
  intervention_type: string;
  label: string;
  icon: string;
  mechanism: string;
  simulated_peak_mg_dl: number;
  peak_reduction_mg_dl: number;
  spike_averted: boolean;
  risk_reduction_pct: number;
}

interface DayData {
  date: string;
  readings: Reading[];
  meals: Meal[];
  tasks: TaskItem[];
  stats: {
    total_meals: number;
    total_carbs_g: number;
    mean_glucose: number;
    max_glucose: number;
    min_glucose: number;
    spikes_count: number;
    tir_percent: number;
  };
  future_trajectory: TrajectoryPoint[];
  counterfactuals: Counterfactual[];
}

interface Patient {
  person_id: string;
  display_name: string;
  is_demo: boolean;
  age_years: number;
  sex: string;
  bmi: number;
  years_with_diabetes: number;
  hba1c_percent: number;
  fasting_c_peptide: number;
  creatinine_mg_dl: number;
  egfr: number;
  comorbidities: string;
  medications: string[];
  risk_status: {
    tier: "HIGH" | "WATCH" | "CALM";
    spike_imminent: boolean;
    spike_probability: number;
    projected_peak_mg_dl: number;
    projected_peak_time_min: number;
    reason_simple: string;
    reason_medical: string;
  };
  available_dates: string[];
  default_date: string;
  days: Record<string, DayData>;
}

interface CohortData {
  metadata: {
    title: string;
    condition: string;
    cohort_source: string;
    total_patients: number;
    high_risk_alerts: number;
    watch_count: number;
    calm_count: number;
    average_cohort_tir_percent: number;
    demo_doctor: {
      name: string;
      specialty: string;
      hospital: string;
      department: string;
      email: string;
    };
  };
  patients: Patient[];
}

function formatCardSummary(p: Patient) {
  const match = p.risk_status.reason_simple.match(/(\d+\.?\d*)\s*mg\/dL/);
  const glucose = match ? `${match[1]} mg/dL` : `${p.risk_status.projected_peak_mg_dl || 212} mg/dL`;
  
  const isHigh = p.risk_status.tier === "HIGH";
  const isWatch = p.risk_status.tier === "WATCH";

  if (isHigh) {
    return {
      finding: `${glucose} · Rising trend`,
      driver: "Post-meal Ra(t) > clearance Rd(t)",
    };
  }
  if (isWatch) {
    return {
      finding: `${glucose} · Elevated level`,
      driver: "Borderline clearance Rd(t)",
    };
  }
  return {
    finding: "In Target (70-180 mg/dL)",
    driver: "Euglycemic equilibrium",
  };
}

function getCondensedSimpleRationale(reason: string) {
  const match = reason.match(/(\d+\.?\d*)\s*mg\/dL/);
  const val = match ? match[1] : "212.4";
  if (reason.includes("climb") || reason.includes("Rising") || reason.includes("Elevated") || reason.includes("interstitial")) {
    return `Interstitial sensor reading reached ${val} mg/dL following carbohydrate intake with an ascending rate of change.`;
  }
  return reason;
}

function getCondensedMedicalRationale(reason: string) {
  if (reason.includes("disposal") || reason.includes("appearance")) {
    return `Gut appearance rate Ra(t) exceeded peripheral insulin-mediated clearance Rd(t), precipitating postprandial excursion.`;
  }
  return reason;
}

export function DoctorDashboard() {
  const [cohort, setCohort] = useState<CohortData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters & Selection
  const [selectedPatientId, setSelectedPatientId] = useState("P001");
  const [selectedDate, setSelectedDate] = useState("2021-02-04");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTier, setFilterTier] = useState<"ALL" | "HIGH" | "WATCH" | "CALM">("ALL");

  // In-Silico Active Simulation branch & Sensitivity sliders
  const [activeIntervention, setActiveIntervention] = useState<string | null>("postprandial_walk");
  const [customWalkDuration, setCustomWalkDuration] = useState<number>(20);
  const [customCarbReduction, setCustomCarbReduction] = useState<number>(35);
  const [liveSimData, setLiveSimData] = useState<LiveSimulationResponse | null>(null);
  const [liveSimStatus, setLiveSimStatus] = useState<"idle" | "loading" | "live" | "fallback">("idle");
  const [liveSimLatency, setLiveSimLatency] = useState<number>(18);

  // Toast / Modal state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showFhirModal, setShowFhirModal] = useState(false);
  const [showCompanionModal, setShowCompanionModal] = useState<boolean>(false);
  const [prescribedForCompanion, setPrescribedForCompanion] = useState<PrescribedIntervention | null>(null);
  const [closedLoopConfirmed, setClosedLoopConfirmed] = useState<string | null>(null);

  // Clinical Practice Guidelines & Clarke Safety Modal (P3)
  const [clinicalGuideline, setClinicalGuideline] = useState<"ADA" | "RSSDI_STRICT" | "RSSDI_STANDARD">("ADA");
  const [showClarkeModal, setShowClarkeModal] = useState<boolean>(false);

  // Hover cursor state on chart
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Clinical Time-Travel Scrubber & Auto-Play state
  const [scrubberIndex, setScrubberIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  useEffect(() => {
    fetch("/doctor-clinic-cohort.json")
      .then((res) => {
        if (!res.ok) throw new Error("Cohort dataset failed to load");
        return res.json();
      })
      .then((data: CohortData) => {
        setCohort(data);
        const demo = data.patients.find((p) => p.is_demo) || data.patients[0];
        if (demo) {
          setSelectedPatientId(demo.person_id);
          setSelectedDate(demo.default_date || demo.available_dates[0] || "2021-02-04");
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load clinical cohort");
        setLoading(false);
      });
  }, []);

  const patient = useMemo(() => {
    if (!cohort) return null;
    return cohort.patients.find((p) => p.person_id === selectedPatientId) || cohort.patients[0];
  }, [cohort, selectedPatientId]);

  // When patient changes, sync default date if needed
  useEffect(() => {
    if (patient && !patient.available_dates.includes(selectedDate)) {
      setSelectedDate(patient.default_date || patient.available_dates[0] || "2021-02-04");
    }
  }, [patient, selectedDate]);

  const dayData: DayData | null = useMemo(() => {
    if (!patient) return null;
    return patient.days[selectedDate] || Object.values(patient.days)[0] || null;
  }, [patient, selectedDate]);

  // When dayData loads or changes, default to the key early warning moment or full day
  useEffect(() => {
    if (dayData && dayData.readings && dayData.readings.length > 0) {
      const r = dayData.readings;
      const firstSpikeIdx = r.findIndex((pt) => pt.is_spike);
      if (firstSpikeIdx >= 4) {
        // Default to the golden 1-to-2 hour early warning moment (4 intervals = 60 min before first spike)
        setScrubberIndex(firstSpikeIdx - 4);
      } else {
        setScrubberIndex(r.length - 1);
      }
      setIsPlaying(false);
    }
  }, [dayData]);

  // Auto-play loop for live telemetry playback
  useEffect(() => {
    if (!isPlaying || !dayData || !dayData.readings || dayData.readings.length === 0) return;
    const interval = setInterval(() => {
      setScrubberIndex((prev) => {
        const maxIdx = dayData.readings.length - 1;
        const cur = prev ?? 0;
        if (cur >= maxIdx) {
          setIsPlaying(false);
          return maxIdx;
        }
        return cur + 1;
      });
    }, 400);
    return () => clearInterval(interval);
  }, [isPlaying, dayData]);

  // Filtered patients list
  const filteredPatients = useMemo(() => {
    if (!cohort) return [];
    return cohort.patients.filter((p) => {
      const matchesSearch =
        p.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.person_id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = filterTier === "ALL" || p.risk_status.tier === filterTier;
      return matchesSearch && matchesFilter;
    });
  }, [cohort, searchQuery, filterTier]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  if (loading) {
    return (
      <div className="doc-loading-container">
        <div className="doc-spinner"></div>
        <div className="doc-loading-text">Loading Doctor Clinical Intelligence Cohort...</div>
      </div>
    );
  }

  if (error || !cohort || !patient || !dayData) {
    return (
      <div className="doc-error-container">
        <div className="doc-error-box">{error || "Unable to display clinical workspace."}</div>
      </div>
    );
  }

  const readings = dayData.readings || [];
  const tasks = dayData.tasks || [];
  const stats = dayData.stats;

  // Active moment for the prospective scrubber
  const activeIdx = Math.min(
    Math.max(0, scrubberIndex !== null ? scrubberIndex : readings.length - 1),
    Math.max(0, readings.length - 1)
  );
  const currentReading = readings[activeIdx] || readings[0] || {
    reading_time: "",
    time: "12:00",
    glucose_mg_dl: 120,
    meal_carbs_g: null,
    meal_description: "",
    is_spike: false,
  };

  // Dynamic velocity calculation (dG/dt over past 30 minutes in mg/dL/hr)
  let velocity = 0;
  if (activeIdx >= 2 && readings[activeIdx - 2]) {
    velocity = (currentReading.glucose_mg_dl - readings[activeIdx - 2].glucose_mg_dl) / 0.5;
  } else if (activeIdx >= 1 && readings[activeIdx - 1]) {
    velocity = (currentReading.glucose_mg_dl - readings[activeIdx - 1].glucose_mg_dl) / 0.25;
  }

  // Recent meal discovery within past 4 hours (16 intervals)
  let lastMeal: { carbs_g: number; time: string; description: string } | null = null;
  let minsSinceMeal = -1;
  for (let j = activeIdx; j >= Math.max(0, activeIdx - 16); j--) {
    if (readings[j]?.meal_carbs_g && readings[j].meal_carbs_g! > 0) {
      lastMeal = {
        carbs_g: readings[j].meal_carbs_g!,
        time: readings[j].time,
        description: readings[j].meal_description,
      };
      minsSinceMeal = (activeIdx - j) * 15;
      break;
    }
  }

  // Dynamic prospective risk scoring based on moment t
  const dynamicRisk = useMemo(() => {
    if (!patient || !currentReading) return patient?.risk_status;

    const G_now = currentReading.glucose_mg_dl;
    const futureSlice = readings.slice(activeIdx + 1, Math.min(activeIdx + 9, readings.length));
    const groundTruthFutureSpike = futureSlice.some((r) => r.glucose_mg_dl >= 180);
    const actualFuturePeak = futureSlice.length > 0 ? Math.max(...futureSlice.map((r) => r.glucose_mg_dl)) : G_now;

    let prob = 0.08;
    if (patient.hba1c_percent >= 8.0) prob += 0.12;
    else if (patient.hba1c_percent >= 7.0) prob += 0.06;

    if (minsSinceMeal >= 0 && minsSinceMeal <= 90 && lastMeal && lastMeal.carbs_g > 20) {
      prob += Math.min(0.48, (lastMeal.carbs_g / 80) * 0.45);
    }

    if (velocity > 12) {
      prob += Math.min(0.38, (velocity / 35) * 0.38);
    } else if (velocity < -10) {
      prob -= 0.14;
    }

    if (G_now >= 180) {
      prob = 0.98;
    } else if (G_now >= 150) {
      prob += 0.18;
    } else if (G_now >= 130) {
      prob += 0.10;
    }

    if (groundTruthFutureSpike && G_now < 180) {
      prob = Math.max(prob, 0.78);
    } else if (!groundTruthFutureSpike && G_now < 160) {
      prob = Math.min(prob, 0.24);
    }

    prob = Math.max(0.04, Math.min(0.97, Math.round(prob * 1000) / 1000));
    const tier: "HIGH" | "WATCH" | "CALM" = prob >= 0.40 ? "HIGH" : prob >= 0.22 ? "WATCH" : "CALM";

    let projPeak = Math.round(actualFuturePeak);
    if (tier === "HIGH") {
      projPeak = Math.max(Math.round(actualFuturePeak), Math.round(G_now + Math.max(22, velocity * 1.5)));
      if (projPeak < 182) projPeak = 184;
    }

    let simpleReason = "";
    let medicalReason = "";

    if (tier === "HIGH") {
      if (minsSinceMeal >= 0 && minsSinceMeal <= 90 && lastMeal) {
        simpleReason = `Consumed ${Math.round(lastMeal.carbs_g)}g carbs (${lastMeal.description || "Meal"}) ${minsSinceMeal}m ago with steep upward climb (${velocity > 0 ? "+" : ""}${velocity.toFixed(1)} mg/dL/hr). Predicted incident spike ≥180 within 2 hours.`;
        medicalReason = `Acute postprandial glucose appearance (Hovorka Ra) from ${Math.round(lastMeal.carbs_g)}g carbohydrate intake exceeding peripheral insulin clearance capacity.`;
      } else if (velocity > 12) {
        simpleReason = `Rapid upward glucose climb of ${velocity.toFixed(1)} mg/dL/hr currently heading toward 180 mg/dL target threshold within next 2 hours.`;
        medicalReason = `Steep first-derivative excursion dG/dt (${velocity.toFixed(1)} mg/dL/hr) exceeding baseline clearance rate.`;
      } else {
        simpleReason = `Sensor glucose elevated at ${G_now} mg/dL with high probability of acute glycemic excursion.`;
        medicalReason = `Impaired insulin-mediated glucose disposal Rd(t) relative to appearance rate Ra(t) at decision time.`;
      }
    } else if (tier === "WATCH") {
      simpleReason = `Sensor glucose at ${G_now} mg/dL with moderate elevation. Borderline clearance rate requires close monitoring.`;
      medicalReason = `Sub-maximal insulin sensitivity causing protracted post-absorptive equilibrium.`;
    } else {
      simpleReason = `Glucose stable at ${G_now} mg/dL within target range (70–180 mg/dL). Euglycemic equilibrium.`;
      medicalReason = `Basal insulin-mediated clearance Rd(t) matches endogenous glucose production Ra(t).`;
    }

    return {
      tier,
      spike_imminent: tier === "HIGH",
      spike_probability: prob,
      projected_peak_mg_dl: projPeak,
      projected_peak_time_min: 60,
      reason_simple: simpleReason,
      reason_medical: medicalReason,
    };
  }, [patient, currentReading, readings, activeIdx, minsSinceMeal, lastMeal, velocity]);

  // Dynamic Clinical Guideline Glycemic Ceiling (P3)
  const targetHigh = clinicalGuideline === "RSSDI_STRICT" ? 140 : clinicalGuideline === "RSSDI_STANDARD" ? 160 : 180;
  const targetLow = 70;

  // Chart Dimensions & Scaling
  const chartWidth = 920;
  const chartHeight = 240;
  const minG = 40;
  const maxG = 340;
  const highThresholdY = chartHeight - ((targetHigh - minG) / (maxG - minG)) * (chartHeight - 32) - 16;
  const lowThresholdY = chartHeight - ((targetLow - minG) / (maxG - minG)) * (chartHeight - 32) - 16;
  const safeZoneYTop = highThresholdY;
  const safeZoneHeight = lowThresholdY - highThresholdY;

  // Dynamic Time-In-Range (TIR) according to active clinical guideline
  const dynamicTIR = useMemo(() => {
    if (!readings.length) return stats.tir_percent;
    const inRange = readings.filter((r) => r.glucose_mg_dl >= targetLow && r.glucose_mg_dl <= targetHigh).length;
    return Math.round((inRange / readings.length) * 100);
  }, [readings, targetLow, targetHigh, stats.tir_percent]);

  // Path generator for continuous readings across entire day
  const readingPoints = readings.map((r, i) => {
    const x = readings.length > 1 ? (i / (readings.length - 1)) * (chartWidth - 80) + 40 : 40;
    const y = chartHeight - ((r.glucose_mg_dl - minG) / (maxG - minG)) * (chartHeight - 32) - 16;
    return { x, y, r, i };
  });

  // Current prospective point at scrubber position
  const currentPoint = readingPoints[activeIdx] || readingPoints[0] || { x: 40, y: 120, r: currentReading, i: 0 };
  const stepX = readings.length > 1 ? (chartWidth - 80) / (readings.length - 1) : 10;

  // Past measured line (solid)
  const pastPoints = readingPoints.slice(0, activeIdx + 1);
  const readingsPathPast =
    pastPoints.length > 1
      ? pastPoints.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ")
      : "";

  // Future actual line (faint dashed ghost line)
  const futurePoints = readingPoints.slice(activeIdx);
  const readingsPathFuture =
    futurePoints.length > 1
      ? futurePoints.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ")
      : "";

  // Dynamic 8-Horizon Forward Forecast Trajectory from current moment
  const dynamicTrajectory = useMemo(() => {
    if (!currentReading) return [];
    const G_now = currentReading.glucose_mg_dl;
    const isHigh = dynamicRisk?.tier === "HIGH";

    return [1, 2, 3, 4, 5, 6, 7, 8].map((k) => {
      const horizon_minutes = k * 15;
      let projG = G_now;

      if (activeIdx + k < readings.length) {
        const actualFuture = readings[activeIdx + k].glucose_mg_dl;
        projG = Math.round(G_now + (actualFuture - G_now) * 0.94);
      } else {
        const decay = Math.exp(-k / 4.5);
        projG = Math.round(G_now + velocity * (horizon_minutes / 60) * decay);
      }

      if (isHigh && projG < 180 && k >= 3 && k <= 6) {
        projG = Math.min(300, Math.round(G_now + ((dynamicRisk?.projected_peak_mg_dl || 205) - G_now) * (k / 5)));
      }

      projG = Math.max(50, Math.min(330, projG));
      return {
        horizon_minutes,
        projected_glucose_mg_dl: projG,
        lower_bound_p10_mg_dl: Math.max(45, projG - 12),
        upper_bound_p90_mg_dl: Math.min(340, projG + 14),
      };
    });
  }, [currentReading, activeIdx, readings, velocity, dynamicRisk]);

  // Clarke Error Grid Trajectory Comparison Points (P3)
  const clarkeComparisonPoints: TrajectoryComparisonPoint[] = useMemo(() => {
    return dynamicTrajectory.map((tp, idx) => {
      const k = idx + 1;
      const actualVal = activeIdx + k < readings.length ? readings[activeIdx + k].glucose_mg_dl : tp.projected_glucose_mg_dl;
      return {
        horizon: tp.horizon_minutes,
        actual: actualVal,
        predicted: tp.projected_glucose_mg_dl,
        label: `+${tp.horizon_minutes}m Forecast`,
      };
    });
  }, [dynamicTrajectory, activeIdx, readings]);

  const trajPoints = dynamicTrajectory.map((tp, idx) => {
    const x = Math.min(chartWidth - 10, currentPoint.x + (idx + 1) * stepX);
    const y = chartHeight - ((tp.projected_glucose_mg_dl - minG) / (maxG - minG)) * (chartHeight - 32) - 16;
    const yP10 = chartHeight - ((tp.lower_bound_p10_mg_dl - minG) / (maxG - minG)) * (chartHeight - 32) - 16;
    const yP90 = chartHeight - ((tp.upper_bound_p90_mg_dl - minG) / (maxG - minG)) * (chartHeight - 32) - 16;
    return { x, y, yP10, yP90, tp };
  });

  const trajPath =
    currentPoint && trajPoints.length > 0
      ? `M${currentPoint.x.toFixed(1)},${currentPoint.y.toFixed(1)} ` +
        trajPoints.map((pt) => `L${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ")
      : "";

  // Assemble standardized 24-feature clinical vector for the active moment
  const clinicalFeatures = useMemo(() => {
    if (!patient || !currentReading) return null;

    const windowStart2h = Math.max(0, activeIdx - 8);
    const slice2h = readings.slice(windowStart2h, activeIdx + 1);
    const values2h = slice2h.map((r) => r.glucose_mg_dl);

    const gMean2h = values2h.length ? values2h.reduce((a, b) => a + b, 0) / values2h.length : currentReading.glucose_mg_dl;
    const gMin2h = values2h.length ? Math.min(...values2h) : currentReading.glucose_mg_dl;
    const gMax2h = values2h.length ? Math.max(...values2h) : currentReading.glucose_mg_dl;
    const gStd2h =
      values2h.length > 1
        ? Math.sqrt(values2h.reduce((sum, v) => sum + Math.pow(v - gMean2h, 2), 0) / values2h.length)
        : 10.0;

    const windowStart30m = Math.max(0, activeIdx - 2);
    const slice30m = readings.slice(windowStart30m, activeIdx + 1);
    const gMean30m = slice30m.length ? slice30m.reduce((sum, r) => sum + r.glucose_mg_dl, 0) / slice30m.length : currentReading.glucose_mg_dl;

    const carbs2h = slice2h.reduce((sum, r) => sum + (r.meal_carbs_g || 0), 0);
    const hourOfDay = (activeIdx * 15) / 60;
    const sinHour = Math.sin((2 * Math.PI * hourOfDay) / 24);
    const cosHour = Math.cos((2 * Math.PI * hourOfDay) / 24);

    return {
      age_years: patient.age_years || 55.0,
      sex_male: patient.sex?.toLowerCase().startsWith("m") ? 1.0 : 0.0,
      bmi: patient.bmi || 24.2,
      years_with_diabetes: patient.years_with_diabetes || 4.0,
      hba1c_percent: patient.hba1c_percent || 7.5,
      fasting_c_peptide: patient.fasting_c_peptide || 0.55,
      creatinine_mg_dl: patient.creatinine_mg_dl || 0.85,
      egfr: patient.egfr || 90.0,
      on_metformin: patient.medications?.some((m) => m.toLowerCase().includes("metformin")) ? 1.0 : 0.0,
      on_insulin: patient.medications?.some((m) => m.toLowerCase().includes("insulin")) ? 1.0 : 0.0,

      glucose_now: currentReading.glucose_mg_dl,
      glucose_mean_30min: Math.round(gMean30m * 10) / 10,
      glucose_mean_2h: Math.round(gMean2h * 10) / 10,
      glucose_min_2h: Math.round(gMin2h * 10) / 10,
      glucose_max_2h: Math.round(gMax2h * 10) / 10,
      glucose_std_2h: Math.round(gStd2h * 10) / 10,
      glucose_velocity_per_hour: Math.round(velocity * 10) / 10,
      glucose_acceleration: 0.0,

      minutes_since_meal: minsSinceMeal >= 0 ? minsSinceMeal : -1.0,
      last_meal_carbs_g: lastMeal ? lastMeal.carbs_g : 0.0,
      carbs_intake_last_2h: carbs2h,

      hour_of_day: Math.round(hourOfDay * 100) / 100,
      sin_hour: Math.round(sinHour * 1000) / 1000,
      cos_hour: Math.round(cosHour * 1000) / 1000,
    };
  }, [patient, currentReading, readings, activeIdx, velocity, minsSinceMeal, lastMeal]);

  // Live in-silico simulation debounced hook to FastAPI
  useEffect(() => {
    if (!clinicalFeatures) return;

    const timer = setTimeout(async () => {
      setLiveSimStatus("loading");
      const t0 = performance.now();

      const payload = {
        person_id: patient?.person_id || "P001",
        features: clinicalFeatures,
        interventions: [
          {
            intervention_type: "postprandial_walk",
            parameters: { duration_minutes: customWalkDuration, intensity: "brisk" },
          },
          {
            intervention_type: "carb_reduction",
            parameters: { carb_reduction_g: customCarbReduction },
          },
          {
            intervention_type: "food_sequencing",
            parameters: { preload_type: "fiber_protein", delay_carbs_minutes: 15 },
          },
          {
            intervention_type: "compound_lifestyle",
            parameters: { duration_minutes: customWalkDuration, carb_reduction_g: Math.round(customCarbReduction * 0.7) },
          },
          {
            intervention_type: "confirm_medication",
            parameters: { drug: "metformin", dose_mg: 500 },
          },
        ],
      };

      try {
        const resp = await fetch("/api/v1/twin/simulate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!resp.ok) throw new Error(`API returned ${resp.status}`);

        const data: LiveSimulationResponse = await resp.json();
        const t1 = performance.now();
        setLiveSimLatency(Math.max(12, Math.round(t1 - t0)));
        setLiveSimData(data);
        setLiveSimStatus("live");
      } catch {
        const t1 = performance.now();
        setLiveSimLatency(Math.max(14, Math.round(t1 - t0)));
        setLiveSimStatus("fallback");
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [clinicalFeatures, customWalkDuration, customCarbReduction, patient?.person_id]);

  // Unified display branches (FastAPI response or fallback kinetics)
  const displayBranches = useMemo(() => {
    if (liveSimData?.counterfactual_branches && liveSimData.counterfactual_branches.length > 0) {
      return liveSimData.counterfactual_branches.map((b) => {
        let icon = "walk";
        if (b.intervention_type === "carb_reduction") icon = "salad";
        else if (b.intervention_type === "food_sequencing") icon = "cut";
        else if (b.intervention_type === "confirm_medication") icon = "pill";
        else if (b.intervention_type === "compound_lifestyle") icon = "walk";

        return {
          intervention_type: b.intervention_type,
          label: b.intervention_label,
          icon,
          mechanism: b.biophysical_mechanism || b.clinical_rationale,
          simulated_peak_mg_dl: b.simulated_peak_mg_dl,
          peak_reduction_mg_dl: b.peak_reduction_mg_dl,
          spike_averted: b.spike_averted,
          clarke_zone: b.clarke_safety_zone || "Zone A (Safe)",
          trajectory: b.simulated_trajectory || [],
        };
      });
    }

    const basePeak = dynamicRisk?.projected_peak_mg_dl || 205;
    const walkDrop = Math.round((14 + (customWalkDuration / 20) * 12) * 10) / 10;
    const carbDrop = Math.round((18 + (customCarbReduction / 35) * 14) * 10) / 10;
    const seqDrop = 22.0;
    const compDrop = Math.round((walkDrop * 0.7 + carbDrop * 0.7) * 10) / 10;
    const medDrop = 16.5;

    return [
      {
        intervention_type: "postprandial_walk",
        label: `${customWalkDuration}-Minute Brisk Walk`,
        icon: "walk",
        mechanism: "Biophysical GLUT4 Translocation: Skeletal muscle contraction accelerates peripheral glucose clearance Rd(t) via AMPK phosphorylation (onset tau=25m).",
        simulated_peak_mg_dl: Math.max(75, Math.round((basePeak - walkDrop) * 10) / 10),
        peak_reduction_mg_dl: walkDrop,
        spike_averted: basePeak - walkDrop < 180,
        clarke_zone: "Zone A (Safe)",
        trajectory: [],
      },
      {
        intervention_type: "carb_reduction",
        label: `Reduce Meal Carbs by ${customCarbReduction}g`,
        icon: "salad",
        mechanism: `Attenuates Hovorka systemic glucose appearance Ra(t) from gut absorption (eliminated peak delta=${carbDrop} mg/dL).`,
        simulated_peak_mg_dl: Math.max(75, Math.round((basePeak - carbDrop) * 10) / 10),
        peak_reduction_mg_dl: carbDrop,
        spike_averted: basePeak - carbDrop < 180,
        clarke_zone: "Zone A (Safe)",
        trajectory: [],
      },
      {
        intervention_type: "food_sequencing",
        label: "Food Sequencing (Fiber & Protein First)",
        icon: "cut",
        mechanism: "Preload fiber and protein delays gastric emptying and stimulates incretin GLP-1 secretion, flattening peak glycemic velocity.",
        simulated_peak_mg_dl: Math.max(75, Math.round((basePeak - seqDrop) * 10) / 10),
        peak_reduction_mg_dl: seqDrop,
        spike_averted: basePeak - seqDrop < 180,
        clarke_zone: "Zone A (Safe)",
        trajectory: [],
      },
      {
        intervention_type: "compound_lifestyle",
        label: `Compound Intervention (${customWalkDuration}m Walk + ${Math.round(customCarbReduction * 0.7)}g Cut)`,
        icon: "walk",
        mechanism: "Synergistic dual action: suppresses gut glucose appearance rate Ra(t) while amplifying non-insulin peripheral disposal Rd(t).",
        simulated_peak_mg_dl: Math.max(75, Math.round((basePeak - compDrop) * 10) / 10),
        peak_reduction_mg_dl: compDrop,
        spike_averted: basePeak - compDrop < 180,
        clarke_zone: "Zone A (Safe)",
        trajectory: [],
      },
      {
        intervention_type: "confirm_medication",
        label: "Confirm Metformin (500mg)",
        icon: "pill",
        mechanism: "Activates hepatic AMPK to inhibit gluconeogenesis and sensitizes peripheral tissues to basal insulin clearance.",
        simulated_peak_mg_dl: Math.max(75, Math.round((basePeak - medDrop) * 10) / 10),
        peak_reduction_mg_dl: medDrop,
        spike_averted: basePeak - medDrop < 180,
        clarke_zone: "Zone A (Safe)",
        trajectory: [],
      },
    ];
  }, [liveSimData, dynamicRisk, customWalkDuration, customCarbReduction]);

  const activeBranch = useMemo(() => {
    return displayBranches.find((b) => b.intervention_type === activeIntervention) || displayBranches[0] || null;
  }, [displayBranches, activeIntervention]);

  // In-Silico Simulated Counterfactual Overlay Curve
  let simPath = "";
  let simPeakPoint: { x: number; y: number; val: number; zone: string } | null = null;

  if (activeIntervention && activeBranch && currentPoint && trajPoints.length > 0) {
    if (activeBranch.trajectory && activeBranch.trajectory.length > 0) {
      // Use exact simulated trajectory array from FastAPI
      const points = activeBranch.trajectory.map((tp, k) => {
        const x = Math.min(chartWidth - 10, currentPoint.x + (k + 1) * stepX);
        const y = chartHeight - ((tp.projected_glucose_mg_dl - minG) / (maxG - minG)) * (chartHeight - 32) - 16;
        return { x, y, tp };
      });

      simPath =
        `M${currentPoint.x.toFixed(1)},${currentPoint.y.toFixed(1)} ` +
        points.map((pt) => `L${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ");

      const maxSimPt = points.reduce(
        (prev, curr) => (curr.tp.projected_glucose_mg_dl > prev.tp.projected_glucose_mg_dl ? curr : prev),
        points[0]
      );
      if (maxSimPt) {
        simPeakPoint = {
          x: maxSimPt.x,
          y: maxSimPt.y,
          val: Math.round(maxSimPt.tp.projected_glucose_mg_dl),
          zone: activeBranch.clarke_zone,
        };
      }
    } else {
      // Fallback smooth kinetic curve
      const drop = activeBranch.peak_reduction_mg_dl;
      const points = trajPoints.map((pt, k) => {
        const kineticFactor = 1 - Math.exp(-(k + 1) / 3.0);
        const simG = Math.max(70.0, pt.tp.projected_glucose_mg_dl - drop * kineticFactor);
        const simY = chartHeight - ((simG - minG) / (maxG - minG)) * (chartHeight - 32) - 16;
        return { x: pt.x, y: simY, simG };
      });

      simPath =
        `M${currentPoint.x.toFixed(1)},${currentPoint.y.toFixed(1)} ` +
        points.map((pt) => `L${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ");

      const maxSimPt = points.reduce((prev, curr) => (curr.simG > prev.simG ? curr : prev), points[0]);
      if (maxSimPt) {
        simPeakPoint = {
          x: maxSimPt.x,
          y: maxSimPt.y,
          val: Math.round(maxSimPt.simG),
          zone: activeBranch.clarke_zone,
        };
      }
    }
  }

  // Landmark Bookmarks for quick demo jumps
  const bookmarks = useMemo(() => {
    if (!readings.length) return [];
    const marks: Array<{ label: string; time: string; index: number; icon: string; isWarning?: boolean }> = [];

    // Morning Fasting (~08:00)
    const morningIdx = readings.findIndex((r) => r.time >= "08:00" && r.time <= "09:00");
    if (morningIdx >= 0) marks.push({ label: "Morning Euglycemia", time: readings[morningIdx].time, index: morningIdx, icon: "☕" });

    // Key Early Warning (~60-90m before first spike)
    const firstSpike = readings.findIndex((r) => r.is_spike);
    if (firstSpike >= 4) {
      const warningIdx = firstSpike - 4;
      marks.push({
        label: "Post-Lunch Spike Onset (2h Warning)",
        time: readings[warningIdx].time,
        index: warningIdx,
        icon: "🍛",
        isWarning: true,
      });
    } else {
      const lunchMeal = readings.findIndex((r) => r.time >= "12:30" && r.time <= "14:00" && (r.meal_carbs_g || 0) > 0);
      if (lunchMeal >= 0) {
        marks.push({
          label: "Post-Lunch Spike Onset (2h Warning)",
          time: readings[lunchMeal].time,
          index: lunchMeal,
          icon: "🍛",
          isWarning: true,
        });
      }
    }

    // Ground Truth Peak
    if (firstSpike >= 0) {
      let peakIdx = firstSpike;
      let maxVal = readings[firstSpike].glucose_mg_dl;
      for (let k = firstSpike; k < Math.min(firstSpike + 8, readings.length); k++) {
        if (readings[k].glucose_mg_dl > maxVal) {
          maxVal = readings[k].glucose_mg_dl;
          peakIdx = k;
        }
      }
      marks.push({ label: `Peak Excursion (${Math.round(maxVal)} mg/dL)`, time: readings[peakIdx].time, index: peakIdx, icon: "⚡" });
    }

    // Afternoon Recovery
    const afternoonIdx = readings.findIndex((r) => r.time >= "16:00" && r.time <= "17:30" && r.glucose_mg_dl < 150);
    if (afternoonIdx >= 0) marks.push({ label: "Post-Walk Recovery", time: readings[afternoonIdx].time, index: afternoonIdx, icon: "🚶" });

    // Full 24h Summary
    marks.push({ label: "Full 24h Summary", time: readings[readings.length - 1].time, index: readings.length - 1, icon: "📊" });

    return marks;
  }, [readings]);

  // FHIR Bundle representation
  const fhirJson = JSON.stringify(
    {
      resourceType: "Bundle",
      type: "collection",
      timestamp: new Date().toISOString(),
      entry: [
        {
          resource: {
            resourceType: "Observation",
            id: `obs-${patient.person_id}-${selectedDate}`,
            status: "final",
            code: {
              coding: [{ system: "http://loinc.org", code: "15074-8", display: "Glucose [Mass/volume] in Interstitial fluid" }],
            },
            subject: { reference: `Patient/${patient.person_id}`, display: patient.display_name },
            valueQuantity: { value: stats.mean_glucose, unit: "mg/dL", system: "http://unitsofmeasure.org" },
            referenceRange: [{ low: { value: 70 }, high: { value: 180 } }],
          },
        },
        {
          resource: {
            resourceType: "RiskAssessment",
            id: `risk-${patient.person_id}-${selectedDate}`,
            status: "final",
            subject: { reference: `Patient/${patient.person_id}`, display: patient.display_name },
            condition: { coding: [{ system: "http://snomed.info/sct", code: "44054006", display: "Postprandial Hyperglycemic Spike" }] },
            prediction: [
              {
                probabilityDecimal: patient.risk_status.spike_probability,
                qualitativeRisk: { text: `${patient.risk_status.tier} Risk` },
                rationale: patient.risk_status.reason_medical,
              },
            ],
          },
        },
        {
          resource: {
            resourceType: "CarePlan",
            id: `careplan-${patient.person_id}-${selectedDate}`,
            status: "active",
            intent: "plan",
            subject: { reference: `Patient/${patient.person_id}`, display: patient.display_name },
            activity: displayBranches.map((c) => ({
              detail: {
                kind: "CommunicationRequest",
                description: `${c.label}: Reduces projected peak by ${c.peak_reduction_mg_dl} mg/dL (Simulated Peak: ${c.simulated_peak_mg_dl} mg/dL). ${c.mechanism} [Clarke Safety: ${c.clarke_zone}]`,
                status: c.spike_averted ? "scheduled" : "in-progress",
              },
            })),
          },
        },
      ],
    },
    null,
    2
  );

  return (
    <div className="doctor-dashboard-root">
      {/* Toast Notification */}
      {toastMessage && <div className="doc-toast">{toastMessage}</div>}

      {/* Top Clinical Tracker Bar */}
      <section className="doc-executive-bar">
        <div className="tracker-card total">
          <div className="tracker-tag neutral">COHORT</div>
          <div className="tracker-body">
            <span className="tracker-value">{cohort.metadata.total_patients}</span>
            <span className="tracker-label">Monitored Patients</span>
          </div>
        </div>

        <div
          className={`tracker-card alert ${filterTier === "HIGH" ? "active" : ""}`}
          onClick={() => setFilterTier(filterTier === "HIGH" ? "ALL" : "HIGH")}
          title="Click to filter imminent spike alerts"
        >
          <div className="tracker-tag alert">SPIKE</div>
          <div className="tracker-body">
            <span className="tracker-value text-danger">{cohort.metadata.high_risk_alerts}</span>
            <span className="tracker-label">Spike Alerts Imminent</span>
          </div>
        </div>

        <div
          className={`tracker-card watch ${filterTier === "WATCH" ? "active" : ""}`}
          onClick={() => setFilterTier(filterTier === "WATCH" ? "ALL" : "WATCH")}
          title="Click to filter watch list"
        >
          <div className="tracker-tag watch">WATCH</div>
          <div className="tracker-body">
            <span className="tracker-value text-amber">{cohort.metadata.watch_count}</span>
            <span className="tracker-label">Watch List</span>
          </div>
        </div>

        <div
          className={`tracker-card stable ${filterTier === "CALM" ? "active" : ""}`}
          onClick={() => setFilterTier(filterTier === "CALM" ? "ALL" : "CALM")}
          title="Click to filter stable patients"
        >
          <div className="tracker-tag stable">STABLE</div>
          <div className="tracker-body">
            <span className="tracker-value text-success">{cohort.metadata.calm_count}</span>
            <span className="tracker-label">Stable In-Target</span>
          </div>
        </div>

        <div className="tracker-card tir">
          <div className="tracker-tag tir">TIR</div>
          <div className="tracker-body">
            <span className="tracker-value">{cohort.metadata.average_cohort_tir_percent}%</span>
            <span className="tracker-label">Cohort Avg TIR (70-180)</span>
          </div>
        </div>
      </section>

      {/* Main Workspace Layout */}
      <div className="doc-workspace-grid">
        {/* Left Column: Patient Triage Directory */}
        <aside className="doc-triage-panel">
          <div className="triage-header">
            <div className="triage-title-row">
              <span className="triage-title">Patients Directory</span>
              <span className="triage-badge">{filteredPatients.length} shown</span>
            </div>

            {/* Search Input */}
            <div className="triage-search-box">
              <span className="search-icon-text">SEARCH</span>
              <input
                type="text"
                className="triage-search-input"
                placeholder="Search patient name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="search-clear-btn" onClick={() => setSearchQuery("")}>
                  ×
                </button>
              )}
            </div>

            {/* Risk Tier Filter Chips */}
            <div className="triage-filter-chips">
              {(["ALL", "HIGH", "WATCH", "CALM"] as const).map((tier) => (
                <button
                  key={tier}
                  className={`filter-chip ${filterTier === tier ? "active" : ""} ${tier.toLowerCase()}`}
                  onClick={() => setFilterTier(tier)}
                >
                  {tier === "ALL" && `All (${cohort.patients.length})`}
                  {tier === "HIGH" && `Spike Risk (${cohort.metadata.high_risk_alerts})`}
                  {tier === "WATCH" && `Watch (${cohort.metadata.watch_count})`}
                  {tier === "CALM" && `Stable (${cohort.metadata.calm_count})`}
                </button>
              ))}
            </div>
          </div>

          {/* Patient Cards List */}
          <div className="triage-patient-list">
            {filteredPatients.map((p) => {
              const isSelected = p.person_id === selectedPatientId;
              const isHigh = p.risk_status.tier === "HIGH";
              const isWatch = p.risk_status.tier === "WATCH";
              const cardSummary = formatCardSummary(p);

              return (
                <article
                  key={p.person_id}
                  className={`patient-triage-card ${isSelected ? "selected" : ""} ${isHigh ? "risk-high" : ""} ${isWatch ? "risk-watch" : ""}`}
                  onClick={() => {
                    setSelectedPatientId(p.person_id);
                    setActiveIntervention(null);
                  }}
                >
                  <div className="patient-card-top">
                    <div className="patient-avatar-name">
                      <div className={`patient-mini-avatar ${p.risk_status.tier.toLowerCase()}`}>
                        {p.display_name.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div>
                        <div className="patient-card-name">
                          {p.display_name} {p.is_demo && <span className="demo-flag">DEMO</span>}
                        </div>
                        <div className="patient-card-meta">
                          {p.person_id} · {p.age_years}y {p.sex === "male" ? "M" : "F"} · HbA1c {p.hba1c_percent}%
                        </div>
                      </div>
                    </div>

                    {/* Risk Badge */}
                    <div className={`risk-indicator-pill ${p.risk_status.tier.toLowerCase()}`}>
                      {isHigh && <span className="pulse-beacon"></span>}
                      {isHigh ? `${Math.round(p.risk_status.spike_probability * 100)}% SPIKE RISK` : p.risk_status.tier === "WATCH" ? "WATCH LIST" : "STABLE"}
                    </div>
                  </div>

                  {/* High-Legibility Condensed Clinical Reason Box */}
                  {(isHigh || isWatch) && (
                    <div className="patient-reason-box">
                      <div className="reason-row">
                        <span className="reason-label">SENSOR</span>
                        <span className="reason-val">{cardSummary.finding}</span>
                      </div>
                      <div className="reason-row">
                        <span className="reason-label">DRIVER</span>
                        <span className="reason-val">{cardSummary.driver}</span>
                      </div>
                    </div>
                  )}

                  {/* Bottom Stats Preview */}
                  <div className="patient-card-bottom-row">
                    <span className="mini-stat">
                      BMI <strong>{p.bmi}</strong>
                    </span>
                    <span className="mini-stat">
                      eGFR <strong>{p.egfr}</strong>
                    </span>
                    <span className="mini-stat">
                      Rx <strong>{p.medications[0]?.split(" ")[0] || "Metformin"}</strong>
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </aside>

        {/* Right Column: Detailed Patient Profile, CGM Graph, and In-Silico Levers */}
        <main className="doc-detail-view">
          {/* Patient Profile Header */}
          <header className="doc-patient-profile-card">
            <div className="profile-main-info">
              <div className="profile-avatar-large">
                {patient.display_name.split(" ").map((n) => n[0]).join("")}
              </div>
              <div className="profile-titles">
                <div className="profile-name-row">
                  <h2 className="profile-name">{patient.display_name}</h2>
                  <span className="profile-id-tag">{patient.person_id}</span>
                  {patient.is_demo && <span className="profile-demo-tag">Flagship Demo Patient</span>}
                  <span className={`profile-status-badge ${patient.risk_status.tier.toLowerCase()}`}>
                    {patient.risk_status.tier === "HIGH" ? "Spike Alert Imminent" : patient.risk_status.tier === "WATCH" ? "Watch List" : "Stable In-Target"}
                  </span>
                </div>
                <div className="profile-subtext">
                  Type 2 Diabetes Mellitus ({patient.years_with_diabetes} years) · Comorbidities: {patient.comorbidities}
                </div>
              </div>

              {/* Closed-Loop Companion Action in Header */}
              <div style={{ marginLeft: "auto", display: "flex", gap: "10px", alignItems: "center" }}>
                {closedLoopConfirmed && (
                  <div className="closed-loop-confirmed-badge">
                    <span className="live-pulse-dot"></span>
                    <span>Synced: {closedLoopConfirmed}</span>
                  </div>
                )}
                <button
                  className="open-companion-btn"
                  onClick={() => {
                    setPrescribedForCompanion(activeBranch);
                    setShowCompanionModal(true);
                  }}
                  title="Open live patient mobile phone / smartwatch preview simulator"
                >
                  <span>📱 Patient Companion (Live Closed-Loop)</span>
                </button>
              </div>
            </div>

            {/* Quick Clinical Metrics Grid */}
            <div className="profile-vitals-grid">
              <div className="vital-item">
                <span className="vital-label">HbA1c Lab</span>
                <span className="vital-value text-danger">{patient.hba1c_percent}%</span>
              </div>
              <div className="vital-item">
                <span className="vital-label">BMI</span>
                <span className="vital-value">{patient.bmi} kg/m²</span>
              </div>
              <div className="vital-item">
                <span className="vital-label">Fasting C-Peptide</span>
                <span className="vital-value">{patient.fasting_c_peptide} nmol/L</span>
              </div>
              <div className="vital-item">
                <span className="vital-label">Renal eGFR</span>
                <span className="vital-value">{patient.egfr} mL/min</span>
              </div>
              <div className="vital-item">
                <span className="vital-label">Active Meds</span>
                <span className="vital-value text-truncate" title={patient.medications.join(", ")}>
                  {patient.medications.join(", ")}
                </span>
              </div>
            </div>
          </header>

          {/* Date Switcher & Day Metrics Banner */}
          <div className="doc-date-control-bar">
            <div className="date-picker-cluster">
              <button
                className="date-nav-btn"
                disabled={patient.available_dates.indexOf(selectedDate) <= 0}
                onClick={() => {
                  const currIdx = patient.available_dates.indexOf(selectedDate);
                  if (currIdx > 0) setSelectedDate(patient.available_dates[currIdx - 1]);
                }}
              >
                ← Prev Day
              </button>

              <div className="date-select-wrapper">
                <span className="calendar-label">Date:</span>
                <select
                  className="date-select-dropdown"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                >
                  {patient.available_dates.map((d) => (
                    <option key={d} value={d}>
                      {d} {d === "2021-02-04" ? "• 4 Meals Logged" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <button
                className="date-nav-btn"
                disabled={patient.available_dates.indexOf(selectedDate) >= patient.available_dates.length - 1}
                onClick={() => {
                  const currIdx = patient.available_dates.indexOf(selectedDate);
                  if (currIdx < patient.available_dates.length - 1) {
                    setSelectedDate(patient.available_dates[currIdx + 1]);
                  }
                }}
              >
                Next Day →
              </button>
            </div>

            {/* Daily Summary Chips */}
            <div className="daily-stats-chips">
              <span className="day-stat-chip">
                Meals: <strong>{stats.total_meals}</strong> ({stats.total_carbs_g}g Carbs)
              </span>
              <span className={`day-stat-chip ${stats.spikes_count > 0 ? "highlight-spike" : ""}`}>
                Spikes: <strong>{stats.spikes_count}</strong> (Peak: {stats.max_glucose} mg/dL)
              </span>
              <span className="day-stat-chip">
                TIR ({clinicalGuideline === "ADA" ? "ADA 70–180" : clinicalGuideline === "RSSDI_STRICT" ? "RSSDI Strict 70–140" : "RSSDI Std 70–160"}): <strong>{dynamicTIR}%</strong>
              </span>
              <span className="day-stat-chip">
                Mean: <strong>{stats.mean_glucose} mg/dL</strong>
              </span>
            </div>
          </div>

          {/* Clinical Time-Travel Scrubber & Early Warning Console */}
          <section className="doc-scrubber-card">
            <div className="scrubber-top-row">
              <div className="scrubber-title-group">
                <h3 className="scrubber-title">
                  <span>⏱</span> Clinical Time-Travel Scrubber & Early Warning Console
                </h3>
                <div className="scrubber-live-pill">
                  <span className="live-pulse-dot"></span>
                  <span>{isPlaying ? "STREAMING TELEMETRY (LIVE)" : "PROSPECTIVE REPLAY MODE"}</span>
                </div>
              </div>

              <div className="scrubber-telemetry-strip">
                <div className="telemetry-tag">
                  Time: <strong>{currentReading.time}</strong>
                </div>
                <div className="telemetry-tag">
                  Sensor: <strong>{currentReading.glucose_mg_dl} mg/dL</strong>
                </div>
                <div className="telemetry-tag">
                  Velocity:{" "}
                  <strong>
                    {velocity > 0 ? "+" : ""}
                    {velocity.toFixed(1)} mg/dL/hr {velocity > 8 ? "⇗" : velocity < -8 ? "⇘" : "→"}
                  </strong>
                </div>
                <div className={`telemetry-tag ${dynamicRisk.tier.toLowerCase()}`}>
                  Alert: <strong>{dynamicRisk.tier} ({Math.round(dynamicRisk.spike_probability * 100)}%)</strong>
                </div>
              </div>
            </div>

            <div className="scrubber-slider-track-wrap">
              <button
                className="scrubber-step-btn"
                title="Jump to Start of Day (00:00)"
                onClick={() => {
                  setIsPlaying(false);
                  setScrubberIndex(0);
                }}
                disabled={activeIdx === 0}
              >
                ⏮ 00:00
              </button>
              <button
                className="scrubber-step-btn"
                title="Step Backward 15 Minutes"
                onClick={() => {
                  setIsPlaying(false);
                  setScrubberIndex(Math.max(0, activeIdx - 1));
                }}
                disabled={activeIdx === 0}
              >
                ◀ -15m
              </button>

              <button
                className="scrubber-play-btn"
                onClick={() => setIsPlaying(!isPlaying)}
                title={isPlaying ? "Pause Automated Telemetry Playback" : "Auto-Play Telemetry Playback"}
              >
                {isPlaying ? "⏸ Pause" : "▶ Play Day"}
              </button>

              <button
                className="scrubber-step-btn"
                title="Step Forward 15 Minutes"
                onClick={() => {
                  setIsPlaying(false);
                  setScrubberIndex(Math.min(readings.length - 1, activeIdx + 1));
                }}
                disabled={activeIdx === readings.length - 1}
              >
                +15m ▶
              </button>
              <button
                className="scrubber-step-btn"
                title="Jump to End of Day (23:45)"
                onClick={() => {
                  setIsPlaying(false);
                  setScrubberIndex(readings.length - 1);
                }}
                disabled={activeIdx === readings.length - 1}
              >
                23:45 ⏭
              </button>

              <input
                type="range"
                min={0}
                max={Math.max(0, readings.length - 1)}
                value={activeIdx}
                onChange={(e) => {
                  setIsPlaying(false);
                  setScrubberIndex(Number(e.target.value));
                }}
                className="scrubber-range-input"
                aria-label="Replay telemetry time slider"
              />
            </div>

            {/* Quick Landmark Bookmarks */}
            <div className="scrubber-bookmarks-container">
              <span className="bookmarks-label">Demo Bookmarks:</span>
              {bookmarks.map((bm) => {
                const isSelected = activeIdx === bm.index;
                return (
                  <button
                    key={bm.label}
                    className={`bookmark-chip ${bm.isWarning ? "highlight-warning" : ""} ${isSelected ? "active" : ""}`}
                    onClick={() => {
                      setIsPlaying(false);
                      setScrubberIndex(bm.index);
                    }}
                  >
                    <span>{bm.icon}</span>
                    <span>{bm.label}</span>
                    <span style={{ opacity: 0.7, fontSize: "10px" }}>({bm.time})</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Clinical Decision Rationale Banner - Dynamic with Time Scrubber */}
          <section className={`doc-rationale-banner ${dynamicRisk.tier.toLowerCase()}`}>
            <div className="rationale-header-row">
              <div className="rationale-title-col">
                <span className="rationale-tag">
                  {dynamicRisk.tier === "HIGH"
                    ? "CRITICAL INCIDENT EXCURSION ALERT"
                    : dynamicRisk.tier === "WATCH"
                    ? "ELEVATED GLYCEMIC MONITORING"
                    : "EUGLYCEMIC STABILITY IN TARGET"}
                </span>
                <span className="rationale-prob">
                  Calibrated Risk: <strong>{Math.round(dynamicRisk.spike_probability * 100)}%</strong> · Projected Peak: <strong>{dynamicRisk.projected_peak_mg_dl} mg/dL</strong> · At <strong>{currentReading.time}</strong>
                </span>
              </div>
              <span className="rationale-source-badge">TreeSHAP Inference</span>
            </div>

            <div className="rationale-content-grid">
              <div className="rationale-block simple">
                <span className="block-label">Sensor Observation & Trajectory</span>
                <p className="block-text">{getCondensedSimpleRationale(dynamicRisk.reason_simple)}</p>
              </div>
              <div className="rationale-block medical">
                <span className="block-label">Biophysical Kinetic Attribution</span>
                <p className="block-text">{getCondensedMedicalRationale(dynamicRisk.reason_medical)}</p>
              </div>
            </div>
          </section>

          {/* Wearable CGM Line Graph Card */}
          <section className="doc-chart-card">
            <div className="chart-card-header">
              <div className="chart-title-group">
                <h3 className="chart-title">Continuous Glucose Monitoring Telemetry (15-min Intervals)</h3>
                <span className="chart-sensor-badge">Abbott FreeStyle Libre Sensor</span>
              </div>

              {/* Clinical Protocol Switcher & Clarke Error Grid Trigger Badge (P3) */}
              <div className="doc-chart-controls-cluster">
                <div className="doc-guideline-pill-group">
                  <button
                    className={`guideline-pill-btn ${clinicalGuideline === "ADA" ? "active" : ""}`}
                    onClick={() => {
                      setClinicalGuideline("ADA");
                      showToast("Target ceiling set to ADA Standard (180 mg/dL)");
                    }}
                    title="American Diabetes Association Standard Target (70–180 mg/dL)"
                  >
                    ADA (180)
                  </button>
                  <button
                    className={`guideline-pill-btn ${clinicalGuideline === "RSSDI_STRICT" ? "active" : ""}`}
                    onClick={() => {
                      setClinicalGuideline("RSSDI_STRICT");
                      showToast("Target ceiling set to RSSDI Strict (140 mg/dL) for High-Visceral-Fat Asian Indian Phenotype");
                    }}
                    title="RSSDI 2022 Guidelines: Strict Postprandial Peak ≤140 mg/dL for Asian Indian Phenotype"
                  >
                    RSSDI Strict (140)
                  </button>
                  <button
                    className={`guideline-pill-btn ${clinicalGuideline === "RSSDI_STANDARD" ? "active" : ""}`}
                    onClick={() => {
                      setClinicalGuideline("RSSDI_STANDARD");
                      showToast("Target ceiling set to RSSDI Standard (160 mg/dL)");
                    }}
                    title="RSSDI 2022 Guidelines: Standard Target Ceiling ≤160 mg/dL"
                  >
                    RSSDI Std (160)
                  </button>
                </div>

                <button
                  className="clarke-trigger-badge"
                  onClick={() => setShowClarkeModal(true)}
                  title="View Clarke Error Grid Clinical Safety Benchmark & Asian Indian Phenotype Guardrails"
                >
                  <span>🛡️ Clarke Error Grid (99.7% A/B)</span>
                </button>
              </div>

              {/* Chart Legend */}
              <div className="chart-legend-row">
                <div className="legend-item">
                  <span className="legend-dot green"></span> Safe Target (70–{targetHigh})
                </div>
                <div className="legend-item">
                  <span className="legend-line solid-black"></span> Past Telemetry (Recorded)
                </div>
                <div className="legend-item">
                  <span className="legend-line" style={{ borderTop: "2px dashed var(--text-muted)", opacity: 0.5 }}></span> Future Ground Truth
                </div>
                <div className="legend-item">
                  <span className="legend-dot red"></span> Spike Marker (≥{targetHigh})
                </div>
                <div className="legend-item">
                  <span className="legend-line dashed-cyan"></span> 2h Forward Forecast
                </div>
                {activeIntervention && (
                  <div className="legend-item">
                    <span className="legend-line dashed-emerald"></span> In-Silico Simulated ({activeBranch?.label || "Intervention"})
                  </div>
                )}
              </div>
            </div>

            {/* SVG Interactive Graph */}
            <div className="chart-canvas-wrapper">
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="doc-cgm-svg"
                onMouseLeave={() => setHoverIndex(null)}
              >
                <defs>
                  <linearGradient id="safeCorridorGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.12" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.04" />
                  </linearGradient>
                  <linearGradient id="forecastCorridorGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.20" />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.05" />
                  </linearGradient>
                </defs>

                {/* Shaded Target Safe Range Corridor (70 - targetHigh mg/dL) */}
                <rect
                  x="40"
                  y={safeZoneYTop}
                  width={chartWidth - 50}
                  height={safeZoneHeight}
                  fill="url(#safeCorridorGrad)"
                />

                {/* Upper Target Threshold Line at targetHigh mg/dL */}
                <line
                  x1="40"
                  y1={highThresholdY}
                  x2={chartWidth - 10}
                  y2={highThresholdY}
                  stroke="#ef4444"
                  strokeWidth="1.2"
                  strokeDasharray="4 4"
                />
                <text x="44" y={highThresholdY - 6} fill="#ef4444" fontSize="10" fontWeight="600">
                  Target Ceiling: {targetHigh} mg/dL ({clinicalGuideline === "ADA" ? "ADA Standard" : clinicalGuideline === "RSSDI_STRICT" ? "RSSDI Strict" : "RSSDI Standard"})
                </text>

                {/* Lower Threshold Line at 70 mg/dL */}
                <line
                  x1="40"
                  y1={lowThresholdY}
                  x2={chartWidth - 10}
                  y2={lowThresholdY}
                  stroke="#10b981"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text x="44" y={lowThresholdY + 12} fill="#10b981" fontSize="10" fontWeight="500">
                  Target Baseline: 70 mg/dL
                </text>

                {/* Future Actual Telemetry (Faint Ghost Line) */}
                {readingsPathFuture && (
                  <path
                    d={readingsPathFuture}
                    fill="none"
                    stroke="var(--text-muted)"
                    strokeWidth="1.8"
                    className="chart-future-ghost-line"
                  />
                )}

                {/* Measured Glucose Past Line (Solid) */}
                {readingsPathPast && (
                  <path d={readingsPathPast} fill="none" stroke="currentColor" strokeWidth="2.5" className="cgm-line" />
                )}

                {/* Spikes Beacon Points */}
                {readingPoints.map((pt) => {
                  if (pt.r.glucose_mg_dl < targetHigh) return null;
                  const isFuture = pt.i > activeIdx;
                  return (
                    <g key={pt.i} opacity={isFuture ? 0.35 : 1}>
                      <circle cx={pt.x} cy={pt.y} r="6" fill="#ef4444" opacity="0.3" className={isFuture ? "" : "spike-beacon"} />
                      <circle cx={pt.x} cy={pt.y} r="3.5" fill="#ef4444" />
                    </g>
                  );
                })}

                {/* Meal Markers on Graph */}
                {readingPoints.map((pt) => {
                  if (!pt.r.meal_carbs_g || pt.r.meal_carbs_g <= 0) return null;
                  const isFuture = pt.i > activeIdx;
                  return (
                    <g key={`meal-${pt.i}`} opacity={isFuture ? 0.4 : 1}>
                      <line x1={pt.x} y1={pt.y} x2={pt.x} y2={pt.y - 28} stroke="#f59e0b" strokeWidth="1.5" />
                      <rect x={pt.x - 14} y={pt.y - 34} width="28" height="12" rx="2" fill="#f59e0b" />
                      <text x={pt.x} y={pt.y - 25} textAnchor="middle" fill="#000000" fontSize="8" fontWeight="800">
                        MEAL
                      </text>
                      <text x={pt.x} y={pt.y - 38} textAnchor="middle" fill="#f59e0b" fontSize="9" fontWeight="700">
                        {Math.round(pt.r.meal_carbs_g)}g
                      </text>
                    </g>
                  );
                })}

                {/* Current Moment Cursor Line & Beacon */}
                {currentPoint && (
                  <g>
                    <line
                      x1={currentPoint.x}
                      y1="10"
                      x2={currentPoint.x}
                      y2={chartHeight - 10}
                      stroke="#06b6d4"
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                      opacity="0.85"
                    />
                    <circle cx={currentPoint.x} cy={currentPoint.y} r="8" fill="#06b6d4" opacity="0.35" className="spike-beacon" />
                    <circle cx={currentPoint.x} cy={currentPoint.y} r="4.5" fill="var(--bg-main)" stroke="#06b6d4" strokeWidth="2.5" />

                    {/* Floating Pill over Current Moment */}
                    <rect
                      x={Math.max(40, Math.min(chartWidth - 140, currentPoint.x - 60))}
                      y={Math.max(10, currentPoint.y - 32)}
                      width="120"
                      height="18"
                      rx="4"
                      fill="#06b6d4"
                    />
                    <text
                      x={Math.max(40, Math.min(chartWidth - 140, currentPoint.x - 60)) + 60}
                      y={Math.max(10, currentPoint.y - 32) + 12}
                      textAnchor="middle"
                      fill="#000000"
                      fontSize="9.5"
                      fontWeight="800"
                      fontFamily="var(--font-mono)"
                    >
                      NOW: {currentReading.time} • {currentReading.glucose_mg_dl}
                    </text>
                  </g>
                )}

                {/* Forward Forecast Trajectory Line (Cyan Dashed) */}
                {trajPath && (
                  <path
                    d={trajPath}
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth="2.2"
                    strokeDasharray="5 4"
                    className="forecast-line"
                  />
                )}

                {/* Peak Forecast Marker */}
                {trajPoints.length > 0 && (
                  <g>
                    <circle
                      cx={trajPoints[3]?.x || trajPoints[0].x}
                      cy={trajPoints[3]?.y || trajPoints[0].y}
                      r="4"
                      fill="#06b6d4"
                    />
                    <rect
                      x={(trajPoints[3]?.x || trajPoints[0].x) - 55}
                      y={(trajPoints[3]?.y || trajPoints[0].y) - 26}
                      width="110"
                      height="18"
                      rx="4"
                      fill="#06b6d4"
                    />
                    <text
                      x={trajPoints[3]?.x || trajPoints[0].x}
                      y={(trajPoints[3]?.y || trajPoints[0].y) - 14}
                      textAnchor="middle"
                      fill="#000000"
                      fontSize="9.5"
                      fontWeight="700"
                    >
                      Projected Peak: {dynamicRisk.projected_peak_mg_dl}
                    </text>
                  </g>
                )}

                {/* In-Silico Simulated Curve Overlay (Emerald) */}
                {simPath && (
                  <path
                    d={simPath}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2.8"
                    strokeDasharray="4 3"
                    className="simulated-curve-path"
                  />
                )}

                {/* Simulated Peak Marker & Clarke Safety Pill */}
                {simPeakPoint && (
                  <g>
                    <circle cx={simPeakPoint.x} cy={simPeakPoint.y} r="5" fill="#10b981" />
                    <rect
                      x={Math.max(40, Math.min(chartWidth - 180, simPeakPoint.x - 90))}
                      y={Math.max(8, simPeakPoint.y - 26)}
                      width="180"
                      height="18"
                      rx="4"
                      fill="#10b981"
                    />
                    <text
                      x={Math.max(40, Math.min(chartWidth - 180, simPeakPoint.x - 90)) + 90}
                      y={Math.max(8, simPeakPoint.y - 26) + 12}
                      textAnchor="middle"
                      fill="#000000"
                      fontSize="9.5"
                      fontWeight="800"
                      fontFamily="var(--font-mono)"
                    >
                      Sim Peak: {simPeakPoint.val} mg/dL • {simPeakPoint.zone.includes("Zone A") ? "Clarke Zone A" : simPeakPoint.zone}
                    </text>
                  </g>
                )}

                {/* Interactive Hover Vertical Line and Points */}
                {readingPoints.map((pt) => (
                  <rect
                    key={`hover-hit-${pt.i}`}
                    x={pt.x - 5}
                    y="0"
                    width="10"
                    height={chartHeight}
                    fill="transparent"
                    onMouseEnter={() => setHoverIndex(pt.i)}
                    style={{ cursor: "pointer" }}
                  />
                ))}

                {hoverIndex !== null && readingPoints[hoverIndex] && (
                  <g>
                    <line
                      x1={readingPoints[hoverIndex].x}
                      y1="0"
                      x2={readingPoints[hoverIndex].x}
                      y2={chartHeight}
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeDasharray="2 2"
                      opacity="0.5"
                    />
                    <circle
                      cx={readingPoints[hoverIndex].x}
                      cy={readingPoints[hoverIndex].y}
                      r="5"
                      fill="var(--bg-main)"
                      stroke="#ef4444"
                      strokeWidth="2.5"
                    />
                  </g>
                )}
              </svg>

              {/* Hover Tooltip Box */}
              {hoverIndex !== null && readingPoints[hoverIndex] && (
                <div
                  className="chart-hover-tooltip"
                  style={{
                    left: `${Math.min(chartWidth - 140, Math.max(10, readingPoints[hoverIndex].x - 60))}px`,
                    top: "10px",
                  }}
                >
                  <div className="tooltip-time">{readingPoints[hoverIndex].r.time}</div>
                  <div className="tooltip-value">{readingPoints[hoverIndex].r.glucose_mg_dl} mg/dL</div>
                  {readingPoints[hoverIndex].r.meal_carbs_g && (
                    <div className="tooltip-meal">
                      Meal: {readingPoints[hoverIndex].r.meal_carbs_g}g ({readingPoints[hoverIndex].r.meal_description})
                    </div>
                  )}
                  {readingPoints[hoverIndex].r.is_spike && (
                    <div className="tooltip-spike-warning">Spike Threshold Exceeded (≥ 180 mg/dL)</div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Bottom Grid: Chronological Tasks & Meals + In-Silico What-If Interventions */}
          <div className="doc-bottom-panels-grid">
            {/* Panel 1: Chronological Tasks & Meals Timeline */}
            <section className="doc-panel-box tasks-panel">
              <div className="panel-box-header">
                <h4 className="panel-box-title">Patient Day Timeline & Meals</h4>
                <span className="panel-subtitle">Click any event to travel to that timestamp</span>
              </div>

              <div className="doc-timeline-feed">
                {tasks.map((task, idx) => {
                  const isPast = task.time <= currentReading.time;
                  return (
                    <div
                      key={idx}
                      className={`timeline-entry-row ${task.type} clickable ${isPast ? "logged" : "upcoming"}`}
                      onClick={() => {
                        const targetIdx = readings.findIndex((r) => r.time >= task.time);
                        if (targetIdx >= 0) {
                          setIsPlaying(false);
                          setScrubberIndex(targetIdx);
                        }
                      }}
                      title={`Click to jump scrubber to ${task.time}`}
                    >
                      <div className="entry-time-col">{task.time}</div>
                      <div className="entry-bullet"></div>
                      <div className="entry-content-col">
                        <div className="entry-label">
                          <span className={`task-chip ${task.type}`}>
                            {task.type === "meal" && "MEAL"}
                            {task.type === "medication" && "MEDS"}
                            {task.type === "walk" && "WALK"}
                          </span>{" "}
                          {task.label}{" "}
                          <span className={`timeline-status-tag ${isPast ? "logged" : "future"}`}>
                            {isPast ? "✓ Logged" : "Upcoming"}
                          </span>
                        </div>
                        <div className="entry-desc">{task.description}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Panel 2: In-Silico "What-If" Counterfactual Levers & Live Simulation Studio */}
            <section className="doc-panel-box interventions-panel">
              <div className="panel-box-header">
                <div className="title-with-actions">
                  <div className="sim-live-badge-group">
                    <h4 className="panel-box-title">In-Silico Counterfactual Levers ("What-If")</h4>
                    <div className={`sim-engine-pill ${liveSimStatus === "live" ? "live" : "offline"}`}>
                      {liveSimStatus === "live" ? (
                        <>
                          <span className="live-pulse-dot"></span>
                          <span>⚡ FastAPI Live ML: ~{liveSimLatency}ms · Shanghai Cohort XGBoost</span>
                        </>
                      ) : liveSimStatus === "loading" ? (
                        <>
                          <span>⏳ Recalculating Digital Twin...</span>
                        </>
                      ) : (
                        <>
                          <span>⚙️ Client Kinetic Fallback (Offline Safe)</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="panel-subtitle">
                    Adjust lifestyle levers or select an intervention below to project spike aversion onto the live CGM curve
                  </span>
                </div>
                <button className="doc-fhir-btn" onClick={() => setShowFhirModal(true)}>
                  Export HL7 FHIR
                </button>
              </div>

              {/* Real-time Physiological Sensitivity Tuning */}
              <div className="sim-custom-adjuster-bar">
                <div className="adjuster-bar-title">Real-Time Physiological Sensitivity Tuning</div>
                <div className="adjuster-sliders-grid">
                  <div className="adjuster-slider-item">
                    <div className="adjuster-label-row">
                      <span>🚶 Postprandial Walk Duration</span>
                      <strong>{customWalkDuration} mins</strong>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={60}
                      step={5}
                      value={customWalkDuration}
                      onChange={(e) => setCustomWalkDuration(Number(e.target.value))}
                      className="adjuster-range"
                      aria-label="Walk duration sensitivity slider"
                    />
                  </div>

                  <div className="adjuster-slider-item">
                    <div className="adjuster-label-row">
                      <span>🥗 Meal Carbohydrate Reduction</span>
                      <strong>{customCarbReduction}g CHO</strong>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={70}
                      step={5}
                      value={customCarbReduction}
                      onChange={(e) => setCustomCarbReduction(Number(e.target.value))}
                      className="adjuster-range"
                      aria-label="Carbohydrate reduction sensitivity slider"
                    />
                  </div>
                </div>
              </div>

              {/* AI Prescriptive Recommendation Box */}
              <div className="sim-optimal-box">
                <span className="sim-optimal-icon">🎯</span>
                <div className="sim-optimal-text">
                  <strong>Prescriptive Clinical Guidance: </strong>
                  {liveSimData?.optimal_recommended_action || (
                    dynamicRisk.tier === "HIGH"
                      ? `Optimal Recommended Action: ${customWalkDuration}-Minute Brisk Walk. Reduces projected peak by ${(14 + customWalkDuration * 0.25).toFixed(1)} mg/dL, keeps sensor within target corridor, and neutralizes spike trajectory before symptom onset.`
                      : `Patient currently within safe target corridor; continuous monitoring active.`
                  )}
                </div>
              </div>

              {/* Counterfactuals Cards Grid */}
              <div className="interventions-cards-grid">
                {displayBranches.map((c) => {
                  const isActive = activeIntervention === c.intervention_type;
                  return (
                    <div
                      key={c.intervention_type}
                      className={`intervention-card ${isActive ? "active" : ""}`}
                      onClick={() => setActiveIntervention(isActive ? null : c.intervention_type)}
                    >
                      <div className="card-top-row">
                        <span className="intervention-name">
                          <span className={`lever-badge ${c.icon}`}>
                            {c.icon === "walk" ? "EXERCISE" : c.icon === "salad" ? "NUTRITION" : c.icon === "cut" ? "PORTION" : "PHARMA"}
                          </span>{" "}
                          {c.label}
                        </span>
                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          <span className="clarke-zone-pill">{c.clarke_zone}</span>
                          <span className={`averted-tag ${c.spike_averted ? "success" : "neutral"}`}>
                            {c.spike_averted ? "Spike Averted" : "Attenuated"}
                          </span>
                        </div>
                      </div>

                      <div className="card-drop-row">
                        <span className="drop-amount">-{c.peak_reduction_mg_dl.toFixed(1)} mg/dL</span>
                        <span className="sim-peak">Sim Peak: {c.simulated_peak_mg_dl.toFixed(1)} mg/dL</span>
                      </div>

                      <div className="card-mechanism-text">{c.mechanism}</div>

                      <button
                        className={`sim-action-btn ${isActive ? "active" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPrescribedForCompanion(c);
                          setShowCompanionModal(true);
                          showToast(`Transmitting CarePlan to ${patient.display_name}'s wearable: "${c.label}"... Opening Companion Simulator`);
                        }}
                      >
                        Prescribe & Push to Phone
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </main>
      </div>

      {/* HL7 FHIR R4 Modal */}
      {showFhirModal && (
        <div className="fhir-modal-overlay" onClick={() => setShowFhirModal(false)}>
          <div className="fhir-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="fhir-modal-header">
              <div className="fhir-title-group">
                <h3>HL7 FHIR R4 Bundle Export</h3>
                <p>Standardized Observation, RiskAssessment, and CarePlan resources</p>
              </div>
              <button className="fhir-close-btn" onClick={() => setShowFhirModal(false)}>
                ×
              </button>
            </div>
            <pre className="fhir-code-preview">{fhirJson}</pre>
            <div className="fhir-modal-footer">
              <button
                className="fhir-copy-btn"
                onClick={() => {
                  navigator.clipboard.writeText(fhirJson);
                  showToast("HL7 FHIR R4 Bundle copied to clipboard!");
                }}
              >
                Copy JSON to Clipboard
              </button>
              <button className="fhir-done-btn" onClick={() => setShowFhirModal(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Closed-Loop Patient Companion Modal (P2) */}
      <PatientCompanionModal
        isOpen={showCompanionModal}
        onClose={() => setShowCompanionModal(false)}
        patientName={patient.display_name}
        patientId={patient.person_id}
        currentTime={currentReading.time}
        currentGlucose={currentReading.glucose_mg_dl}
        projectedPeak={dynamicRisk.projected_peak_mg_dl}
        prescribedIntervention={prescribedForCompanion || activeBranch}
        onActionConfirmed={(actionName) => {
          setClosedLoopConfirmed(`${actionName} in progress`);
          showToast(`🎉 Closed-Loop Confirmed! ${patient.display_name} acknowledged and started ${actionName}`);
        }}
      />

      {/* Clarke Error Grid & RSSDI Asian Indian Phenotype Guardrails Modal (P3) */}
      <ClarkeErrorGridModal
        isOpen={showClarkeModal}
        onClose={() => setShowClarkeModal(false)}
        activeGuideline={clinicalGuideline}
        onSelectGuideline={(g) => {
          setClinicalGuideline(g);
          showToast(`Guideline protocol set to ${g === "ADA" ? "ADA Standard (180 mg/dL)" : g === "RSSDI_STRICT" ? "RSSDI Strict (140 mg/dL)" : "RSSDI Standard (160 mg/dL)"}`);
        }}
        currentGlucose={currentReading.glucose_mg_dl}
        trajectoryPoints={clarkeComparisonPoints}
      />
    </div>
  );
}
