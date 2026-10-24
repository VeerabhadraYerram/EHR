import { useEffect, useMemo, useRef, useState } from "react";

import * as THREE from "three";

import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import { Maximize2, Pause, Play, RotateCcw } from "lucide-react";

import { anatomyReferences } from "./anatomyReferences";

import OrganPatientData from "./OrganPatientData";
import { matchingOrganForecast } from "./organEvidence";
import { organGlucoseState, glucoseOverlayColor } from "./organVisualization";

import { phenotypeFor } from "./patientPhenotype";

import { tissueMaterial } from "./anatomyMaterials";

import { downloadJson } from "./patientService";

import type { Patient, PatientSimulation, Reading } from "./types";

import "./anatomy-3d.css";

interface Asset {
  url: string;

  sha256?: string;

  source?: string;

  bounds_mm?: {
    min: number[];

    max: number[];
  };

  parts?: string[];
}

interface Spec extends Asset {
  id: string;

  label: string;

  layer: string;
}

interface Manifest {
  bodies: Record<string, Asset>;

  organs: Record<string, Record<string, Asset>>;

  shared_meshes: Spec[];

  alternatives?: Record<string, Asset>;
}

interface Props {
  patient: Patient;

  reading: Reading | null;

  simulation?: PatientSimulation | null;

  active?: boolean;

  compact?: boolean;

  projectedGlucose?: number;

  title?: string;

  reconstructedMeshes?: Array<{
    id: string;

    url: string;
  }>;
}

interface Stage {
  focus: (id: string, angle?: number) => void;

  models: Map<string, THREE.Group>;

  ensure: () => void;
}

const modelCache = new Map<string, Promise<THREE.Group>>();

const dracoLoader = new DRACOLoader().setDecoderPath("/anatomy/draco/");

const gltfLoader = new GLTFLoader().setDRACOLoader(dracoLoader);

function model(url: string) {
  if (!modelCache.has(url))
    modelCache.set(
      url,
      gltfLoader
        .loadAsync(url)
        .then((g) => g.scene)
        .catch((e) => {
          modelCache.delete(url);
          throw e;
        }),
    );

  return modelCache.get(url)!;
}

const names = [
  "body",
  "heart",
  "brain",
  "pancreas",
  "kidneys",
  "liver",
  "lungs",
];

const context: Record<string, string> = {
  body: "Body habitus uses recorded sex, age and BMI. It is an estimated reference avatar, not a body scan. Stature, waist, muscle mass and fat distribution have not been measured.",

  pancreas:
    "HbA1c and C-peptide describe glycaemic context and endogenous insulin secretion. They do not measure pancreas volume, fat or beta-cell mass; those anatomical properties remain unknown.",

  heart:
    "Reference chambers, valves and vessels. No cardiac scan, ejection fraction or coronary stenosis measurements are available.",

  kidneys:
    "eGFR is clinical functional context. It does not reveal an individual kidney’s size, scarring or internal anatomy. Cutaway structures are an atlas reference.",

  liver:
    "Reference liver anatomy. Liver fat and fibrosis cannot be established from BMI or glucose alone; imaging and appropriate clinical tests are needed.",

  brain:
    "Shared reference brain anatomy. No brain scan, atrophy or neurological tissue measurements are available.",

  lungs:
    "Complete reference lung tissue and airways. No patient chest imaging or lung-function measurements are available.",
};

