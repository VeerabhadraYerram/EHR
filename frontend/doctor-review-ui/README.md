# EHR Diagnostic Workstation

The diagnostic workstation is the only active frontend. Both `/` and `/diagnostics` open the same interface; retired application paths normalize to `/`.

## Run locally

```bash
cd frontend/doctor-review-ui
npm ci
npm run dev
```

Open http://127.0.0.1:5188/.

```bash
npm run build
npm run preview
```

## Interface

- Anatomical and cortical illustrations with interactive overlay controls and a projected view-angle toggle.
- Illustrative MRI planes, thoracic imaging, physiology signals, genomic sequence exploration, and reconstruction indicators.
- Demo subject selection, signal pause/resume, simulated acquisition controls, and downloadable concept reports.
- Responsive layouts, keyboard-accessible dialogs, and reduced-motion support.

All displayed medical signals, imaging, and reconstruction values are illustrative. The interface does not perform clinical diagnosis, medical-image reconstruction, genomic analysis, or live device monitoring. The anatomical view is an illustration with overlays, not a volumetric 3D renderer.

The existing FastAPI services and model/data pipelines remain in the repository. Vite retains `/api` and `/health` proxying to port 8000; the workstation concept does not claim integration with those services.

DM Sans is self-hosted under `public/fonts/`, with its SIL Open Font License included. Anatomical artwork is stored under `public/diagnostics/`; the remaining technical diagrams are implemented as SVG.
