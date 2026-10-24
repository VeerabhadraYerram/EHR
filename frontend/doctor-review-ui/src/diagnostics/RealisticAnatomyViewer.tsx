import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Maximize2, Pause, Play, RotateCcw } from 'lucide-react';
import { phenotypeFor } from './patientPhenotype';
import { tissueMaterial } from './anatomyMaterials';
import { downloadJson } from './patientService';
import type { Patient, PatientSimulation, Reading } from './types';
import './anatomy-3d.css';
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
}
const modelCache = new Map<string, Promise<THREE.Group>>();
function model(url: string) {
    if (!modelCache.has(url))
        modelCache.set(url, new GLTFLoader().loadAsync(url).then(g => g.scene).catch(e => { modelCache.delete(url); throw e; }));
    return modelCache.get(url)!;
}
const names = ['body', 'heart', 'brain', 'pancreas', 'kidneys', 'liver', 'lungs'];
const context: Record<string, string> = {
    body: 'Body habitus uses recorded sex, age and BMI. It is an estimated reference avatar, not a body scan. Stature, waist, muscle mass and fat distribution have not been measured.',
    pancreas: 'HbA1c and C-peptide describe glycaemic context and endogenous insulin secretion. They do not measure pancreas volume, fat or beta-cell mass; those anatomical properties remain unknown.',
    heart: 'Reference chambers, valves and vessels. No cardiac scan, ejection fraction or coronary stenosis measurements are available.',
    kidneys: 'eGFR is clinical functional context. It does not reveal an individual kidney’s size, scarring or internal anatomy. Cutaway structures are an atlas reference.',
    liver: 'Reference liver anatomy. Liver fat and fibrosis cannot be established from BMI or glucose alone; imaging and appropriate clinical tests are needed.',
    brain: 'Shared reference brain anatomy. No brain scan, atrophy or neurological tissue measurements are available.',
    lungs: 'Complete reference lung tissue and airways. No patient chest imaging or lung-function measurements are available.'
};
export default function RealisticAnatomyViewer({ patient, reading, simulation, active = true, compact = false, projectedGlucose, title = 'Anatomy & patient phenotype', reconstructedMeshes }: Props) {
    const host = useRef<HTMLDivElement>(null), stage = useRef<Stage | null>(null);
    const [manifest, setManifest] = useState<Manifest | null>(null), [selected, setSelected] = useState(reconstructedMeshes ? 'kidneys' : 'body'), [error, setError] = useState(''), [loaded, setLoaded] = useState(0), [retry, setRetry] = useState(0);
    const [layers, setLayers] = useState<Record<string, boolean>>({ surface: true, skeleton: false, muscles: false, vascular: false, nervous: false, organs: true });
    const [expanded, setExpanded] = useState(false), [surfaceView, setSurfaceView] = useState<'surface' | 'window'>('window'), [opacity, setOpacity] = useState(1), [rotate, setRotate] = useState(false), [wireframe, setWireframe] = useState(false), [cut, setCut] = useState(reconstructedMeshes ? 0 : .0), [heartbeat, setHeartbeat] = useState(false), [reference, setReference] = useState(false), [tissueOpacity, setTissueOpacity] = useState(1);
    const phenotype = useMemo(() => phenotypeFor(patient, reference), [patient, reference]);
    const specs = useMemo(() => {
        if (!manifest)
            return [];
        if (reconstructedMeshes)
            return manifest.shared_meshes.filter(s => reconstructedMeshes.some(m => m.id === s.id)).map(s => ({ ...s, url: reconstructedMeshes.find(m => m.id === s.id)!.url }));
        return manifest.shared_meshes.map(s => {
            const asset = s.id === 'skin' ? manifest.bodies[phenotype.sex] : manifest.organs[s.id]?.[phenotype.sex];
            return asset ? { ...s, ...asset, url: asset.url + (asset.sha256 ? '?v=' + asset.sha256.slice(0, 12) : '') } : s;
        });
    }, [manifest, phenotype.sex, reconstructedMeshes]);
    const live = useRef({ selected, layers, surfaceView, opacity, rotate, wireframe, cut, heartbeat, phenotype, tissueOpacity });
    live.current = { selected, layers, surfaceView, opacity, rotate, wireframe, cut, heartbeat, phenotype, tissueOpacity };
    useEffect(() => { const c = new AbortController(); fetch('/anatomy/v2/manifest.json', { signal: c.signal }).then(r => { if (!r.ok)
        throw new Error('Presentation atlas unavailable. Run python -m scripts.build_realistic_anatomy.'); return r.json(); }).then(setManifest).catch(e => { if (e.name !== 'AbortError')
        setError(e.message); }); return () => c.abort(); }, [retry]);
    useEffect(() => {
        if (!active || !host.current || !specs.length)
            return;
        const element = host.current;
        let disposed = false, frame = 0, dirty = true;
        setLoaded(0);
        setError('');
        let renderer: THREE.WebGLRenderer;
        try {
            renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        }
        catch {
            setError('WebGL could not start. Enable hardware acceleration and retry.');
            return;
        }
        renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
        renderer.setClearColor('#0b151b');
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.12;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        element.appendChild(renderer.domElement);
        renderer.domElement.setAttribute('role', 'img');
        renderer.domElement.setAttribute('aria-label', 'Interactive anatomical model. Drag to orbit and scroll to zoom. Organ selection and viewing controls are also available as buttons.');
        const scene = new THREE.Scene();
        scene.fog = new THREE.Fog('#0b151b', 10, 22);
        const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
        const env = pmrem.fromScene(room, .035);
        scene.environment = env.texture;
        scene.environmentIntensity = .3;
        room.dispose();
        pmrem.dispose();
        scene.add(new THREE.HemisphereLight('#cadce0', '#172531', .65));
        const key = new THREE.DirectionalLight('#fff0df', 3.0);
        key.position.set(2.4, 3.8, 4);
        key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048);
        key.shadow.camera.left = -2;
        key.shadow.camera.right = 2;
        key.shadow.camera.top = 2;
        key.shadow.camera.bottom = -2;
        key.shadow.bias = -.0002;
        key.shadow.normalBias = .002;
        scene.add(key);
        const fill = new THREE.DirectionalLight('#a9cbd7', 1.3);
        fill.position.set(-3, 1.4, 2);
        scene.add(fill);
        const rim = new THREE.DirectionalLight('#d3b2a1', 3);
        rim.position.set(1.8, 1.8, -3);
        scene.add(rim);
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ color: '#000308', opacity: .3 }));
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -1.41;
        floor.receiveShadow = true;
        scene.add(floor);
        const root = new THREE.Group(), original = new THREE.Group();
        root.rotation.x = -Math.PI / 2;
        root.scale.setScalar(2.8 / 1719);
        original.position.set(0, 101, -781.5);
        root.add(original);
        scene.add(root);
        const camera = new THREE.PerspectiveCamera(33, 1, .004, 50);
        camera.position.set(.2, .1, 5.5);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = .085;
        controls.minDistance = .18;
        controls.maxDistance = 12;
        controls.autoRotateSpeed = .45;
        const models = new Map<string, THREE.Group>();
        function focus(id: string, angle = 0) {
            const targetModel = id === 'body' ? (models.get('skin') || original) : models.get(id);
            if (!targetModel)
                return;
            root.updateMatrixWorld(true);
            let box = new THREE.Box3().setFromObject(targetModel, true);
            if (reconstructedMeshes && id === 'body') {
                box = new THREE.Box3();
                models.forEach(m => box.union(new THREE.Box3().setFromObject(m, true)));
            }
            const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
            if (!Number.isFinite(size.length()) || size.length() === 0)
                return;
            const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
            const distance = Math.max(size.y / (2 * tangent), size.x / (2 * tangent * Math.max(.1, camera.aspect))) * 1.15 + size.z * .55;
            controls.target.copy(center);
            camera.position.copy(center).add(new THREE.Vector3(Math.sin(angle) * distance, .02, Math.cos(angle) * distance));
            camera.near = Math.max(.002, distance / 250);
            camera.updateProjectionMatrix();
            controls.update();
            dirty = true;
        }
        stage.current = { focus, models };
        specs.forEach(spec => model(spec.url).then(source => {
            if (disposed)
                return;
            const content = source.clone(true), container = new THREE.Group();
            container.name = spec.id;
            const rawBox = new THREE.Box3().setFromObject(content, true), center = rawBox.getCenter(new THREE.Vector3());
            content.position.sub(center);
            container.position.copy(center);
            container.add(content);
            container.userData = { ...spec, rawMinY: rawBox.min.y, rawMaxY: rawBox.max.y };
            content.traverse(object => { const mesh = object as THREE.Mesh; if (!mesh.isMesh)
                return; if (!mesh.geometry.attributes.normal)
                mesh.geometry.computeVertexNormals(); mesh.material = tissueMaterial(spec.id, mesh.name); mesh.castShadow = spec.id === 'skin' || spec.id === 'muscles' || spec.layer === 'organs'; mesh.receiveShadow = true; mesh.userData.organId = spec.id; if (spec.id === 'skin' && mesh.morphTargetInfluences)
                mesh.morphTargetInfluences = live.current.phenotype.morphWeights.slice(); });
            original.add(container);
            models.set(spec.id, container);
            setLoaded(v => v + 1);
            dirty = true;
            if (spec.id === live.current.selected || spec.id === 'skin' && live.current.selected === 'body' || models.size === specs.length)
                focus(live.current.selected);
        }).catch(e => { if (!disposed)
            setError(`Unable to load ${spec.label}: ${e.message}`); }));
        const resize = () => { const w = Math.max(1, element.clientWidth), h = Math.max(1, element.clientHeight); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); focus(live.current.selected); dirty = true; };
        const observer = new ResizeObserver(resize);
        observer.observe(element);
        resize();
        const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
        let down = { x: 0, y: 0 };
        const pointerDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
        const pointerUp = (e: PointerEvent) => { if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5)
            return; const s = live.current; if (s.selected === 'body' && s.layers.surface && s.surfaceView === 'surface' && s.opacity > .8)
            return; const rect = renderer.domElement.getBoundingClientRect(); pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1); raycaster.setFromCamera(pointer, camera); const hits = raycaster.intersectObjects([...models.values()].filter(m => m.visible && m.userData.layer === 'organs'), true); if (hits[0]) {
            setSelected(hits[0].object.userData.organId);
            setCut(0);
        } };
        renderer.domElement.addEventListener('pointerdown', pointerDown);
        renderer.domElement.addEventListener('pointerup', pointerUp);
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        let previous: typeof live.current | null = null;
        const animate = () => {
            if (disposed)
                return;
            frame = requestAnimationFrame(animate);
            const s = live.current;
            controls.autoRotate = s.rotate && !reduced;
            const moved = controls.update();
            if (!dirty && !moved && s === previous && !s.heartbeat && !s.rotate)
                return;
            previous = s;
            dirty = false;
            models.forEach((group, id) => {
                const isolated = s.selected !== 'body';
                group.visible = isolated ? id === s.selected : Boolean(s.layers[group.userData.layer]);
                const cutY = group.userData.rawMinY + (group.userData.rawMaxY - group.userData.rawMinY) * s.cut;
                group.traverse(object => {
                    const mesh = object as THREE.Mesh;
                    if (!mesh.isMesh)
                        return;
                    const mat = mesh.material as THREE.MeshPhysicalMaterial;
                    mat.wireframe = s.wireframe;
                    const outer = mat.userData.outer;
                    const alpha = id === 'skin' ? s.opacity : group.userData.layer === 'organs' && outer ? s.tissueOpacity : 1;
                    mat.transparent = alpha < .99;
                    mat.opacity = alpha;
                    mat.depthWrite = alpha >= .99;
                    const uniforms = mat.userData.uniforms;
                    uniforms.uAnatomyWindow.value = id === 'skin' && s.surfaceView === 'window' ? 1 : 0;
                    uniforms.uAnatomyCut.value = isolated && !reconstructedMeshes ? s.cut : 0;
                    uniforms.uAnatomyCutY.value = cutY;
                    if (id === 'skin' && mesh.morphTargetInfluences)
                        for (let i = 0; i < 5; i++)
                            mesh.morphTargetInfluences[i] = s.phenotype.morphWeights[i];
                });
                group.scale.setScalar(id === 'heart' && s.heartbeat && !reduced ? 1 + Math.sin(performance.now() / 1000 * Math.PI * 2 * 1.2) * .012 : 1);
            });
            renderer.render(scene, camera);
        };
        animate();
        const lost = (e: Event) => { e.preventDefault(); setError('Graphics context lost. Retry the 3D viewer.'); };
        renderer.domElement.addEventListener('webglcontextlost', lost);
        return () => { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); controls.dispose(); models.forEach(g => g.traverse(o => { if ((o as THREE.Mesh).isMesh)
            ((o as THREE.Mesh).material as THREE.Material).dispose(); })); (floor.geometry as THREE.BufferGeometry).dispose(); (floor.material as THREE.Material).dispose(); env.dispose(); renderer.dispose(); renderer.domElement.remove(); stage.current = null; };
    }, [active, specs, retry, reconstructedMeshes]);
    useEffect(() => { stage.current?.focus(selected); }, [selected]);
    useEffect(() => {
        if (!expanded)
            return;
        const dialog = host.current?.parentElement, previousFocus = document.activeElement as HTMLElement | null, previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        dialog?.querySelector<HTMLButtonElement>('button[aria-label="Close expanded 3D viewer"]')?.focus({ preventScroll: true });
        const key = (e: KeyboardEvent) => {
            if (e.key === 'Escape')
                setExpanded(false);
            if (e.key !== 'Tab' || !dialog)
                return;
            const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button,input')).filter(n => !n.hasAttribute('disabled'));
            const first = controls[0], last = controls[controls.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last?.focus();
            }
            else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first?.focus();
            }
        };
        window.addEventListener('keydown', key);
        return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', key); previousFocus?.focus({ preventScroll: true }); };
    }, [expanded]);
    function choose(id: string) { setSelected(id); setCut(0); setHeartbeat(false); setTissueOpacity(1); }
    const glucose = projectedGlucose ?? reading?.glucose_mg_dl, sexLabel = phenotype.sex === 'neutral' ? 'Sex unavailable' : `${phenotype.sex[0].toUpperCase() + phenotype.sex.slice(1)} reference`;
    const currentSpec = specs.find(s => s.id === selected);
    return <section className={`paper-card atlas3d atlas3d-realistic ${compact ? 'compact' : ''}`} aria-label="Real 3D patient anatomy"><div className="card-heading"><div><span className="eyebrow">{reconstructedMeshes ? 'Synthetic CT · reconstructed geometry' : 'Profile-conditioned anatomy · reference organs'}</span><h2>{title}</h2></div><span className="subtle-tag">{patient.person_id} · {reconstructedMeshes ? 'Synthetic study' : sexLabel}</span></div><div className="anatomy-profile-strip"><span>Recorded sex <b>{patient.sex || 'Unavailable'}</b></span><span>Age <b>{phenotype.age ?? '—'} years</b></span><span>BMI <b>{phenotype.bmi ?? '—'} kg/m²</b></span><span>Geometry <b>{reconstructedMeshes ? 'Synthetic scan' : 'Estimated habitus + atlas'}</b></span></div><div className="atlas3d-layout"><div className={`atlas3d-stage ${expanded ? "anatomy-expanded" : ""}`} role={expanded ? "dialog" : undefined} aria-modal={expanded ? true : undefined} aria-label={expanded ? "Expanded 3D anatomy" : undefined}><div ref={host} className="atlas3d-canvas"/>{!error && loaded < specs.length && <div className="atlas3d-loading" role="status">Preparing anatomy · {loaded}/{specs.length}</div>}{error && <div className="atlas3d-loading notice error" role="alert">{error}<button className="button secondary" onClick={() => setRetry(r => r + 1)}>Retry 3D viewer</button></div>}<div className="anatomy-scene-caption"><span>{selected === 'body' ? 'Whole-body phenotype' : selected}</span><small>{reconstructedMeshes ? 'Generated CT surfaces' : selected === 'body' ? reference ? 'Reference BMI 22 preview' : `${phenotype.sex} · BMI ${phenotype.bmi ?? 'unknown'} · ${phenotype.age ?? 'unknown'} years · estimated shape` : selected === 'brain' ? 'Shared reference anatomy' : `${sexLabel} · HRA anatomical compartments`}</small></div><div className="atlas3d-help">Drag to orbit · scroll to zoom · select an organ</div><div className="atlas3d-tools"><button className="icon-button" aria-label="Reset 3D camera" onClick={() => stage.current?.focus(selected)}><RotateCcw size={16}/></button><button className="icon-button" aria-label={rotate ? 'Pause rotation' : 'Rotate automatically'} onClick={() => setRotate(!rotate)}>{rotate ? <Pause size={16}/> : <Play size={16}/>}</button><button className="icon-button" aria-label={expanded ? "Close expanded 3D viewer" : "Expand 3D viewer"} onClick={() => setExpanded(v => !v)}><Maximize2 size={16}/></button></div>{expanded && <div className="anatomy-expanded-settings">{selected === 'body' ? <label><input type="checkbox" checked={reference} onChange={e => setReference(e.target.checked)}/> BMI 22 reference preview</label> : selected !== 'brain' && !reconstructedMeshes ? <><label>Tissue opacity<input type="range" min=".25" max="1" step=".05" value={tissueOpacity} aria-label="Expanded organ tissue opacity" onChange={e => setTissueOpacity(Number(e.target.value))}/></label><label>Cutaway<input type="range" min="0" max=".8" step=".05" value={cut} aria-label="Expanded organ cutaway depth" onChange={e => setCut(Number(e.target.value))}/></label></> : null}</div>}{expanded && <div className="anatomy-expanded-organs">{names.filter(id => !reconstructedMeshes || id === 'body' || reconstructedMeshes.some(m => m.id === id)).map(id => <button key={id} aria-pressed={selected === id} onClick={() => choose(id)}>{id === 'body' ? 'Whole body' : id}</button>)}</div>}<div className="anatomy-camera-presets">{[['Front', 0], ['Three-quarter', .6], ['Back', Math.PI]].map(([label, angle]) => <button key={label} onClick={() => stage.current?.focus(selected, Number(angle))}>{label}</button>)}</div></div><aside className="atlas3d-controls">{!reconstructedMeshes && <><div><span className="eyebrow">Body presentation</span><div className="anatomy-view-tabs"><button aria-pressed={surfaceView === 'surface'} onClick={() => { setSurfaceView('surface'); setLayers(v => ({ ...v, surface: true })); choose('body'); }}>Surface</button><button aria-pressed={surfaceView === 'window'} onClick={() => { setSurfaceView('window'); setLayers(v => ({ ...v, surface: true })); choose('body'); }}>Anatomy window</button></div><label className="atlas3d-toggle"><span>Compare reference BMI 22</span><input type="checkbox" checked={reference} onChange={e => setReference(e.target.checked)}/></label><p className="caption">{reference ? 'Preview only; the recorded BMI is unchanged.' : 'Body shape varies with the profile. Fat distribution remains an estimate.'}</p></div><div><span className="eyebrow">Anatomy layers</span>{[['surface', 'Body surface'], ['skeleton', 'Skeleton'], ['muscles', 'Muscles & connective tissue'], ['vascular', 'Cardiovascular'], ['nervous', 'Nervous system'], ['organs', 'Organs']].map(([id, label]) => <label className="atlas3d-toggle" key={id}><span>{label}</span><input type="checkbox" checked={layers[id]} onChange={e => { setLayers(v => ({ ...v, [id]: e.target.checked })); choose('body'); }}/></label>)}{layers.surface && <label className="caption">Skin opacity<input type="range" min=".1" max="1" step=".05" value={opacity} aria-label="Skin opacity" onChange={e => setOpacity(Number(e.target.value))}/></label>}</div></>}<div><span className="eyebrow">Focus an organ</span><div className="atlas3d-organ-list">{names.filter(id => !reconstructedMeshes || id === 'body' || reconstructedMeshes.some(m => m.id === id)).map(id => <button key={id} aria-pressed={selected === id} className={selected === id ? 'selected' : ''} onClick={() => choose(id)}>{id === 'body' ? reconstructedMeshes ? 'Study overview' : 'Whole body' : id}</button>)}</div></div>{selected !== 'body' && selected !== 'brain' && !reconstructedMeshes && <div className="anatomy-cutaway-controls"><label className="caption">Outer tissue opacity<input type="range" min=".25" max="1" step=".05" value={tissueOpacity} aria-label="Organ tissue opacity" onChange={e => setTissueOpacity(Number(e.target.value))}/></label><label className="caption">Reveal internal structures<input type="range" min="0" max=".8" step=".05" value={cut} aria-label="Organ cutaway depth" onChange={e => setCut(Number(e.target.value))}/></label><p className="caption">{cut === 0 ? 'Outer surface' : `${Math.round(cut * 100)}% viewing cut · atlas anatomy`}</p>{selected === 'heart' && <label className="atlas3d-toggle"><span>Reference heartbeat</span><input type="checkbox" checked={heartbeat} onChange={e => setHeartbeat(e.target.checked)}/></label>}</div>}<label className="atlas3d-toggle"><span>Mesh inspection</span><input type="checkbox" checked={wireframe} onChange={e => setWireframe(e.target.checked)}/></label></aside></div><div className="anatomy-evidence-grid"><div><span className="eyebrow">{projectedGlucose !== undefined ? 'Projected glucose · existing model' : 'Recorded clinical context'}</span><div className="anatomy-measurements"><span><b>{glucose === undefined ? '—' : glucose.toFixed(1)}</b> mg/dL glucose</span><span><b>{patient.hba1c_percent}</b>% HbA1c</span><span><b>{patient.fasting_c_peptide_nmol_l}</b> nmol/L C-peptide</span><span><b>{patient.egfr}</b> eGFR</span></div><p className="caption">{reconstructedMeshes ? 'Geometry is reconstructed from an explicitly synthetic CT. Display materials do not establish real tissue pathology.' : context[selected] || context.body}</p></div><div><span className="eyebrow">What is personalized?</span><p className="caption">{reconstructedMeshes ? 'The synthetic study is linked to this profile by a reproducible seed; it is not acquired anatomy.' : `Body: ${phenotype.sex} phenotype, recorded BMI and age. Organs: sex-matched references where available. Individual organ shape, fat, scarring and disease remain unmeasured.`}</p>{phenotype.missing.length > 0 && <p className="caption">Unavailable: {phenotype.missing.join(', ')}. Neutral reference defaults are used.</p>}</div></div><details className="technical-details"><summary>Model fit, sources & evidence limits</summary><p className="caption">{currentSpec?.source || 'MakeHuman CC0 body; HRA CC BY 4.0 organs; shared BodyParts3D CC BY 4.0 skeleton/muscle/brain reference.'} Shared skeletal and muscular structures are not a patient-specific or female-specific scan. Body/organ alignment is a presentation registration, not clinical image registration. Procedural tissue detail and soft scattering are display materials.</p><p className="caption">High glucose alone cannot establish pancreatic fat, volume loss or beta-cell mass. BMI does not directly measure body composition. These unknowns are not painted as observed damage. {simulation?.baseline.model_applicable === false ? 'The current recording is outside the incident-spike model’s evaluated domain.' : ''}</p><div className="button-row"><button className="button secondary" onClick={() => downloadJson(`anatomy-fit-${patient.person_id}.json`, { patient_id: patient.person_id, phenotype, organ_geometry: 'Sex-matched reference, not patient imaging', source_version: 'HRA v1.2; male pancreatic/liver ducts v1.1; MakeHuman core macro targets', limits: context })}>Export model-fit evidence</button><a href="/anatomy/v2/ATTRIBUTION.md" target="_blank" rel="noreferrer">Asset attribution</a><a href="https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0126825" target="_blank" rel="noreferrer">Pancreas imaging research</a><a href="https://www.cdc.gov/bmi/faq/" target="_blank" rel="noreferrer">BMI interpretation</a></div></details></section>;
}
