import { useId, useState } from "react";
import AuthorizedImage from "./AuthorizedImage";
import type {
  AnswerVisual as Visual,
  ChartSeries,
  Evidence,
} from "./assistantTypes";

export function EvidenceValue({ evidence }: { evidence: Evidence }) {
  const v = evidence.value;
  if (Array.isArray(v))
    return (
      <ul className="answer-value-list">
        {v.length ? (
          v.map((item, i) => (
            <li key={i}>
              {typeof item === "object"
                ? Object.entries(item)
                    .filter(([, v]) => v !== null && v !== "")
                    .map(([k, v]) => `${k.replaceAll("_", " ")}: ${v}`)
                    .join(" · ")
                : String(item)}
            </li>
          ))
        ) : (
          <li>
            No entries in the selected window; this does not establish absence.
          </li>
        )}
      </ul>
    );
  if (v !== null && typeof v === "object")
    return (
      <dl className="answer-fact-grid">
        {Object.entries(v as Record<string, unknown>)
          .filter(([, value]) => typeof value !== "object")
          .map(([key, value]) => (
            <div key={key}>
              <dt>{key.replaceAll("_", " ")}</dt>
              <dd>{String(value ?? "Not recorded")}</dd>
            </div>
          ))}
      </dl>
    );
  return (
    <span>
      {String(v ?? "Not recorded")} {evidence.unit}
    </span>
  );
}
function Chart({
  series,
  note,
  type,
}: {
  series: ChartSeries[];
  note?: string;
  type: string;
}) {
  const title = useId(),
    description = useId();
  const [cursor, setCursor] = useState<number | null>(null);
  const points = series
    .flatMap((s) => s.points)
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!points.length)
    return <p>No measured or calculated points are available.</p>;
  const minX = Math.min(...points.map((p) => p.x)),
    maxX = Math.max(minX + 15, ...points.map((p) => p.x));
  const minY = Math.max(
      0,
      Math.floor((Math.min(70, ...points.map((p) => p.y)) - 10) / 20) * 20,
    ),
    maxY = Math.ceil((Math.max(180, ...points.map((p) => p.y)) + 10) / 20) * 20;
  const x = (v: number) => 56 + ((v - minX) / (maxX - minX)) * 704,
    y = (v: number) => 224 - ((v - minY) / (maxY - minY)) * 190;
  const colors = ["#9cded5", "#e6b786", "#a6bcec", "#c8b6e6"];
  const nearest =
    cursor === null
      ? null
      : points.reduce(
          (best, p) =>
            Math.abs(p.x - cursor) < Math.abs(best.x - cursor) ? p : best,
          points[0],
        ).x;
  return (
    <figure className="answer-chart">
      <svg
        viewBox="0 0 800 280"
        role="img"
        aria-labelledby={`${title} ${description}`}
        onMouseLeave={() => setCursor(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setCursor(
            minX +
              Math.max(
                0,
                Math.min(
                  1,
                  (((e.clientX - r.left) / r.width) * 800) / 704 - 56 / 704,
                ),
              ) *
                (maxX - minX),
          );
        }}
      >
        <title id={title}>
          {type === "history"
            ? "Recorded glucose timeline"
            : "Baseline and hypothetical glucose trajectories"}
        </title>
        <desc id={description}>
          Glucose in mg/dL against minutes. Exact values are in the expandable
          data table below. {note}
        </desc>
        {[0, 1, 2, 3, 4].map((i) => {
          const v = minY + ((maxY - minY) * i) / 4;
          return (
            <g key={i}>
              <line x1="56" x2="760" y1={y(v)} y2={y(v)} stroke="#294653" />
              <text
                x="46"
                y={y(v) + 4}
                textAnchor="end"
                fill="#9bb8c2"
                fontSize="11"
              >
                {Math.round(v)}
              </text>
            </g>
          );
        })}
        {[70, 180].map((v) => (
          <g key={v}>
            <line
              x1="56"
              x2="760"
              y1={y(v)}
              y2={y(v)}
              stroke="#84775c"
              strokeDasharray="3 6"
            />
            <text
              x="758"
              y={y(v) - 5}
              textAnchor="end"
              fill="#b9ab8b"
              fontSize="9"
            >
              {v} reference
            </text>
          </g>
        ))}
        {series.map((s, i) => (
          <g key={s.label}>
            {s.points.map((p, j) => {
              const previous = s.points[j - 1];
              return previous &&
                !(type === "history" && p.x - previous.x > 15) ? (
                <line
                  key={j}
                  x1={x(previous.x)}
                  y1={y(previous.y)}
                  x2={x(p.x)}
                  y2={y(p.y)}
                  stroke={colors[i % colors.length]}
                  strokeWidth="2.5"
                  strokeDasharray={
                    s.kind === "record"
                      ? undefined
                      : s.kind === "scenario"
                        ? "5 3"
                        : "2 4"
                  }
                />
              ) : null;
            })}
            {s.points.map((p, j) => (
              <circle
                key={j}
                cx={x(p.x)}
                cy={y(p.y)}
                r="3"
                fill={colors[i % colors.length]}
              >
                <title>
                  {s.label}: {p.y} mg/dL · {p.label || `+${p.x} min`}
                </title>
              </circle>
            ))}
          </g>
        ))}
        {[0, 1, 2, 3, 4].map((i) => (
          <text
            key={i}
            x={x(minX + ((maxX - minX) * i) / 4)}
            y="249"
            textAnchor="middle"
            fill="#9bb8c2"
            fontSize="11"
          >
            {Math.round(minX + ((maxX - minX) * i) / 4)} min
          </text>
        ))}
        <text x="56" y="18" fill="#9bb8c2" fontSize="10">
          GLUCOSE · mg/dL
        </text>
        {nearest !== null && (
          <line
            x1={x(nearest)}
            x2={x(nearest)}
            y1="30"
            y2="224"
            stroke="#a3c9cb"
            strokeDasharray="3 3"
          />
        )}
      </svg>
      <div className="answer-chart-legend">
        {series.map((s, i) => (
          <span key={s.label}>
            <i style={{ background: colors[i % colors.length] }} />
            {s.label}
          </span>
        ))}
      </div>
      {nearest !== null && (
        <div className="answer-chart-cursor">
          {series.map((s) => {
            const p = s.points.find((p) => p.x === nearest);
            return p ? (
              <span key={s.label}>
                {s.label}: <b>{p.y} mg/dL</b> ·{" "}
                {p.label?.slice(11, 16) || `+${p.x} min`}
              </span>
            ) : null;
          })}
        </div>
      )}
      <figcaption>
        {note} Reference lines are not individualized treatment targets.
      </figcaption>
      <details className="answer-data-table">
        <summary>Inspect exact chart values</summary>
        <div className="answer-table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Series</th>
                <th>Time / minutes</th>
                <th>Glucose (mg/dL)</th>
              </tr>
            </thead>
            <tbody>
              {series.flatMap((s) =>
                s.points.map((p, i) => (
                  <tr key={`${s.label}-${i}`}>
                    <td>{s.label}</td>
                    <td>{p.label || `+${p.x}`}</td>
                    <td>{p.y}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
function Scan({ visual, patientId }: { visual: Visual; patientId: string }) {
  const [slice, setSlice] = useState(0);
  const study = visual.study;
  if (!study || study.patient_id !== patientId)
    return (
      <div className="answer-missing">
        <b>No matching scan available</b>
        <p>{visual.note}</p>
      </div>
    );
  const url = study.image_url.replace(
    "{index}",
    String(slice).padStart(3, "0"),
  );
  if (!url.startsWith(`/api/v1/imaging/files/${patientId}/`))
    return <p>Scan path could not be verified for this patient.</p>;
  return (
    <div className="answer-scan">
      <span className="subtle-tag">
        {study.synthetic
          ? "Synthetic demonstration · not a patient scan"
          : "Stored imaging study"}
      </span>
      <AuthorizedImage
        src={url}
        alt={`${study.synthetic ? "Synthetic" : "Stored"} axial scan slice ${slice + 1}`}
      />
      <label>
        Slice {slice + 1} of {study.slices}
        <input
          aria-label="Answer scan slice"
          type="range"
          min="0"
          max={study.slices - 1}
          value={slice}
          onChange={(e) => setSlice(Number(e.target.value))}
        />
      </label>
      <p className="caption">{visual.note}</p>
    </div>
  );
}
export default function AnswerVisual({
  visual,
  patientId,
}: {
  visual: Visual;
  patientId: string;
}) {
  return (
    <section className="answer-visual" aria-label={visual.title}>
      <span className="eyebrow">Visual explanation</span>
      <h4>{visual.title}</h4>
      {(visual.type === "history" || visual.type === "trajectory") && (
        <Chart
          series={visual.series || []}
          note={visual.note}
          type={visual.type}
        />
      )}
      {visual.type === "metrics" && (
        <div className="answer-metrics">
          {visual.metrics?.length ? (
            visual.metrics.map((e) => (
              <div key={e.id}>
                <span>{e.label}</span>
                <div>
                  <EvidenceValue evidence={e} />
                </div>
                <small>{e.timestamp || "Baseline / source snapshot"}</small>
              </div>
            ))
          ) : (
            <p className="caption">
              The explanation below identifies the evidence available for this
              question.
            </p>
          )}
        </div>
      )}
      {visual.type === "explanation" && (
        <ol className="answer-explainer">
          {visual.steps?.map((s) => (
            <li key={s.title}>
              <b>{s.title}</b>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      )}
      {visual.type === "scan" && <Scan visual={visual} patientId={patientId} />}
    </section>
  );
}
