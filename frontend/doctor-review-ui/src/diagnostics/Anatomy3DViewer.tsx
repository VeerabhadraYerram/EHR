import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RotateCcw, Maximize2, Layers3, Play, Pause } from "lucide-react";
import type { Patient, Reading, PatientSimulation } from "./types";
import "./anatomy-3d.css";
interface MeshSpec {
  id: string;
  label: string;
  layer: string;
  url: string;
  color: string;
  triangles: number;
  bounds_mm: { min: number[]; max: number[] };
}
interface AtlasManifest {
  source: string;
  license: string;
  license_url: string;
  meshes: MeshSpec[];
}
interface Props {
  patient: Patient;
  reading: Reading | null;
  simulation?: PatientSimulation | null;
  active?: boolean;
  compact?: boolean;
  projectedGlucose?: number;
  title?: string;
  reconstructedMeshes?: Array<{ id: string; url: string }>;
}
const cache = new Map<string, Promise<THREE.BufferGeometry>>();
function geometry(url: string) {
  if (!cache.has(url))
    cache.set(
      url,
      new GLTFLoader().loadAsync(url).then((gltf) => {
        let result: THREE.BufferGeometry | undefined;
        gltf.scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) result = (o as THREE.Mesh).geometry;
        });
        if (!result) throw new Error("Model has no mesh");
        return result;
      }),
    );
  return cache.get(url)!;
}
const organNotes: Record<string, string> = {
  heart:
    "Heartbeat animation is a derived visual cue. It is not a measured ECG or a cardiovascular event forecast.",
  brain:
    "Color tracks glucose availability as a visual analogy, not a neurological diagnosis.",
  pancreas:
    "The displayed beta-cell demand is a simplified estimate conditioned on glucose and baseline C-peptide.",
  kidneys:
    "Renal context uses the recorded eGFR. The reference shape is not evidence of kidney damage.",
  liver:
    "Hepatic context reflects recorded medication and glucose; geometry is a reference atlas.",
  lungs:
    "Reference lung anatomy. No respiratory risk model is trained in this prototype.",
};
export default function Anatomy3DViewer({
  patient,
  reading,
  simulation,
  active = true,
  compact = false,
  projectedGlucose,
  title = "Anatomical digital twin",
  reconstructedMeshes,
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    stage = useRef<{
      scene: THREE.Scene;
      camera: THREE.PerspectiveCamera;
      controls: OrbitControls;
      meshes: Map<string, THREE.Mesh>;
      reset: () => void;
      focus: (id: string) => void;
      renderer: THREE.WebGLRenderer;
    } | null>(null);
  const [manifest, setManifest] = useState<AtlasManifest | null>(null),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(0),
    [selected, setSelected] = useState(
      reconstructedMeshes ? "kidneys" : "body",
    ),
    [layers, setLayers] = useState<Record<string, boolean>>({
      surface: false,
      skeleton: true,
      muscles: false,
      vascular: true,
      nervous: false,
      organs: true,
    }),
    [opacity, setOpacity] = useState(0.22),
    [rotate, setRotate] = useState(false),
    [wireframe, setWireframe] = useState(false);
  const state = useRef({
    selected,
    layers,
    opacity,
    rotate,
    wireframe,
    glucose: projectedGlucose ?? reading?.glucose_mg_dl ?? null,
    cPeptide: Number(patient.fasting_c_peptide_nmol_l),
    egfr: Number(patient.egfr),
  });
  state.current = {
    selected,
    layers,
    opacity,
    rotate,
    wireframe,
    glucose: projectedGlucose ?? reading?.glucose_mg_dl ?? null,
    cPeptide: Number(patient.fasting_c_peptide_nmol_l),
    egfr: Number(patient.egfr),
  };
  useEffect(() => {
    const c = new AbortController();
    fetch("/anatomy/manifest.json", { signal: c.signal })
      .then((r) => {
        if (!r.ok)
          throw new Error(
            "Anatomy manifest unavailable. Run the asset build step.",
          );
        return r.json();
      })
      .then(setManifest)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => c.abort();
  }, []);
  useEffect(() => {
    if (!active || !manifest || !host.current) return;
    let disposed = false,
      frame = 0;
    const element = host.current;
    setError("");
    setLoaded(0);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      setError(
        "WebGL could not start on this device. Enable hardware acceleration or use a WebGL-capable browser.",
      );
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setClearColor("#ecece4");
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    element.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D anatomy. Drag to rotate, scroll to zoom. Use the organ buttons for keyboard selection.",
    );
    renderer.domElement.setAttribute("role", "img");
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff8ed, 0x737c77, 2.1));
    const light = new THREE.DirectionalLight(0xfff1e1, 3);
    light.position.set(3, 4, 5);
    scene.add(light);
    const fill = new THREE.DirectionalLight(0xc7d7da, 1.5);
    fill.position.set(-3, 1, -3);
    scene.add(fill);
    const camera = new THREE.PerspectiveCamera(32, 1, 0.005, 100);
    camera.position.set(0, 0.05, 5.8);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.15;
    controls.maxDistance = 12;
    controls.enablePan = true;
    controls.target.set(0, 0, 0);
    const root = new THREE.Group(),
      original = new THREE.Group();
    root.rotation.x = -Math.PI / 2;
    root.add(original);
    scene.add(root);
    const skin =
      manifest.meshes.find((m) => m.id === "skin") || manifest.meshes[0];
    const min = skin.bounds_mm.min,
      max = skin.bounds_mm.max;
    const center = new THREE.Vector3(...(min as [number, number, number]))
      .add(new THREE.Vector3(...(max as [number, number, number])))
      .multiplyScalar(0.5);
    const scale = 2.8 / (max[2] - min[2]);
    root.scale.setScalar(scale);
    original.position.copy(center).multiplyScalar(-1);
    const meshes = new Map<string, THREE.Mesh>();
    const reset = () => {
      if (reconstructedMeshes && meshes.size) {
        root.updateMatrixWorld(true);
        const box = new THREE.Box3();
        meshes.forEach((m) => box.union(new THREE.Box3().setFromObject(m)));
        const target = box.getCenter(new THREE.Vector3()),
          size = box.getSize(new THREE.Vector3());
        controls.target.copy(target);
        camera.position
          .copy(target)
          .add(
            new THREE.Vector3(
              0,
              0,
              (Math.max(size.x, size.y, size.z) /
                (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) *
                1.6,
            ),
          );
      } else {
        controls.target.set(0, 0, 0);
        camera.position.set(0, 0, 5.9);
      }
      controls.update();
    };
    const focus = (id: string) => {
      if (id === "body") {
        reset();
        return;
      }
      const mesh = meshes.get(id);
      if (!mesh) return;
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(mesh);
      const target = box.getCenter(new THREE.Vector3()),
        size = box.getSize(new THREE.Vector3());
      const distance =
        (Math.max(size.x, size.y, size.z) /
          (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) *
        1.65;
      controls.target.copy(target);
      camera.position
        .copy(target)
        .add(new THREE.Vector3(0, 0, Math.max(0.35, distance)));
      controls.update();
    };
    stage.current = { scene, camera, controls, meshes, reset, focus, renderer };
    manifest.meshes
      .filter(
        (spec) =>
          !reconstructedMeshes ||
          reconstructedMeshes.some((m) => m.id === spec.id),
      )
      .forEach((originalSpec) => {
        const override = reconstructedMeshes?.find(
          (m) => m.id === originalSpec.id,
        );
        const spec = {
          ...originalSpec,
          url: override?.url || originalSpec.url,
        };
        geometry(spec.url)
          .then((g) => {
            if (disposed) return;
            const mat = new THREE.MeshStandardMaterial({
              color: spec.color,
              roughness: 0.68,
              metalness: 0.02,
              side: THREE.DoubleSide,
              transparent: spec.layer !== "organs",
              opacity: 1,
            });
            const mesh = new THREE.Mesh(g, mat);
            mesh.name = spec.id;
            mesh.userData = { ...spec };
            meshes.set(spec.id, mesh);
            original.add(mesh);
            setLoaded((n) => n + 1);
            if (
              state.current.selected !== "body" &&
              spec.id === state.current.selected
            )
              focus(spec.id);
          })
          .catch((e) => {
            if (!disposed)
              setError(`Unable to load ${spec.label}: ${e.message}`);
          });
      });
    const resize = () => {
      const w = Math.max(1, element.clientWidth),
        h = Math.max(1, element.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const raycaster = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    let down = { x: 0, y: 0 };
    const pointerDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const pointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(
        [...meshes.values()].filter(
          (m) => m.visible && m.userData.layer === "organs",
        ),
      );
      if (hits[0]) setSelected(hits[0].object.name);
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const start = performance.now();
    const animate = () => {
      if (disposed) return;
      frame = requestAnimationFrame(animate);
      const s = state.current;
      controls.autoRotate = s.rotate && !reduced;
      controls.autoRotateSpeed = 0.65;
      controls.update();
      const t = (performance.now() - start) / 1000;
      const glucose = s.glucose;
      const stress =
        glucose === null
          ? 0
          : THREE.MathUtils.clamp((glucose - 100) / 140, 0, 1);
      meshes.forEach((m, id) => {
        const spec = m.userData;
        const isolated = s.selected !== "body";
        m.visible = isolated
          ? id === s.selected
          : Boolean(s.layers[spec.layer]);
        const material = m.material as THREE.MeshStandardMaterial;
        material.wireframe = s.wireframe;
        material.opacity =
          spec.layer === "surface"
            ? s.opacity
            : spec.layer === "skeleton"
              ? 0.42
              : spec.layer === "vascular"
                ? 0.85
                : spec.layer === "muscles"
                  ? 0.82
                  : 1;
        material.depthWrite =
          spec.layer === "organs" || spec.layer === "muscles";
        material.color.set(spec.color);
        material.emissive.set("#000000");
        if (spec.layer === "organs" && glucose !== null) {
          let organStress = stress;
          if (id === "pancreas")
            organStress = THREE.MathUtils.clamp(
              (glucose / 100) * (0.4 / Math.max(0.1, s.cPeptide)) * 0.45,
              0,
              1,
            );
          if (id === "kidneys")
            organStress = THREE.MathUtils.clamp(
              Math.max(0, (90 - s.egfr) / 75) +
                Math.max(0, glucose - 180) / 240,
              0,
              1,
            );
          if (id === "brain")
            organStress =
              glucose < 70
                ? THREE.MathUtils.clamp((70 - glucose) / 30, 0, 1)
                : stress * 0.65;
          if (id === "lungs") organStress = 0;
          material.color.lerp(
            new THREE.Color(
              glucose < 70 && id === "brain" ? "#6a8da0" : "#bb5946",
            ),
            organStress * 0.45,
          );
          material.emissive.set("#a5432d");
          material.emissiveIntensity = organStress * 0.15;
        }
        m.scale.setScalar(
          id === "heart" && !reduced
            ? 1 + Math.sin(t * (1.1 + stress * 0.4) * Math.PI * 2) * 0.012
            : 1,
        );
      });
      renderer.render(scene, camera);
    };
    animate();
    const lost = (e: Event) => {
      e.preventDefault();
      setError("The graphics context was lost. Reopen this page to retry.");
    };
    renderer.domElement.addEventListener("webglcontextlost", lost);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      meshes.forEach((m) => (m.material as THREE.Material).dispose());
      renderer.dispose();
      renderer.domElement.remove();
      stage.current = null;
    };
  }, [active, manifest, reconstructedMeshes]);
  useEffect(() => {
    stage.current?.focus(selected);
  }, [selected]);
  const glucose = projectedGlucose ?? reading?.glucose_mg_dl;
  return (
    <section
      className={`paper-card atlas3d ${compact ? "compact" : ""}`}
      aria-label="Real 3D patient anatomy"
    >
      <div className="card-heading">
        <div>
          <span className="eyebrow">{reconstructedMeshes?"Synthetic scan → reconstructed surfaces":"3D atlas · patient-conditioned state"}</span>
          <h2>{title}</h2>
        </div>
        <span className="subtle-tag">
          {patient.person_id} · {selected === "body" ? (reconstructedMeshes?"Study overview":"Whole body") : selected}
        </span>
      </div>
      <div className="atlas3d-layout">
        <div className="atlas3d-stage">
          <div ref={host} className="atlas3d-canvas" />
          {!error &&
            loaded <
              (reconstructedMeshes?.length || manifest?.meshes.length || 1) && (
              <div className="atlas3d-loading" role="status">
                Loading licensed anatomy… {loaded}/
                {reconstructedMeshes?.length || manifest?.meshes.length || "—"}
              </div>
            )}
          {error && (
            <div className="atlas3d-loading notice error" role="alert">
              {error}
            </div>
          )}
          <div className="atlas3d-help">
            Drag to orbit · scroll to zoom · click an organ
          </div>
          <div className="atlas3d-tools">
            <button
              className="icon-button"
              aria-label="Reset 3D camera"
              onClick={() => {
                setSelected("body");
                stage.current?.reset();
              }}
            >
              <RotateCcw size={16} />
            </button>
            <button
              className="icon-button"
              aria-label={rotate ? "Pause rotation" : "Rotate automatically"}
              onClick={() => setRotate(!rotate)}
            >
              {rotate ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button
              className="icon-button"
              aria-label="Fullscreen 3D viewer"
              onClick={() => {
                const el = host.current?.parentElement;
                if (document.fullscreenElement) document.exitFullscreen();
                else
                  el?.requestFullscreen().catch(() =>
                    setError("Fullscreen is unavailable in this browser."),
                  );
              }}
            >
              <Maximize2 size={16} />
            </button>
          </div>
        </div>
        <aside className="atlas3d-controls">
          {!reconstructedMeshes && (
            <div>
              <span className="eyebrow">
                <Layers3 size={12} /> Anatomy layers
              </span>
              {[
                ["surface", "Body surface"],
                ["skeleton", "Skeleton"],
                ["muscles", "Muscles & connective tissue"],
                ["vascular", "Cardiovascular"],
                ["nervous", "Nervous system"],
                ["organs", "Organs"],
              ].map(([id, label]) => (
                <label className="atlas3d-toggle" key={id}>
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={layers[id]}
                    onChange={(e) => {
                      setLayers((v) => ({ ...v, [id]: e.target.checked }));
                      setSelected("body");
                    }}
                  />
                </label>
              ))}
              {layers.surface && (
                <label className="caption">
                  Surface opacity
                  <input
                    type="range"
                    min=".05"
                    max=".8"
                    step=".05"
                    value={opacity}
                    onChange={(e) => setOpacity(Number(e.target.value))}
                  />
                </label>
              )}
              <label className="atlas3d-toggle">
                <span>Mesh inspection</span>
                <input
                  type="checkbox"
                  checked={wireframe}
                  onChange={(e) => setWireframe(e.target.checked)}
                />
              </label>
            </div>
          )}
          <div>
            <span className="eyebrow">Focus an organ</span>
            <div className="atlas3d-organ-list">
              {[
                "body",
                "heart",
                "brain",
                "pancreas",
                "kidneys",
                "liver",
                "lungs",
              ]
                .filter(
                  (id) =>
                    !reconstructedMeshes ||
                    id === "body" ||
                    reconstructedMeshes.some((m) => m.id === id),
                )
                .map((id) => (
                  <button
                    key={id}
                    aria-pressed={selected === id}
                    className={selected === id ? "selected" : ""}
                    onClick={() => setSelected(id)}
                  >
                    {id === "body"
                      ? reconstructedMeshes
                        ? "Study overview"
                        : "Whole body"
                      : id}
                  </button>
                ))}
            </div>
          </div>
          <div className="atlas3d-state">
            <span className="eyebrow">
              {projectedGlucose !== undefined
                ? "Projected visual state"
                : "Selected recording"}
            </span>
            <strong>
              {glucose === undefined ? "—" : glucose.toFixed(1)}{" "}
              <small>mg/dL glucose</small>
            </strong>
            <p>
              {reconstructedMeshes ? "Surface geometry comes from this profile’s generated CT segmentation; the original masks supply measured volumes. Glucose and lab colors remain illustrative." : selected === "body"
                ? "Color intensity follows the selected glucose value. Shape and volume remain reference anatomy."
                : organNotes[selected]}
            </p>
            <dl>
              <div>
                <dt>HbA1c</dt>
                <dd>{patient.hba1c_percent}%</dd>
              </div>
              <div>
                <dt>C-peptide</dt>
                <dd>{patient.fasting_c_peptide_nmol_l} nmol/L</dd>
              </div>
              <div>
                <dt>eGFR</dt>
                <dd>{patient.egfr}</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
      <p className="caption">
        {reconstructedMeshes
          ? "Geometry reconstructed from this generated synthetic CT volume. This is not an acquired patient scan. Original phantom anatomy:"
          : "Reference geometry:"}{" "}
        BodyParts3D / DBCLS · CC BY 4.0. Color and pulse are illustrative
        mappings of patient data, not measured organ damage, individualized
        geometry or independently trained organ forecasts.{" "}
        {simulation?.baseline.model_applicable === false
          ? "Current state is outside the incident-glucose model’s evaluated domain."
          : ""}
      </p>
      <details className="technical-details">
        <summary>Geometry provenance and license</summary>
        <p>
          Geometry comes from the official BodyParts3D mesh archives;
          converted to GLB with recalculated normals and documented high-density surface simplification.{" "}
          <a href="/anatomy/ATTRIBUTION.md" target="_blank" rel="noreferrer">
            Asset attribution
          </a>{" "}
          ·{" "}
          <a
            href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html"
            target="_blank"
            rel="noreferrer"
          >
            License
          </a>
        </p>
      </details>
    </section>
  );
}
