import { useEffect, useMemo, useState } from "react";

interface Point {
  t: string;
  g: number;
  steps: number;
  hr: number;
  meal: number | null;
  sleep: number;
  dose: string;
  p: number;
  rise: number;
  minutes_since_meal: number;
  last_meal_carbs: number;
  steps_2h: number;
}

interface TwinPatient {
  person_id: string;
  display_name: string;
  is_demo: string;
  age_years: number;
  sex: string;
  years_with_diabetes: number;
  hba1c_percent: number;
  on_insulin: string;
  metformin_dose_mg_per_day: number;
  split: string;
  points: Point[];
}

interface TwinDay {
  day: string;
  high_line: number;
  warning_line: number;
  metrics: {
    roc_auc: number;
    warnings_in_time_share: number;
    precision: number;
    false_alarm_share: number;
  };
  patients: TwinPatient[];
}

function riskLabel(chance: number, line: number): "High" | "Watch" | "Calm" {
  if (chance >= line) return "High";
  if (chance >= 0.25) return "Watch";
  return "Calm";
}

function pathFrom(values: number[], min: number, max: number, width: number, height: number): string {
  if (values.length < 2) return "";
  const span = Math.max(max - min, 1);
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 16) - 8;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function reasonsFor(patient: TwinPatient, point: Point): string[] {
  const reasons: string[] = [];
  reasons.push(
    point.g >= 180
      ? `Sugar is already ${point.g} mg/dL, over the 180 line.`
      : `Sugar now is ${point.g} mg/dL.`
  );
  if (point.rise >= 12) {
    reasons.push(`The line is rising by about ${point.rise} mg/dL each hour.`);
  } else if (point.rise <= -12) {
    reasons.push(`The line is falling by about ${Math.abs(point.rise)} mg/dL each hour.`);
  }
  if (point.meal) {
    reasons.push(`A meal of ${point.meal} g carbohydrate was just logged.`);
  } else if (point.minutes_since_meal >= 0 && point.minutes_since_meal <= 120) {
    reasons.push(
      `Last meal was ${point.minutes_since_meal} minutes ago (${point.last_meal_carbs} g).`
    );
  }
  if (point.dose === "missed") reasons.push("Morning metformin is marked missed.");
  if (point.dose === "unknown") reasons.push("Morning metformin has not been confirmed.");
  if (point.sleep < 5.5) reasons.push(`Sleep last night was ${point.sleep} hours.`);
  if (patient.hba1c_percent >= 8) {
    reasons.push(`HbA1c is ${patient.hba1c_percent}%, so usual sugar runs high.`);
  }
  if (point.steps_2h < 500) reasons.push(`Only ${point.steps_2h} steps in the last two hours.`);
  return reasons.slice(0, 4);
}

function actionFor(point: Point, line: number): string {
  if (point.p < 0.25) return "No extra check from this reading.";
  if (point.p < line) return "Watch. The chance is in the middle, so this is not a firm warning.";
  if (point.dose === "missed") return "Confirm the morning tablet, then consider a short walk.";
  if (point.meal || (point.minutes_since_meal >= 0 && point.minutes_since_meal <= 90)) {
    return "A 15-minute walk is the check to consider after this meal.";
  }
  return "Check in during the next two hours.";
}

function Chart({
  title,
  values,
  min,
  max,
  unit,
  guide,
}: {
  title: string;
  values: number[];
  min: number;
  max: number;
  unit: string;
  guide?: number;
}) {
  const width = 760;
  const height = 180;
  const d = pathFrom(values, min, max, width, height);
  const guideY =
    guide === undefined
      ? null
      : height - ((guide - min) / Math.max(max - min, 1)) * (height - 16) - 8;
  return (
    <section className="twin-chart">
      <div className="twin-chart-title">
        <span>{title}</span>
        <span>{unit}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="twin-svg" role="img" aria-label={title}>
        {guideY !== null && (
          <>
            <line x1={0} x2={width} y1={guideY} y2={guideY} className="twin-guide" />
            <text x={8} y={guideY - 6} className="twin-guide-label">
              {guide}
            </text>
          </>
        )}
        <path d={d} className="twin-line" />
      </svg>
    </section>
  );
}

