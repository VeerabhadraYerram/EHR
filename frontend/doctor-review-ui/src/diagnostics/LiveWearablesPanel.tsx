import { useEffect } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import type { Reading } from "./types";
interface Props {
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
}: Props) {
  const current = readings[currentIndex],
    past = readings.slice(0, currentIndex + 1),
    prev = readings[Math.max(0, currentIndex - 2)];
  const elapsed =
    current && prev
      ? (new Date(current.reading_time).getTime() -
          new Date(prev.reading_time).getTime()) /
        3600000
      : 0;
  const velocity =
    elapsed > 0 ? (current.glucose_mg_dl - prev.glucose_mg_dl) / elapsed : 0;
  const tir = past.length
    ? Math.round(
        (past.filter((r) => r.glucose_mg_dl >= 70 && r.glucose_mg_dl <= 180)
          .length /
          past.length) *
          100,
      )
    : null;
  const mean = past.length
    ? past.reduce((s, r) => s + r.glucose_mg_dl, 0) / past.length
    : null;
  const peakIndex = readings.length
    ? readings.reduce((best, r, i, arr) => (r.glucose_mg_dl > arr[best].glucose_mg_dl ? i : best), 0)
    : 0;
  const nadirIndex = readings.length
    ? readings.reduce((best, r, i, arr) => (r.glucose_mg_dl < arr[best].glucose_mg_dl ? i : best), 0)
    : 0;
  const mealIndex = readings.findIndex((r) => r.meal_carbs_g != null && r.meal_carbs_g > 0);
  useEffect(() => {
    if (!isRunning || !readings.length) return;
    const timer = setInterval(() => {
      if (currentIndex < readings.length - 1) onIndexChange(currentIndex + 1);
      else onToggleRunning();
    }, 2500 / playbackSpeed);
    return () => clearInterval(timer);
  }, [
    isRunning,
    readings.length,
    currentIndex,
    playbackSpeed,
    onIndexChange,
    onToggleRunning,
  ]);
  const w = 920,
    h = 130,
    min = Math.min(50, ...past.map((r) => r.glucose_mg_dl)),
    max = Math.max(240, ...past.map((r) => r.glucose_mg_dl));
  const points = past
    .map(
      (r, i) =>
        `${20 + (i / Math.max(1, readings.length - 1)) * (w - 40)},${15 + ((max - r.glucose_mg_dl) / (max - min)) * (h - 30)}`,
    )
    .join(" ");
  return (
    <section
      className="paper-card sensor-card"
      aria-label="Recorded CGM playback"
    >
      <div className="card-heading">
        <div>
          <span className="eyebrow">Recorded FreeStyle Libre CGM</span>
          <h2>Move through the recording</h2>
        </div>
        <span className="subtle-tag">{readings.length} readings · replay</span>
      </div>
      {!current ? (
        <div className="empty-state">
          <h3>No readings available</h3>
          <p>Select a recorded day. No sensor values are invented.</p>
        </div>
      ) : (
        <>
          <div className="sensor-metrics">
            <div>
              <span>Glucose at {current.time}</span>
              <strong
                className={current.glucose_mg_dl >= 180 ? "text-danger" : ""}
              >
                {current.glucose_mg_dl.toFixed(1)}
                <small>mg/dL</small>
              </strong>
            </div>
            <div>
              <span>Recent change</span>
              <strong>
                {velocity > 0 ? "+" : ""}
                {velocity.toFixed(1)}
                <small>mg/dL/h</small>
              </strong>
            </div>
            <div>
              <span>Time in range so far</span>
              <strong>
                {tir}
                <small>%</small>
              </strong>
            </div>
            <div>
              <span>Mean so far</span>
              <strong>
                {mean?.toFixed(1)}
                <small>mg/dL</small>
              </strong>
            </div>
          </div>
          <svg
            viewBox={`0 0 ${w} ${h}`}
            className="sensor-chart"
            aria-label="CGM measurements up to the selected moment"
            role="img"
          >
            <line
              x1="20"
              x2={w - 20}
              y1={15 + ((max - 180) / (max - min)) * (h - 30)}
              y2={15 + ((max - 180) / (max - min)) * (h - 30)}
              className="threshold-line"
            />
            <polyline points={points} className="history-line" />
            {past.length > 0 && (
              <circle
                cx={
                  20 +
                  (currentIndex / Math.max(1, readings.length - 1)) * (w - 40)
                }
                cy={
                  15 + ((max - current.glucose_mg_dl) / (max - min)) * (h - 30)
                }
                r="5"
                className="forecast-point"
              />
            )}
          </svg>
          {/* Steppers & Timeline scrub bar */}
          <div className="scrub-container">
            <button
              type="button"
              className="stepper-nav-btn"
              onClick={() => onIndexChange(Math.max(0, currentIndex - 1))}
              disabled={currentIndex <= 0}
              title="Step back 1 reading (15 min)"
              aria-label="Previous reading"
            >
              ◀ −15m
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(0, readings.length - 1)}
              value={currentIndex}
              aria-label="Scrub CGM reading timeline"
              aria-valuetext={`${current.reading_time}, ${current.glucose_mg_dl} mg/dL`}
              onChange={(e) => onIndexChange(Number(e.target.value))}
            />
            <button
              type="button"
              className="stepper-nav-btn"
              onClick={() => onIndexChange(Math.min(readings.length - 1, currentIndex + 1))}
              disabled={currentIndex >= readings.length - 1}
              title="Step forward 1 reading (15 min)"
              aria-label="Next reading"
            >
              +15m ▶
            </button>
          </div>

          <div className="sensor-times">
            <span>{readings[0]?.time}</span>
            <span className="current-scrub-time">
              {current.reading_time.slice(0, 10)} · {current.time}
            </span>
            <span>{readings[readings.length - 1]?.time}</span>
          </div>

          {/* Quick Event Jump Bar */}
          <div className="event-jumps-bar">
            <span className="jumps-label">Jump to:</span>
            <div className="jumps-row">
              <button
                type="button"
                className={`jump-chip ${currentIndex === 0 ? "active" : ""}`}
                onClick={() => onIndexChange(0)}
              >
                ⏮ Start ({readings[0]?.time || 'first reading'})
              </button>
              {mealIndex !== -1 && (
                <button
                  type="button"
                  className={`jump-chip ${currentIndex === mealIndex ? "active" : ""}`}
                  onClick={() => onIndexChange(mealIndex)}
                  title={`Recorded meal: ${readings[mealIndex].meal_carbs_g}g carbs at ${readings[mealIndex].time}`}
                >
                  🍽️ Meal ({readings[mealIndex].meal_carbs_g}g)
                </button>
              )}
              {readings[peakIndex] && (
                <button
                  type="button"
                  className={`jump-chip peak ${currentIndex === peakIndex ? "active" : ""}`}
                  onClick={() => onIndexChange(peakIndex)}
                  title={`Daily Peak: ${readings[peakIndex].glucose_mg_dl.toFixed(1)} mg/dL at ${readings[peakIndex].time}`}
                >
                  📈 Peak ({Math.round(readings[peakIndex].glucose_mg_dl)} mg/dL)
                </button>
              )}
              {readings[nadirIndex] && (
                <button
                  type="button"
                  className={`jump-chip nadir ${currentIndex === nadirIndex ? "active" : ""}`}
                  onClick={() => onIndexChange(nadirIndex)}
                  title={`Daily Nadir: ${readings[nadirIndex].glucose_mg_dl.toFixed(1)} mg/dL at ${readings[nadirIndex].time}`}
                >
                  📉 Nadir ({Math.round(readings[nadirIndex].glucose_mg_dl)} mg/dL)
                </button>
              )}
              <button
                type="button"
                className={`jump-chip ${currentIndex === readings.length - 1 ? "active" : ""}`}
                onClick={() => onIndexChange(readings.length - 1)}
              >
                ⏭ Latest ({readings[readings.length - 1]?.time})
              </button>
            </div>
          </div>

          <div className="sensor-controls">
            <div className="button-row">
              <button
                className="button primary"
                aria-label={
                  isRunning ? "Pause sensor timeline" : "Run sensor timeline"
                }
                onClick={onToggleRunning}
              >
                {isRunning ? <Pause size={14} /> : <Play size={14} />}{" "}
                {isRunning ? "Pause replay" : "Play recording"}
              </button>

              {/* Speed Selector Chips */}
              <div className="speed-chips-group" role="group" aria-label="Playback speed">
                {[1, 2, 5, 10].map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`speed-chip ${playbackSpeed === s ? "active" : ""}`}
                    onClick={() => onSpeedChange(s)}
                    aria-pressed={playbackSpeed === s}
                  >
                    {s}×
                  </button>
                ))}
              </div>

              <button
                className="icon-button"
                onClick={() => onIndexChange(0)}
                aria-label="Reset timeline"
                title="Reset to reading 1"
              >
                <RotateCcw size={16} />
              </button>
            </div>
            <span className="caption">
              Reading {currentIndex + 1} of {readings.length} · only past data
              enters the forecast
            </span>
          </div>
          {current.meal_carbs_g != null && current.meal_carbs_g > 0 && (
            <p className="notice">
              Meal recorded: {current.meal_carbs_g} g carbohydrates{" "}
              {current.meal_description && `· ${current.meal_description}`}
            </p>
          )}
        </>
      )}
    </section>
  );
}
