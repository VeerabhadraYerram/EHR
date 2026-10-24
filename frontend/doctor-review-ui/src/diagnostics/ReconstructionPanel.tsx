import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import AuthorizedImage from "./AuthorizedImage";
import { authEnabled, downloadProtectedResource } from "../auth";
import type { Patient, Reading } from "./types";
import { requestJson, downloadJson } from "./patientService";
const Anatomy3DViewer = lazy(() => import("./Anatomy3DViewer"));
interface Study {
  patient_id: string;
  synthetic: boolean;
  modality: string;
  segmentation_method: string;
  surface_method: string;
  validation_note: string;
  patient_specificity: string;
  slices: number;
  image_url: string;
  mask_url: string;
  meshes: Array<{ id: string; url: string; sha256: string }>;
  measurements: Array<{
    organ: string;
    volume_ml: number;
    phantom_dice: number;
  }>;
  files: Array<{ name: string; url: string; sha256: string }>;
}
interface Job {
  id: string;
  status: string;
  stage: string;
  error?: string;
  study?: Study;
}
export default function ReconstructionPanel({
  patient,
  reading,
}: {
  patient: Patient;
  reading: Reading | null;
}) {
  const [study, setStudy] = useState<Study | null>(null),
    [job, setJob] = useState<Job | null>(null),
    [error, setError] = useState(""),
    [slice, setSlice] = useState(75),
    [overlay, setOverlay] = useState(true),
    [render3d, setRender3d] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    setStudy(null);
    setJob(null);
    setError("");
    setRender3d(false);
    requestJson<Study>(`/api/v1/imaging/studies/${patient.person_id}`, {
      signal: c.signal,
    })
      .then(setStudy)
      .catch((e) => {
        if (e.name !== "AbortError" && e.status !== 404) setError(e.message);
      });
    return () => c.abort();
  }, [patient.person_id]);
  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    const c = new AbortController();
    const timer = setTimeout(
      () =>
        requestJson<Job>(`/api/v1/imaging/jobs/${job.id}`, { signal: c.signal })
          .then((j) => {
            setJob(j);
            if (j.study) setStudy(j.study);
            if (j.error) setError(j.error);
          })
          .catch((e) => {
            if (e.name !== "AbortError") setError(e.message);
          }),
      1200,
    );
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [job]);
  async function generate() {
    setError("");
    setRender3d(false);
    try {
      setJob(
        await requestJson<Job>(
          `/api/v1/imaging/studies/${patient.person_id}/reconstruct`,
          { method: "POST" },
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const overrides = useMemo(
    () =>
      study?.meshes.map((m) => ({ id: m.id, url: `${m.url}?sha=${m.sha256}` })),
    [study],
  );
  const busy = job && ["queued", "running"].includes(job.status),
    index = String(slice).padStart(3, "0");
  return (
    <section className="page-stack atlas-reconstruction-section">
      <div className="paper-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">
              Checkpoint 2 · actual volume processing
            </span>
            <h2>From a synthetic CT to reconstructed organs.</h2>
          </div>
          <span className="subtle-tag">Synthetic · {patient.person_id}</span>
        </div>
        <p className="muted">
          A profile-linked, deterministically varied phantom is encoded as a CT
          volume and DICOM series, segmented with a known-phantom protocol, then
          reconstructed with marching cubes. Every displayed surface is
          generated from the resulting voxels.
        </p>
        <div className="button-row">
          <button
            className="button primary"
            disabled={Boolean(busy)}
            onClick={generate}
          >
            {busy
              ? "Processing study…"
              : study
                ? "Re-run reconstruction"
                : "Generate & reconstruct synthetic CT"}
          </button>
          {study && (
            <button
              className="button secondary"
              onClick={() =>
                downloadJson(`synthetic-study-${patient.person_id}.json`, study)
              }
            >
              Export provenance
            </button>
          )}
        </div>
        {job && (
          <p className="notice" role="status">
            {job.stage} · {job.status}
          </p>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <p className="caption">
          This demonstrates a reproducible pipeline, not acquired patient
          anatomy or clinical segmentation performance. A real CT/MRI
          integration requires authorized scans and a validated model.
        </p>
      </div>
      {study && (
        <>
          <div className="scan-study-grid">
            <section className="paper-card">
              <div className="card-heading">
                <h3>Axial CT & segmentation</h3>
                <label className="caption">
                  <input
                    type="checkbox"
                    checked={overlay}
                    onChange={(e) => setOverlay(e.target.checked)}
                  />{" "}
                  Segmentation overlay
                </label>
              </div>
              <div className="scan-slice-stage">
                <AuthorizedImage
                  src={study.image_url.replace("{index}", index)}
                  alt={`Synthetic CT axial slice ${slice + 1}`}
                />
                {overlay && (
                  <AuthorizedImage
                    className="scan-mask-overlay"
                    src={study.mask_url.replace("{index}", index)}
                    alt="Computed segmentation overlay"
                  />
                )}
                <span>SYNTHETIC PHANTOM · {patient.person_id}</span>
              </div>
              <input
                type="range"
                min="0"
                max={study.slices - 1}
                value={slice}
                aria-label="Synthetic CT axial slice"
                onChange={(e) => setSlice(Number(e.target.value))}
              />
              <p className="caption">
                Slice {slice + 1} / {study.slices} · 2 mm isotropic voxels ·
                kidneys / liver / pancreas
              </p>
            </section>
            <section className="paper-card">
              <span className="eyebrow">Measured from masks</span>
              <h3>Reconstruction evidence</h3>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Organ</th>
                    <th>Volume</th>
                    <th>Phantom Dice</th>
                  </tr>
                </thead>
                <tbody>
                  {study.measurements.map((m) => (
                    <tr key={m.organ}>
                      <td>{m.organ}</td>
                      <td>{m.volume_ml} mL</td>
                      <td>{m.phantom_dice}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="caption">{study.validation_note}</p>
              <details className="technical-details">
                <summary>Segmentation & surface methods</summary>
                <p>{study.segmentation_method}</p>
                <p>{study.surface_method}</p>
                <p>{study.patient_specificity}</p>
              </details>
              <div className="button-row">
                {study.files.map((f) => (
                  <a
                    className="button secondary"
                    key={f.name}
                    href={f.url}
                    onClick={(e) => {
                      if (authEnabled) {
                        e.preventDefault();
                        downloadProtectedResource(f.url, f.name).catch((e) =>
                          setError(e.message),
                        );
                      }
                    }}
                    download
                  >
                    {f.name}
                  </a>
                ))}
              </div>
              <button
                className="button primary"
                style={{ marginTop: 20 }}
                onClick={() => setRender3d(!render3d)}
              >
                {render3d
                  ? "Hide reconstructed surfaces"
                  : "Inspect reconstructed 3D organs"}
              </button>
            </section>
          </div>
          {render3d && overrides && (
            <Suspense
              fallback={
                <div className="paper-card">
                  Loading reconstructed surfaces…
                </div>
              }
            >
              <Anatomy3DViewer
                patient={patient}
                reading={reading}
                reconstructedMeshes={overrides}
                title="Reconstructed synthetic organs"
              />
            </Suspense>
          )}
        </>
      )}
    </section>
  );
}
