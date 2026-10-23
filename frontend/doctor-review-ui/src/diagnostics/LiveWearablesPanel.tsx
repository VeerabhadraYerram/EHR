import { useEffect } from "react";
import type { Reading } from "./types";
import { Play, Pause, RotateCcw, FastForward, Activity, Utensils, Zap, Radio } from "lucide-react";

interface LiveWearablesPanelProps {
  readings: Reading[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  isRunning: boolean;
  onToggleRunning: () => void;
  playbackSpeed: number;
  onSpeedChange: (speed: number) => void;
}

export default function LiveWearablesPanel({
  readings,
  currentIndex,
  onIndexChange,
  isRunning,
  onToggleRunning,
  playbackSpeed,
  onSpeedChange,
}: LiveWearablesPanelProps) {
  const currentReading = readings[currentIndex] || readings[readings.length - 1] || {
    glucose_mg_dl: 120,
    time: "12:00",
    reading_time: "",
  };

  // Compute live velocity: change over last 2 readings (30 min = 0.5 hr)
  const prevReading = currentIndex >= 2 ? readings[currentIndex - 2] : readings[0];
  const velocityPerHour =
    prevReading && currentReading
      ? Math.round(((currentReading.glucose_mg_dl - prevReading.glucose_mg_dl) / 0.5) * 10) / 10
      : 0;

  // Compute TIR across all available readings
  const inRangeCount = readings.filter((r) => r.glucose_mg_dl >= 70 && r.glucose_mg_dl <= 180).length;
  const tirPct = readings.length > 0 ? Math.round((inRangeCount / readings.length) * 100) : 80;

  // Compute Mean Glucose
  const meanGlucose =
    readings.length > 0
      ? Math.round((readings.reduce((acc, r) => acc + r.glucose_mg_dl, 0) / readings.length) * 10) / 10
      : 125;

  // Auto-advance timeline when running
  useEffect(() => {
    if (!isRunning || readings.length === 0) return;
    const interval = setInterval(() => {
      onIndexChange((currentIndex + 1) % readings.length);
    }, 1000 / playbackSpeed);

    return () => clearInterval(interval);
  }, [isRunning, playbackSpeed, readings.length, currentIndex, onIndexChange]);

  // SVG wave of current readings up to scrubber index
  const visibleReadings = readings.slice(0, currentIndex + 1);
  const minG = 50;
  const maxG = 300;
  const svgWidth = 460;
  const svgHeight = 70;

  const points = visibleReadings.map((r, i) => {
    const x = readings.length > 1 ? (i / (readings.length - 1)) * svgWidth : 0;
    const y = svgHeight - ((Math.min(maxG, Math.max(minG, r.glucose_mg_dl)) - minG) / (maxG - minG)) * (svgHeight - 14) - 7;
    return `${x},${y}`;
  });

  const polylineStr = points.join(" ");

  // Color code current glucose level
  const gVal = currentReading.glucose_mg_dl;
  const isHighSpike = gVal >= 180;
  const isElevated = gVal >= 140 && gVal < 180;
  const isHypo = gVal < 70;
  const statusColor = isHighSpike ? "#f87171" : isElevated ? "#fbbf24" : isHypo ? "#60a5fa" : "#34d399";
  const statusLabel = isHighSpike ? "ACUTE SPIKE" : isElevated ? "ELEVATED" : isHypo ? "HYPOGLYCEMIA" : "IN RANGE (TIR)";

  return (
    <section className="dx-panel dx-physiology dx-wearables-panel">
      <header className="dx-panel-heading">
        <h2>
          <span>WEARABLES /</span> LIVE PHYSIOLOGY & CGM
        </h2>
        <span className="dx-panel-tag">ABBOTT FREESTYLE LIBRE</span>
      </header>

      {/* Live Vitals Telemetry Row */}
      <div className="dx-vitals-wearables-row">
        <div className="dx-vital-tile highlight" style={{ borderColor: `${statusColor}44` }}>
          <div className="dx-vital-top">
            <span className="dx-vital-label">INTERSTITIAL GLUCOSE</span>
            <span className="dx-vital-status-pill" style={{ color: statusColor, borderColor: statusColor }}>
              {statusLabel}
            </span>
          </div>
          <div className="dx-vital-hero-val">
            <strong style={{ color: statusColor }}>{Math.round(gVal)}</strong>
            <small>mg/dL</small>
          </div>
          <div className="dx-vital-sub">
            Time: <strong>{currentReading.time || "12:00"}</strong>
          </div>
        </div>

        <div className="dx-vital-tile">
          <div className="dx-vital-top">
            <span className="dx-vital-label">GLUCOSE VELOCITY</span>
            <Activity size={11} className="dx-vital-icon" />
          </div>
          <div className="dx-vital-hero-val">
            <strong className={velocityPerHour > 15 ? "alert" : velocityPerHour < -15 ? "blue" : ""}>
              {velocityPerHour > 0 ? `+${velocityPerHour}` : velocityPerHour}
            </strong>
            <small>mg/dL/h</small>
          </div>
          <div className="dx-vital-sub">
            Trend: <strong>{velocityPerHour > 15 ? "Rapid Rise ↗" : velocityPerHour < -15 ? "Rapid Drop ↘" : "Stable →"}</strong>
          </div>
        </div>

        <div className="dx-vital-tile">
          <div className="dx-vital-top">
            <span className="dx-vital-label">TIME-IN-RANGE (TIR)</span>
            <Zap size={11} className="dx-vital-icon" />
          </div>
          <div className="dx-vital-hero-val">
            <strong>{tirPct}</strong>
            <small>%</small>
          </div>
          <div className="dx-vital-sub">
            Target: <strong>&gt;70% (70-180)</strong>
          </div>
        </div>

        <div className="dx-vital-tile">
          <div className="dx-vital-top">
            <span className="dx-vital-label">24H MEAN GLUCOSE</span>
            <Radio size={11} className="dx-vital-icon" />
          </div>
          <div className="dx-vital-hero-val">
            <strong>{meanGlucose}</strong>
            <small>mg/dL</small>
          </div>
          <div className="dx-vital-sub">
            Sensor: <strong>96 Intervals</strong>
          </div>
        </div>
      </div>

      {/* Interactive Timeline & Playback Control Bar */}
      <div className="dx-wearable-controls-bar">
        <div className="dx-playback-buttons">
          <button
            className={`dx-play-btn ${isRunning ? "running" : ""}`}
            onClick={onToggleRunning}
            aria-label={isRunning ? "Pause sensor timeline" : "Run sensor timeline"}
          >
            {isRunning ? <Pause size={12} /> : <Play size={12} />}
            <span>{isRunning ? "PAUSE STREAM" : "RUN STREAM"}</span>
          </button>

          <button
            className="dx-speed-btn"
            onClick={() => onSpeedChange(playbackSpeed === 1 ? 2 : playbackSpeed === 2 ? 5 : 1)}
            title="Toggle playback speed"
          >
            <FastForward size={11} />
            <span>{playbackSpeed}x SPEED</span>
          </button>

          <button
            className="dx-reset-btn"
            onClick={() => onIndexChange(0)}
            title="Reset to 00:00"
            aria-label="Reset timeline"
          >
            <RotateCcw size={11} />
          </button>
        </div>

        {/* Meal Event Notice if current reading has meal */}
        {currentReading.meal_carbs_g && currentReading.meal_carbs_g > 0 && (
          <div className="dx-meal-event-badge">
            <Utensils size={11} />
            <span>
              MEAL LOGGED: <strong>{currentReading.meal_carbs_g}g Carbs</strong>{" "}
              {currentReading.meal_description && `(${currentReading.meal_description})`}
            </span>
          </div>
        )}

        <div className="dx-sensor-quality-tag">
          <span className="dx-pulse-dot" />
          <span>CONTINUOUS TELEMETRY · 15-MIN SAMPLE</span>
        </div>
      </div>

      {/* Interactive Timeline Scrubber Slider */}
      <div className="dx-timeline-scrubber-container">
        <div className="dx-timeline-labels-row">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>23:45</span>
        </div>

        <input
          type="range"
          min={0}
          max={Math.max(1, readings.length - 1)}
          value={currentIndex}
          onChange={(e) => onIndexChange(Number(e.target.value))}
          className="dx-timeline-slider"
          aria-label="Scrub CGM reading timeline"
        />

        <div className="dx-scrubber-caption">
          <span>
            TIMELINE POSITION: <strong>{currentReading.time || "12:00"}</strong> ({currentIndex + 1} / {readings.length} readings)
          </span>
          <span>DRAG SCRUBBER TO SIMULATE TELEMETRY MOMENT</span>
        </div>
      </div>

      {/* Live Wearable CGM Stream Wave Display */}
      <div className="dx-ecg-display dx-wearable-wave-display">
        <div className="dx-ecg-grid" />
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          preserveAspectRatio="none"
          className="dx-wearable-svg-chart"
          aria-hidden="true"
        >
          {/* Target Zone Shading 70-180 mg/dL */}
          <rect
            x="0"
            y={svgHeight - ((180 - minG) / (maxG - minG)) * (svgHeight - 14) - 7}
            width={svgWidth}
            height={((180 - 70) / (maxG - minG)) * (svgHeight - 14)}
            fill="#34d39908"
            stroke="#34d39922"
            strokeDasharray="3 3"
          />

          {/* Historical Readings Polyline */}
          {points.length > 1 && (
            <polyline
              points={polylineStr}
              fill="none"
              stroke="#00e5ff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Current Leading Point Glow */}
          {points.length > 0 && (
            <circle
              cx={points[points.length - 1].split(",")[0]}
              cy={points[points.length - 1].split(",")[1]}
              r="4.5"
              fill={statusColor}
              stroke="#ffffff"
              strokeWidth="1.5"
            />
          )}
        </svg>
        <i
          className="dx-ecg-cursor"
          style={{
            left: `${readings.length > 1 ? (currentIndex / (readings.length - 1)) * 100 : 0}%`,
          }}
        />
      </div>

      <div className="dx-physiology-footer">
        <div className="dx-led-row">
          <span>SENSOR INTEGRITY</span>
          <div className="dx-led-track">
            {Array.from({ length: 32 }, (_, i) => (
              <i key={i} className={i < 30 ? "lit" : ""} />
            ))}
          </div>
          <strong>98%</strong>
        </div>
        <span>FREESTYLE LIBRE 14-DAY WEARABLE SENSOR</span>
      </div>
      <i className="dx-panel-decoration" />
    </section>
  );
}