export default function RealisticAnatomyViewer({
  patient,
  reading,
  simulation,
  active = true,
  compact = false,
  projectedGlucose,
  title = "Anatomy & patient phenotype",
  reconstructedMeshes,
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    stage = useRef<Stage | null>(null);

  const [manifest, setManifest] = useState<Manifest | null>(null),
    [selected, setSelected] = useState(
      reconstructedMeshes ? "kidneys" : "body",
    ),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(0),
    [retry, setRetry] = useState(0);

  const [layers, setLayers] = useState<Record<string, boolean>>({
    surface: true,
    skeleton: false,
    muscles: false,
    vascular: false,
    nervous: false,
    organs: true,
  });

  const [showOrganData, setShowOrganData] = useState(
    () => typeof window === "undefined" || window.innerWidth > 800,
  );
  const [showFascia,setShowFascia]=useState(false);
  const [preferOnlineReference, setOnlineReference] = useState(false);
  const [inspector, setInspector] = useState<'data' | 'simulation' | 'view'>(projectedGlucose !== undefined ? 'simulation' : 'data');
  const [overlay, setOverlay] = useState(projectedGlucose !== undefined);
  const [horizon, setHorizon] = useState(0);
  const [scenario, setScenario] = useState('');
  const [playing, setPlaying] = useState(false);
  const matchedForecast = matchingOrganForecast(patient, reading, simulation);
  const glucoseState = organGlucoseState(patient, reading, simulation, horizon, scenario);
  const overlayGlucose = projectedGlucose ?? glucoseState?.glucose;
  const overlayColor = overlayGlucose !== undefined ? glucoseOverlayColor(overlayGlucose) : '#78918b';
  useEffect(() => { setHorizon(0); setScenario(''); setPlaying(false); }, [patient.person_id, reading?.reading_time]);
  useEffect(() => {
    if (!playing || !active || !matchedForecast || compact) return;
    const timer = window.setInterval(() => setHorizon(h => h >= 120 ? 0 : h + 15), 1300);
    return () => window.clearInterval(timer);
  }, [playing, active, matchedForecast, compact]);
  // Preserve the source choice across organs, but always render body, scans and
  // organs without an online reference using the local viewer.
  const onlineReference = preferOnlineReference &&
    Boolean(anatomyReferences[selected]) && !reconstructedMeshes && !overlay;

  const [organSource, setOrganSource] = useState<"reference" | "alternate">(
    "reference",
  );

  const [expanded, setExpanded] = useState(false),
    [surfaceView, setSurfaceView] = useState<"surface" | "window">("window"),
    [opacity, setOpacity] = useState(1),
    [rotate, setRotate] = useState(false),
    [wireframe, setWireframe] = useState(false),
    [cut, setCut] = useState(reconstructedMeshes ? 0 : 0.0),
    [heartbeat, setHeartbeat] = useState(false),
    [reference, setReference] = useState(false),
    [tissueOpacity, setTissueOpacity] = useState(1);

  const phenotype = useMemo(() => phenotypeFor(patient), [patient]);

  const specs = useMemo(() => {
    if (!manifest) return [];

    if (reconstructedMeshes)
      return manifest.shared_meshes
        .filter((s) => reconstructedMeshes.some((m) => m.id === s.id))
        .map((s) => ({
          ...s,
          url: reconstructedMeshes.find((m) => m.id === s.id)!.url,
        }));

    return manifest.shared_meshes.map((s) => {
      const asset =
        s.id === "skin"
          ? manifest.bodies[phenotype.sex]
          : (organSource === "alternate" && manifest.alternatives?.[s.id]) ||
            manifest.organs[s.id]?.[phenotype.sex];

      return asset
        ? {
            ...s,
            ...asset,
            url:
              asset.url +
              (asset.sha256 ? "?v=" + asset.sha256.slice(0, 12) : ""),
          }
        : s;
    });
  }, [manifest, phenotype.sex, reconstructedMeshes, organSource]);

  const live = useRef({
    selected,
    layers,
    surfaceView,
    opacity,
    rotate,
    wireframe,
    cut,
    heartbeat,
    phenotype,
    tissueOpacity,
    reference,
    showFascia,
    overlay, overlayColor,
  });

  live.current = {
    selected,
    layers,
    surfaceView,
    opacity,
    rotate,
    wireframe,
    cut,
    heartbeat,
    phenotype,
    tissueOpacity,
    reference,
    showFascia,
    overlay, overlayColor,
  };

  useEffect(() => {
    const c = new AbortController();
    fetch("/anatomy/v3/manifest.json", { signal: c.signal })
      .then((r) => {
        if (!r.ok)
          throw new Error(
            "Presentation atlas unavailable. Run python -m scripts.build_realistic_anatomy.",
          );
        return r.json();
      })
      .then(setManifest)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => c.abort();
  }, [retry]);

  useEffect(() => {
    if (!active || !host.current || !specs.length) return;

    const element = host.current;

    let disposed = false,
      frame = 0,
      dirty = true;

    setLoaded(0);

    setError("");

    let renderer: THREE.WebGLRenderer;

    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        stencil: true,
        powerPreference: "high-performance",
      });
    } catch {
      setError(
        "WebGL could not start. Enable hardware acceleration and retry.",
      );

      return;
    }

    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));

    renderer.setClearColor("#0b151b");

    renderer.outputColorSpace = THREE.SRGBColorSpace;

    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    renderer.toneMappingExposure = 1.12;

    renderer.shadowMap.enabled = true;

    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    element.appendChild(renderer.domElement);

    renderer.domElement.setAttribute("role", "img");

    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive anatomical model. Drag to orbit and scroll to zoom. Organ selection and viewing controls are also available as buttons.",
    );

    const scene = new THREE.Scene();

    scene.fog = new THREE.Fog("#0b151b", 10, 22);

    const pmrem = new THREE.PMREMGenerator(renderer),
      room = new RoomEnvironment();

    const env = pmrem.fromScene(room, 0.035);

    scene.environment = env.texture;

    scene.environmentIntensity = 0.3;

    room.dispose();

    pmrem.dispose();

    scene.add(new THREE.HemisphereLight("#cadce0", "#172531", 0.65));

    const key = new THREE.DirectionalLight("#fff0df", 3.0);

    key.position.set(2.4, 3.8, 4);

    key.castShadow = true;

    key.shadow.mapSize.set(2048, 2048);

    key.shadow.camera.left = -2;

    key.shadow.camera.right = 2;

    key.shadow.camera.top = 2;

    key.shadow.camera.bottom = -2;

    key.shadow.bias = -0.0002;

    key.shadow.normalBias = 0.002;

    scene.add(key);

    const fill = new THREE.DirectionalLight("#a9cbd7", 1.3);

    fill.position.set(-3, 1.4, 2);

    scene.add(fill);

    const rim = new THREE.DirectionalLight("#d3b2a1", 3);

    rim.position.set(1.8, 1.8, -3);

    scene.add(rim);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 14),
      new THREE.ShadowMaterial({ color: "#000308", opacity: 0.3 }),
    );

    floor.rotation.x = -Math.PI / 2;

    floor.position.y = -1.41;

    floor.receiveShadow = true;

    scene.add(floor);

    const root = new THREE.Group(),
      original = new THREE.Group();

    root.rotation.x = -Math.PI / 2;

    root.scale.setScalar(2.8 / 1719);

    original.position.set(0, 101, -781.5);

    root.add(original);

    scene.add(root);

    const camera = new THREE.PerspectiveCamera(33, 1, 0.004, 50);

    camera.position.set(0.2, 0.1, 5.5);

    const controls = new OrbitControls(camera, renderer.domElement);

    controls.enableDamping = true;

    controls.dampingFactor = 0.085;

    controls.minDistance = 0.18;

    controls.maxDistance = 12;

    controls.autoRotateSpeed = 0.45;

    const models = new Map<string, THREE.Group>();

    let referenceBody: THREE.Group | null = null;
    let bodyEnvelope: THREE.Group | null = null;

    function focus(id: string, angle: number = id === "brain" ? 0.55 : 0) {
      const targetModel =
        id === "body" ? models.get("skin") || original : models.get(id);

      if (!targetModel) return;

      root.updateMatrixWorld(true);

      let box = new THREE.Box3().setFromObject(targetModel, true);

      if (reconstructedMeshes && id === "body") {
        box = new THREE.Box3();

        models.forEach((m) =>
          box.union(new THREE.Box3().setFromObject(m, true)),
        );
      }

      const center = box.getCenter(new THREE.Vector3()),
        size = box.getSize(new THREE.Vector3());

      if (!Number.isFinite(size.length()) || size.length() === 0) return;

      const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

      const distance =
        Math.max(
          size.y / (2 * tangent),
          size.x / (2 * tangent * Math.max(0.1, camera.aspect)),
        ) *
          1.15 +
        size.z * 0.55;

      controls.target.copy(center);

      camera.position
        .copy(center)
        .add(
          new THREE.Vector3(
            Math.sin(angle) * distance,
            id === "brain" ? distance * 0.32 : 0.02,
            Math.cos(angle) * distance,
          ),
        );

      camera.near = Math.max(0.002, distance / 250);

      camera.updateProjectionMatrix();

      controls.update();

      dirty = true;
    }

    const requested = new Set<string>();

    function loadSpec(spec: Spec) {
      if (requested.has(spec.id)) return;
      requested.add(spec.id);
      setLoaded((v) => v + 1);

      model(spec.url)
        .then((source) => {
          if (disposed) return;

          const content = source.clone(true),
            container = new THREE.Group();

          container.name = spec.id;

          const rawBox = new THREE.Box3().setFromObject(content, true),
            center = rawBox.getCenter(new THREE.Vector3());

          content.position.sub(center);

          container.position.copy(center);

          container.add(content);

          container.userData = {
            ...spec,
            rawMinY: rawBox.min.y,
            rawMaxY: rawBox.max.y,
          };

          content.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (!mesh.isMesh) return;
            if (!mesh.geometry.attributes.normal)
              mesh.geometry.computeVertexNormals();
            mesh.material = tissueMaterial(spec.id, mesh.name);
            mesh.castShadow =
              spec.id === "skin" ||
              spec.id === "muscles" ||
              spec.layer === "organs";
            mesh.receiveShadow = true;
            mesh.userData.organId = spec.id;
            if (spec.id === "skin" && mesh.morphTargetInfluences)
              mesh.morphTargetInfluences =
                live.current.phenotype.morphWeights.slice();
          });

          original.add(container);

          if (spec.id === "skin" && !reconstructedMeshes) {
            bodyEnvelope = container.clone(true);
            bodyEnvelope.traverse((object) => {
              const mesh = object as THREE.Mesh;
              if (!mesh.isMesh) return;
              mesh.castShadow = false;
              mesh.receiveShadow = false;
              mesh.renderOrder = -100;
              mesh.material = new THREE.MeshBasicMaterial({
                colorWrite: false,
                depthWrite: false,
                depthTest: false,
                side: THREE.DoubleSide,
                stencilWrite: true,
                stencilRef: 1,
                stencilFunc: THREE.AlwaysStencilFunc,
                stencilFail: THREE.ReplaceStencilOp,
                stencilZFail: THREE.ReplaceStencilOp,
                stencilZPass: THREE.ReplaceStencilOp,
              });
            });
            original.add(bodyEnvelope);
            referenceBody = container.clone(true);
            referenceBody.name = "BMI 22 outline";

            referenceBody.traverse((object) => {
              const mesh = object as THREE.Mesh;
              if (!mesh.isMesh) return;

              mesh.castShadow = false;
              mesh.receiveShadow = false;
              mesh.renderOrder = 10;

              const mat = new THREE.ShaderMaterial({
                transparent: true,
                depthWrite: false,
                depthTest: false,
                side: THREE.DoubleSide,

                vertexShader: `varying vec3 vN;varying vec3 vV;varying float vHeight;

                    #include <morphtarget_pars_vertex>

                    void main(){

                    #include <beginnormal_vertex>

                    #include <morphinstance_vertex>

                    #include <morphnormal_vertex>

                    #include <begin_vertex>

                    #include <morphtarget_vertex>

                    vHeight=transformed.z;vN=normalize(normalMatrix*objectNormal);vec4 mv=modelViewMatrix*vec4(transformed,1.);vV=-mv.xyz;gl_Position=projectionMatrix*mv;}`,

                fragmentShader: `varying vec3 vN;varying vec3 vV;varying float vHeight;void main(){if(vHeight>1390.)discard;float edge=pow(1.-abs(dot(normalize(vN),normalize(vV))),4.);gl_FragColor=vec4(.5,.88,.79,edge*.85);}`,
              });

              mesh.material = mat;

              if (mesh.morphTargetInfluences)
                mesh.morphTargetInfluences = [
                  0,
                  0,
                  live.current.phenotype.ageBlend,
                  0,
                  0,
                ];
            });
            original.add(referenceBody);
          }

          models.set(spec.id, container);

          dirty = true;

          if (
            spec.id === live.current.selected ||
            (spec.id === "skin" && live.current.selected === "body")
          )
            focus(live.current.selected);
        })
        .catch((e) => {
          if (!disposed) setError(`Unable to load ${spec.label}: ${e.message}`);
        })
        .finally(() => {
          if (!disposed) setLoaded((v) => Math.max(0, v - 1));
        });
    }

    function ensure() {
      const s = live.current;
      specs
        .filter((spec) =>
          s.selected === "body"
            ? Boolean(s.layers[spec.layer])
            : spec.id === s.selected,
        )
        .forEach(loadSpec);
    }

    stage.current = { focus, models, ensure };
    ensure();

    const resize = () => {
      const w = Math.max(1, element.clientWidth),
        h = Math.max(1, element.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      focus(live.current.selected);
      dirty = true;
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
      const s = live.current;
      if (
        s.selected === "body" &&
        s.layers.surface &&
        s.surfaceView === "surface" &&
        s.opacity > 0.8
      )
        return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(
        [...models.values()].filter(
          (m) => m.visible && m.userData.layer === "organs",
        ),
        true,
      );
      if (hits[0]) {
        setSelected(hits[0].object.userData.organId);

        setCut(0);
      }
    };

    renderer.domElement.addEventListener("pointerdown", pointerDown);

    renderer.domElement.addEventListener("pointerup", pointerUp);

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    let previous: typeof live.current | null = null;

    const animate = () => {
      if (disposed) return;

      frame = requestAnimationFrame(animate);

      const s = live.current;

      controls.autoRotate = s.rotate && !reduced;

      const moved = controls.update();

      if (!dirty && !moved && s === previous && !s.heartbeat && !s.rotate)
        return;

      previous = s;

      dirty = false;

      models.forEach((group, id) => {
        const isolated = s.selected !== "body";

        group.visible = isolated
          ? id === s.selected
          : Boolean(s.layers[group.userData.layer]);

        const cutY =
          group.userData.rawMinY +
          (group.userData.rawMaxY - group.userData.rawMinY) * s.cut;

        group.traverse((object) => {
          const mesh = object as THREE.Mesh;

          if (!mesh.isMesh) return;

          const mat = mesh.material as THREE.MeshPhysicalMaterial;
          // A removable, uniformly applied data overlay; never deform tissue
          // or paint focal pathology from a systemic glucose measurement.
          const dataLayer = s.overlay && group.userData.layer === 'organs';
          if (mat.userData.uniforms?.uClinicalOverlay) {
            mat.userData.uniforms.uClinicalOverlay.value = dataLayer ? 1 : 0;
            mat.userData.uniforms.uClinicalColor.value.set(s.overlayColor);
          }
        mesh.visible=id!=="muscles"||!String(mat.userData.part).includes("tendons_and_fascia")||s.showFascia;

          mat.wireframe = s.wireframe;
          mat.stencilWrite =
            !isolated &&
            s.layers.surface &&
            id !== "skin" &&
            !reconstructedMeshes;
          mat.stencilRef = 1;
          mat.stencilFunc = THREE.EqualStencilFunc;
          mat.stencilFail = THREE.KeepStencilOp;
          mat.stencilZFail = THREE.KeepStencilOp;
          mat.stencilZPass = THREE.KeepStencilOp;

          const outer = mat.userData.outer;

          const alpha =
            id === "skin"
              ? s.opacity
              : group.userData.layer === "organs" && outer
                ? s.tissueOpacity
                : 1;

          mat.transparent = alpha < 0.99;

          mat.opacity = alpha;

          mat.depthWrite = alpha >= 0.99;

          const uniforms = mat.userData.uniforms;

          uniforms.uAnatomyWindow.value =
            id === "skin" && s.surfaceView === "window" ? 1 : 0;

          uniforms.uAnatomyCut.value =
            isolated && !reconstructedMeshes ? s.cut : 0;

          uniforms.uAnatomyCutY.value = cutY;

          if (id === "skin" && mesh.morphTargetInfluences)
            for (let i = 0; i < 5; i++)
              mesh.morphTargetInfluences[i] = s.phenotype.morphWeights[i];
        });

        group.scale.setScalar(
          id === "heart" && s.heartbeat && !reduced
            ? 1 +
                Math.sin((performance.now() / 1000) * Math.PI * 2 * 1.2) * 0.012
            : 1,
        );
      });

      if (referenceBody) {
        referenceBody.visible = s.reference && s.selected === "body";
        referenceBody.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.morphTargetInfluences)
            mesh.morphTargetInfluences = [0, 0, s.phenotype.ageBlend, 0, 0];
        });
      }
      if (bodyEnvelope) {
        bodyEnvelope.visible = s.layers.surface && s.selected === "body";
        bodyEnvelope.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.morphTargetInfluences)
            mesh.morphTargetInfluences = s.phenotype.morphWeights.slice();
        });
      }

      element.parentElement
        ?.querySelectorAll<HTMLButtonElement>("[data-organ-marker]")
        .forEach((marker) => {
          const id = marker.dataset.organMarker!,
            organ = models.get(id);
          const show =
            s.selected === "body" &&
            s.layers.organs &&
            (!s.layers.surface ||
              s.surfaceView === "window" ||
              s.opacity < 0.7) &&
            organ;
          marker.hidden = !show;
          if (!show || !organ) return;
          const point = new THREE.Box3()
            .setFromObject(organ, true)
            .getCenter(new THREE.Vector3())
            .project(camera);
          const dx = id === "pancreas" ? -135 : 135,
            dy = id === "pancreas" ? 0 : 38;
          marker.style.left = `${((point.x + 1) / 2) * element.clientWidth + dx}px`;
          marker.style.top = `${((1 - point.y) / 2) * element.clientHeight + dy}px`;
          marker.hidden = point.z > 1 || point.z < -1;
        });
      renderer.render(scene, camera);
    };

    animate();

    const lost = (e: Event) => {
      e.preventDefault();
      setError("Graphics context lost. Retry the 3D viewer.");
    };

    renderer.domElement.addEventListener("webglcontextlost", lost);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      models.forEach((g) =>
        g.traverse((o) => {
          if ((o as THREE.Mesh).isMesh)
            ((o as THREE.Mesh).material as THREE.Material).dispose();
        }),
      );
      (floor.geometry as THREE.BufferGeometry).dispose();
      (floor.material as THREE.Material).dispose();
      referenceBody?.traverse((o) => {
        if ((o as THREE.Mesh).isMesh)
          ((o as THREE.Mesh).material as THREE.Material).dispose();
      });
      bodyEnvelope?.traverse((o) => {
        if ((o as THREE.Mesh).isMesh)
          ((o as THREE.Mesh).material as THREE.Material).dispose();
      });
      env.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      stage.current = null;
    };
  }, [active, specs, retry, reconstructedMeshes]);

  useEffect(() => {
    stage.current?.ensure();
    stage.current?.focus(selected);
  }, [selected, layers]);

  useEffect(() => {
    if (!expanded) return;

    const dialog = host.current?.parentElement,
      previousFocus = document.activeElement as HTMLElement | null,
      previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    dialog
      ?.querySelector<HTMLButtonElement>(
        'button[aria-label="Close expanded 3D viewer"]',
      )
      ?.focus({ preventScroll: true });

    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);

      if (e.key !== "Tab" || !dialog) return;

      const controls = Array.from(
        dialog.querySelectorAll<HTMLElement>("button,input"),
      ).filter((n) => !n.hasAttribute("disabled"));

      const first = controls[0],
        last = controls[controls.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();

        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();

        first?.focus();
      }
    };

    window.addEventListener("keydown", key);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", key);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [expanded]);

  function choose(id: string) {
    setSelected(id);
    setCut(0);
    setHeartbeat(false);
    setTissueOpacity(1);
  }

  const glucose = projectedGlucose ?? reading?.glucose_mg_dl,
    sexLabel =
      phenotype.sex === "neutral"
        ? "Sex unavailable"
        : `${phenotype.sex[0].toUpperCase() + phenotype.sex.slice(1)} reference`;

  const currentSpec = specs.find((s) => s.id === selected);

  const external = anatomyReferences[selected];

  return (
    <section
      className={`paper-card atlas3d atlas3d-realistic ${compact ? "compact" : ""}`}
      aria-label="Real 3D patient anatomy"
    >
      <div className="card-heading">
        <div>
          <span className="eyebrow">
            {reconstructedMeshes
              ? "Synthetic CT · reconstructed geometry"
              : "Profile-conditioned anatomy · reference organs"}
          </span>
          <h2>{title}</h2>
        </div>
        <span className="subtle-tag">
          {patient.person_id} ·{" "}
          {reconstructedMeshes ? "Synthetic study" : sexLabel}
        </span>
      </div>
      <div className="anatomy-profile-strip">
        <span>
          Recorded sex <b>{patient.sex || "Unavailable"}</b>
        </span>
        <span>
          Age <b>{phenotype.age ?? "—"} years</b>
        </span>
        <span>
          BMI <b>{phenotype.bmi ?? "—"} kg/m²</b>
        </span>
        <span>
          Geometry{" "}
          <b>
            {reconstructedMeshes
              ? "Synthetic scan"
              : "Estimated habitus + atlas"}
          </b>
        </span>
      </div>
      <div className="atlas3d-layout">
        <div
          className={`atlas3d-stage ${expanded ? "anatomy-expanded" : ""}`}
          role={expanded ? "dialog" : undefined}
          aria-modal={expanded ? true : undefined}
          aria-label={expanded ? "Expanded 3D anatomy" : undefined}
        >
          <div
            ref={host}
            className="atlas3d-canvas"
            style={{ visibility: onlineReference ? "hidden" : undefined }}
          />
          {onlineReference && external && (
            <div className="anatomy-external-reference">
              <iframe
                key={external.id}
                title={external.title}
                src={`https://sketchfab.com/models/${external.id}/embed?autostart=1&ui_infos=0`}
                referrerPolicy="no-referrer"
                allow="autoplay; fullscreen; xr-spatial-tracking"
                allowFullScreen
              />
              <div className="anatomy-external-credit">
                <a href={external.url} target="_blank" rel="noreferrer">
                  {external.title}
                </a>{" "}
                by {external.author} ·{" "}
                <a
                  href="https://creativecommons.org/licenses/by/4.0/"
                  target="_blank"
                  rel="noreferrer"
                >
                  CC BY 4.0
                </a>
                <span>Online anatomical reference · not patient geometry</span>
              </div>
            </div>
          )}
          {overlay && overlayGlucose !== undefined && (
            <div className="anatomy-glucose-badge" role="status">
              <i style={{background: overlayColor}} />
              <div><strong>{overlayGlucose.toFixed(1)} <small>mg/dL</small></strong>
              <span>{projectedGlucose !== undefined ? 'Forecast page selection' : `${glucoseState?.source} · ${horizon ? `+${horizon} min` : 'selected moment'}`}</span>
              <small>Systemic glucose overlay · not tissue damage</small></div>
            </div>
          )}
          {selected !== "body" && (
            <div className="anatomy-source-picker">
              {external && !reconstructedMeshes && (
                <>
                  <button
                    aria-pressed={!onlineReference}
                    onClick={() => setOnlineReference(false)}
                  >
                    Local atlas 3D
                  </button>
                  <button
                    aria-pressed={onlineReference}
                    onClick={() => { setOverlay(false); setOnlineReference(true); }}
                  >
                    Textured reference (online)
                  </button>
                </>
              )}
              <button
                aria-pressed={expanded ? showOrganData : inspector === 'data'}
                onClick={() => expanded ? setShowOrganData((v) => !v) : setInspector('data')}
              >
                Patient panel
              </button>
            </div>
          )}
          {!error && loaded > 0 && (
            <div className="atlas3d-loading" role="status">
              Loading {loaded} anatomical layers
            </div>
          )}
          {error && (
            <div className="atlas3d-loading notice error" role="alert">
              {error}
              <button
                className="button secondary"
                onClick={() => setRetry((r) => r + 1)}
              >
                Retry 3D viewer
              </button>
            </div>
          )}
          <div
            className="anatomy-scene-caption"
            style={{ display: onlineReference ? "none" : undefined }}
          >
            <span>
              {selected === "body" ? layers.surface?"Whole-body phenotype":"Shared reference anatomy" : selected}
            </span>
            <small>
              {reconstructedMeshes
                ? "Generated CT surfaces"
                : selected === "body"
                  ? layers.surface?`${phenotype.sex} · BMI ${phenotype.bmi ?? "unknown"} · ${phenotype.age ?? "unknown"} years · estimated shape`:"Shared adult atlas layers; not patient-measured or sex-specific"
                  : onlineReference && external
                    ? `${external.title} · ${external.author} · CC BY 4.0`
                    : currentSpec?.source ||
                      `${sexLabel} · anatomical reference`}
            </small>
          </div>
          {!reconstructedMeshes && (
            <div className="anatomy-organ-markers">
              <button
                hidden
                data-organ-marker="pancreas"
                onClick={() => choose("pancreas")}
              >
                <span>Pancreas / glucose</span>
                <b>{reading?.glucose_mg_dl ?? "Unavailable"} mg/dL</b>
              </button>
              <button
                hidden
                data-organ-marker="kidneys"
                onClick={() => choose("kidneys")}
              >
                <span>Kidneys / eGFR</span>
                <b>{patient.egfr || "Unavailable"}</b>
              </button>
            </div>
          )}
          <div
            className="atlas3d-help"
            style={{ display: onlineReference ? "none" : undefined }}
          >
            Drag to orbit · scroll to zoom · select an organ
          </div>
          <div className="atlas3d-tools">
            <button
              className="icon-button"
              aria-label="Reset 3D camera"
              disabled={onlineReference}
              onClick={() => stage.current?.focus(selected)}
            >
              <RotateCcw size={16} />
            </button>
            <button
              className="icon-button"
              aria-label={rotate ? "Pause rotation" : "Rotate automatically"}
              disabled={onlineReference}
              onClick={() => setRotate(!rotate)}
            >
              {rotate ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button
              className="icon-button"
              aria-label={
                expanded ? "Close expanded 3D viewer" : "Expand 3D viewer"
              }
              onClick={() => setExpanded((v) => !v)}
            >
              <Maximize2 size={16} />
            </button>
          </div>
          {expanded && selected !== "brain" && !onlineReference && (
            <div className="anatomy-expanded-settings">
              {selected === "body" ? (
                <>
                  <div className="anatomy-expanded-body-tabs">
                    <button
                      onClick={() => {
                        if(!layers.surface){setLayers(v=>({...v,surface:true}));setSurfaceView("surface")}
                        else setSurfaceView(surfaceView === "surface" ? "window" : "surface")
                      }}
                    >
                      {layers.surface&&surfaceView === "surface"
                        ? "Show anatomy window"
                        : "Show body surface"}
                    </button>
                  </div>
                  <label>
                    <input
                      type="checkbox"
                      checked={reference}
                      onChange={(e) => setReference(e.target.checked)}
                    />{" "}
                    Normal BMI outline (22)
                  </label>
                </>
              ) : selected !== "brain" && !reconstructedMeshes ? (
                <>
                  <label>
                    Tissue opacity
                    <input
                      type="range"
                      min=".25"
                      max="1"
                      step=".05"
                      value={tissueOpacity}
                      aria-label="Expanded organ tissue opacity"
                      onChange={(e) => setTissueOpacity(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Cutaway
                    <input
                      type="range"
                      min="0"
                      max=".8"
                      step=".05"
                      value={cut}
                      aria-label="Expanded organ cutaway depth"
                      onChange={(e) => setCut(Number(e.target.value))}
                    />
                  </label>
                </>
              ) : null}
            </div>
          )}
          {expanded && (
            <div className="anatomy-expanded-organs">
              {names
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
                    onClick={() => choose(id)}
                  >
                    {id === "body" ? "Whole body" : id}
                  </button>
                ))}
            </div>
          )}
          {expanded && showOrganData && selected !== "body" && (
            <div className="organ-data-expanded">
              <OrganPatientData
                key={patient.person_id + selected}
                organ={selected}
                patient={patient}
                reading={reading}
                simulation={simulation}
                source={
                  onlineReference && external
                    ? `${external.title} by ${external.author}; CC BY 4.0; online reference`
                    : currentSpec?.source
                }
                reconstructed={Boolean(reconstructedMeshes)}
              />
            </div>
          )}
          <div
            className="anatomy-camera-presets"
            style={{ display: onlineReference ? "none" : undefined }}
          >
            {[
              ["Front", 0],
              ["Three-quarter", 0.6],
              ["Back", Math.PI],
            ].map(([label, angle]) => (
              <button
                key={label}
                onClick={() => stage.current?.focus(selected, Number(angle))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <aside className="atlas3d-controls">
          <div className="anatomy-inspector-tabs" role="group" aria-label="Anatomy inspector">
            <button aria-pressed={inspector === 'data'} onClick={() => setInspector('data')}>Patient data</button>
            <button aria-pressed={inspector === 'simulation'} onClick={() => setInspector('simulation')}>Simulation</button>
            <button aria-pressed={inspector === 'view'} onClick={() => setInspector('view')}>Layers & view</button>
          </div>
          <div className="anatomy-quick-organs" role="group" aria-label="Choose anatomy">
            {names.filter(id => !reconstructedMeshes || id === 'body' || reconstructedMeshes.some(m => m.id === id)).map(id => <button key={id} aria-pressed={selected === id} onClick={() => choose(id)}>{id === 'body' ? 'Whole body' : id}</button>)}
          </div>
          {inspector !== 'view' && <div className="anatomy-patient-inspector">
            {inspector === 'simulation' && !reconstructedMeshes && <section className="organ-simulation-panel" aria-label="Glucose visualization controls">
              <label className="atlas3d-toggle"><span>Glucose overlay on local 3D</span><input type="checkbox" checked={overlay} onChange={e => setOverlay(e.target.checked)} /></label>
              <p className="caption">Color represents this patient's systemic glucose, not organ function or anatomical change.</p>
              {!compact && <>
                <label className="caption">Compare model output
                  <select aria-label="Organ simulation scenario" value={scenario} disabled={!matchedForecast} onChange={e => { setScenario(e.target.value); setOverlay(true); }}>
                    <option value="">Baseline forecast</option>
                    {(matchedForecast ? simulation?.counterfactual_branches || [] : []).map(b => <option key={b.intervention_type} value={b.intervention_type}>{b.intervention_label}</option>)}
                  </select>
                </label>
                <label className="caption">{horizon ? `+${horizon} minutes` : 'Selected recording'}
                  <input aria-label="Organ forecast horizon" type="range" min="0" max="120" step="15" disabled={!matchedForecast} value={horizon} onChange={e => { setHorizon(Number(e.target.value)); setOverlay(true); }} />
                </label>
                <button className="organ-timeline-play" disabled={!matchedForecast} aria-pressed={playing} onClick={() => { setPlaying(v => !v); setOverlay(true); }}>{playing ? 'Pause timeline' : 'Play timeline'}</button>
                {glucoseState ? <div className="organ-simulation-value"><strong>{glucoseState.glucose.toFixed(1)} <small>mg/dL</small></strong><span>{glucoseState.source}</span>
                  {scenario && horizon > 0 && <small>{(glucoseState.glucose - glucoseState.baseline).toFixed(1)} mg/dL vs baseline at the same horizon</small>}
                  {glucoseState.lower !== null && glucoseState.upper !== null && <small>Sensitivity range {glucoseState.lower.toFixed(1)}–{glucoseState.upper.toFixed(1)} mg/dL</small>}
                </div> : <p>No matching model value for this horizon.</p>}
                {!matchedForecast && <p className="caption">A matching forecast is unavailable. Only recorded data can be visualized.</p>}
                {matchedForecast?.model_applicable === false && <p className="caption">Outside the model's evaluated domain.</p>}
              </>}
              <div className="organ-color-legend"><span>Purple: &lt;70</span><span>Mint → amber: 100 → 250 mg/dL</span></div>
              <small>Atlas geometry stays fixed. What-if responses are estimates; renal, cardiac and other organ outcomes are not forecast.</small>
            </section>}
            {inspector === 'simulation' && reconstructedMeshes && <p className="caption">Synthetic scan geometry is inspectable in Layers & view. No scan-derived physiological simulator is available.</p>}
            {inspector === 'data' && <OrganPatientData key={patient.person_id + selected} organ={selected} patient={patient} reading={reading} simulation={simulation} source={onlineReference && external ? `${external.title} by ${external.author}; online reference` : currentSpec?.source} reconstructed={Boolean(reconstructedMeshes)} />}
          </div>}
          <div className="anatomy-view-inspector" hidden={inspector !== 'view'}>
          {!reconstructedMeshes && (
            <>
              <div>
                <span className="eyebrow">Body presentation</span>
                <div className="anatomy-view-tabs">
                  <button
                    aria-pressed={surfaceView === "surface"}
                    onClick={() => {
                      setSurfaceView("surface");
                      setLayers((v) => ({ ...v, surface: true }));
                      choose("body");
                    }}
                  >
                    Surface
                  </button>
                  <button
                    aria-pressed={surfaceView === "window"}
                    onClick={() => {
                      setSurfaceView("window");
                      setLayers((v) => ({ ...v, surface: true }));
                      choose("body");
                    }}
                  >
                    Anatomy window
                  </button>
                </div>
                <label className="atlas3d-toggle">
                  <span>Show normal BMI outline (22)</span>
                  <input
                    type="checkbox"
                    checked={reference}
                    onChange={(e) => setReference(e.target.checked)}
                  />
                </label>
                <p className="caption">
                  {reference
                    ? "Mint outline: same-sex/age reference BMI 22. Patient shape and measurements stay visible."
                    : "Body shape varies with the profile. Fat distribution remains an estimate."}
                </p>
              </div>
              <div>
                <span className="eyebrow">Anatomy layers</span>
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
                        choose("body");
                      }}
                    />
                  </label>
                ))}
                {layers.muscles&&<label className="atlas3d-toggle"><span>Fascia & connective overlay</span><input type="checkbox" checked={showFascia} onChange={e=>setShowFascia(e.target.checked)}/></label>}
              {layers.surface && (
                  <label className="caption">
                    Skin opacity
                    <input
                      type="range"
                      min=".1"
                      max="1"
                      step=".05"
                      value={opacity}
                      aria-label="Skin opacity"
                      onChange={(e) => setOpacity(Number(e.target.value))}
                    />
                  </label>
                )}
              </div>
            </>
          )}
          {!reconstructedMeshes &&
            !onlineReference &&
            manifest?.alternatives?.[selected] && (
              <div className="anatomy-view-tabs">
                <button
                  aria-pressed={organSource === "alternate"}
                  onClick={() => setOrganSource("alternate")}
                >
                  Z-Anatomy reference
                </button>
                <button
                  aria-pressed={organSource === "reference"}
                  onClick={() => setOrganSource("reference")}
                >
                  Sex-matched HRA
                </button>
              </div>
            )}
          <div>
            <span className="eyebrow">Focus an organ</span>
            <div className="atlas3d-organ-list">
              {names
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
                    onClick={() => choose(id)}
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
          {selected !== "body" &&
            selected !== "brain" &&
            !reconstructedMeshes &&
            !onlineReference && (
              <div className="anatomy-cutaway-controls">
                <label className="caption">
                  Outer tissue opacity
                  <input
                    type="range"
                    min=".25"
                    max="1"
                    step=".05"
                    value={tissueOpacity}
                    aria-label="Organ tissue opacity"
                    onChange={(e) => setTissueOpacity(Number(e.target.value))}
                  />
                </label>
                <label className="caption">
                  Reveal internal structures
                  <input
                    type="range"
                    min="0"
                    max=".8"
                    step=".05"
                    value={cut}
                    aria-label="Organ cutaway depth"
                    onChange={(e) => setCut(Number(e.target.value))}
                  />
                </label>
                <p className="caption">
                  {cut === 0
                    ? "Outer surface"
                    : `${Math.round(cut * 100)}% viewing cut · atlas anatomy`}
                </p>
                {selected === "heart" && (
                  <label className="atlas3d-toggle">
                    <span>Reference heartbeat</span>
                    <input
                      type="checkbox"
                      checked={heartbeat}
                      onChange={(e) => setHeartbeat(e.target.checked)}
                    />
                  </label>
                )}
              </div>
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
        </aside>
      </div>
      <div className="anatomy-evidence-grid">
        <div>
          <span className="eyebrow">
            {projectedGlucose !== undefined
              ? "Projected glucose · existing model"
              : "How to read this view"}
          </span>
          {projectedGlucose!==undefined&&<div className="anatomy-measurements"><span><b>{glucose?.toFixed(1)??'Unavailable'}</b> mg/dL projected glucose</span></div>}
          <p className="caption">
            {reconstructedMeshes
              ? "Geometry is reconstructed from an explicitly synthetic CT. Display materials do not establish real tissue pathology."
              : context[selected] || context.body}
          </p>
        </div>
        <div>
          <span className="eyebrow">What is personalized?</span>
          <p className="caption">
            {reconstructedMeshes
              ? "The synthetic study is linked to this profile by a reproducible seed; it is not acquired anatomy."
              : `Body: ${phenotype.sex} phenotype, recorded BMI and age. Organs: selected atlas references; shared models are labeled by source. Individual organ shape, fat, scarring and disease remain unmeasured.`}
          </p>
          {phenotype.missing.length > 0 && (
            <p className="caption">
              Unavailable: {phenotype.missing.join(", ")}. Neutral reference
              defaults are used.
            </p>
          )}
        </div>
      </div>
      <details className="technical-details">
        <summary>Model fit, sources & evidence limits</summary>
        <p className="caption">
          {currentSpec?.source ||
            "MakeHuman CC0 body; HRA CC BY 4.0 organs; shared BodyParts3D CC BY 4.0 skeleton/muscle/brain reference."}{" "}
          Shared skeletal and muscular structures are not a patient-specific or
          female-specific scan. Body/organ alignment is a presentation
          registration, not clinical image registration. Combined reference
          layers are clipped to the estimated body silhouette; this does not
          establish patient bone or muscle anatomy. Procedural tissue detail and
          soft scattering are display materials.
        </p>
        <p className="caption">
          High glucose alone cannot establish pancreatic fat, volume loss or
          beta-cell mass. BMI does not directly measure body composition. These
          unknowns are not painted as observed damage.{" "}
          {simulation?.baseline.model_applicable === false
            ? "The current recording is outside the incident-spike model’s evaluated domain."
            : ""}
        </p>
        <div className="button-row">
          <button
            className="button secondary"
            onClick={() =>
              downloadJson(`anatomy-fit-${patient.person_id}.json`, {
                patient_id: patient.person_id,
                phenotype,
                organ_geometry: reconstructedMeshes?'Synthetic CT reconstruction':onlineReference?'Online educational reference, not patient imaging':currentSpec?.source||'Shared reference anatomy',
                selected_organ:selected,
                asset_url:onlineReference?external?.url:currentSpec?.url,
                reference_bmi_outline:reference?22:null,
                source_version:
                  "Presentation v3; Z-Anatomy/BodyParts3D; Allen/HRA v1.2; MakeHuman; see asset attribution and source lock",
                limits: context,
              })
            }
          >
            Export model-fit evidence
          </button>
          <a href="/anatomy/v3/ATTRIBUTION.md" target="_blank" rel="noreferrer">
            Asset attribution
          </a>
          <a
            href="https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0126825"
            target="_blank"
            rel="noreferrer"
          >
            Pancreas imaging research
          </a>
          <a
            href="https://www.cdc.gov/bmi/faq/"
            target="_blank"
            rel="noreferrer"
          >
            BMI interpretation
          </a>
        </div>
      </details>
    </section>
  );
}