export function DigitalTwin() {
  const [day, setDay] = useState<TwinDay | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("P001");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    fetch("/digital-twin-day.json")
      .then((response) => {
        if (!response.ok) throw new Error("Day file missing");
        return response.json();
      })
      .then((payload: TwinDay) => {
        setDay(payload);
        const demo = payload.patients.find((patient) => patient.is_demo === "yes");
        const start = demo ?? payload.patients[0];
        setSelectedId(start.person_id);
        const lunch = start.points.findIndex((point) => point.t === "12:30");
        setIndex(lunch >= 0 ? lunch : 0);
      })
      .catch(() => setError("The day file could not be loaded."));
  }, []);

  const patient = day?.patients.find((item) => item.person_id === selectedId) ?? null;
  const point = patient?.points[index] ?? null;

  const visible = useMemo(() => patient?.points.slice(0, index + 1) ?? [], [patient, index]);

  if (error) {
    return <div className="dashboard-container">{error}</div>;
  }
  if (!day || !patient || !point) {
    return <div className="dashboard-container">Loading the virtual clinic…</div>;
  }

  const label = riskLabel(point.p, day.warning_line);
  const reasons = reasonsFor(patient, point);
  const shown = day.patients.filter((item) => {
    const name = `${item.display_name} ${item.person_id}`.toLowerCase();
    return name.includes(query.trim().toLowerCase());
  });

  return (
    <div className="twin-shell">
      <aside className="twin-list">
        <div className="twin-list-head">
          <div className="stat-label">Virtual patients</div>
          <input
            className="twin-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            aria-label="Search patients"
          />
        </div>
        <div className="twin-list-scroll">
          {shown.map((item) => {
            const at = item.points[Math.min(index, item.points.length - 1)];
            const itemLabel = riskLabel(at.p, day.warning_line);
            const active = item.person_id === patient.person_id;
            return (
              <button
                key={item.person_id}
                className={`twin-person ${active ? "active" : ""}`}
                onClick={() => {
                  setSelectedId(item.person_id);
                  setIndex((current) => Math.min(current, item.points.length - 1));
                }}
              >
                <span>{item.display_name}</span>
                <span className="twin-person-meta">
                  HbA1c {item.hba1c_percent}% · {itemLabel}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <div className="twin-main">
        <header className="patient-banner">
          <div className="patient-primary">
            <div className="patient-avatar">
              {patient.display_name
                .split(" ")
                .slice(0, 2)
                .map((part) => part[0])
                .join("")}
            </div>
            <div>
              <div className="patient-name">{patient.display_name}</div>
              <div className="patient-meta-row">
                <span>
                  {patient.age_years} · {patient.sex}
                </span>
                <span>Type 2 diabetes · {patient.years_with_diabetes} years</span>
                <span>{day.day}</span>
              </div>
            </div>
          </div>
          <div className="patient-quick-stats">
            <div className="stat-item">
              <span className="stat-label">HbA1c</span>
              <span className="stat-value">{patient.hba1c_percent}%</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Metformin</span>
              <span className="stat-value">{patient.metformin_dose_mg_per_day} mg</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Insulin</span>
              <span className="stat-value">{patient.on_insulin === "yes" ? "Yes" : "No"}</span>
            </div>
          </div>
        </header>

        <section className={`twin-warning ${label.toLowerCase()}`}>
          <div>
            <div className="stat-label">Next 2 hours · {point.t}</div>
            <h2>
              {label === "High"
                ? "High chance sugar is at or above 180"
                : label === "Watch"
                  ? "Possible rise, not a firm warning"
                  : "Low chance of a high reading"}
            </h2>
            <p>{actionFor(point, day.warning_line)}</p>
          </div>
          <div className="twin-chance">{Math.round(point.p * 100)}%</div>
        </section>

        <div className="twin-reasons">
          {reasons.map((reason) => (
            <div key={reason} className="twin-reason">
              {reason}
            </div>
          ))}
        </div>

        <label className="twin-slider">
          <span>Replay the day. The chart uses only readings up to this time.</span>
          <input
            type="range"
            min={0}
            max={patient.points.length - 1}
            value={index}
            onChange={(event) => setIndex(Number(event.target.value))}
          />
          <strong>{point.t}</strong>
        </label>

        <div className="twin-params">
          <div>
            <span className="stat-label">Sugar now</span>
            <strong>{point.g} mg/dL</strong>
          </div>
          <div>
            <span className="stat-label">Rise</span>
            <strong>{point.rise} / hour</strong>
          </div>
          <div>
            <span className="stat-label">Steps, 2 hours</span>
            <strong>{point.steps_2h}</strong>
          </div>
          <div>
            <span className="stat-label">Heart rate</span>
            <strong>{point.hr}</strong>
          </div>
          <div>
            <span className="stat-label">Sleep</span>
            <strong>{point.sleep} h</strong>
          </div>
          <div>
            <span className="stat-label">Morning tablet</span>
            <strong>{point.dose}</strong>
          </div>
        </div>

        <Chart
          title="Blood sugar so far today"
          values={visible.map((item) => item.g)}
          min={60}
          max={320}
          unit="mg/dL"
          guide={180}
        />
        <Chart
          title="Chance of a high reading in the next 2 hours"
          values={visible.map((item) => Math.round(item.p * 100))}
          min={0}
          max={100}
          unit="percent"
          guide={Math.round(day.warning_line * 100)}
        />
        <Chart
          title="Steps in each 15 minutes"
          values={visible.map((item) => item.steps)}
          min={0}
          max={1600}
          unit="steps"
        />

        <section className="twin-table-wrap">
          <div className="twin-chart-title">
            <span>Readings up to {point.t}</span>
            <span>Latest rows</span>
          </div>
          <table className="twin-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Sugar</th>
                <th>Chance</th>
                <th>Meal</th>
                <th>Steps</th>
                <th>Sleep</th>
                <th>Tablet</th>
              </tr>
            </thead>
            <tbody>
              {visible.slice(-8).map((item) => (
                <tr key={item.t}>
                  <td>{item.t}</td>
                  <td>{item.g}</td>
                  <td>{Math.round(item.p * 100)}%</td>
                  <td>{item.meal ? `${item.meal} g` : "—"}</td>
                  <td>{item.steps}</td>
                  <td>{item.sleep} h</td>
                  <td>{item.dose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <p className="twin-footnote">
          Checked once on 20 people the model never learned from. Rank score {day.metrics.roc_auc}.
          Warned in time for {Math.round(day.metrics.warnings_in_time_share * 100)}% of real spikes.
          False alarm on {Math.round(day.metrics.false_alarm_share * 100)}% of calm moments. Synthetic
          day, not a real patient.
        </p>
      </div>
    </div>
  );
}
