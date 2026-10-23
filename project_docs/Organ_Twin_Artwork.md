# Organ twin artwork and frontend scope

The workstation is a frontend-only demonstration. Fictional fixtures live in `frontend/doctor-review-ui/src/diagnostics/demoData.ts`. No patient, prediction, simulation or health API requests are made. The Vite backend proxy was removed; backend services and models are unchanged.

The central viewer cycles through Body, Pancreas, Kidneys, Heart and Brain. These are interactive atlas illustrations, not segmented patient volumes or calibrated physiological twins. The angle control changes a two-dimensional illustration's presentation; it does not reveal unseen anatomy. Generated artwork and approximate landmarks require medical review before educational or clinical deployment.

## Saved artwork

All artwork is in `frontend/doctor-review-ui/public/diagnostics/`:

- `anatomy.png`, `brain.png`: existing body and brain illustrations, preserved.
- `pancreas-atlas.png`: isolated pancreatic illustration.
- `kidneys-atlas.png`: paired renal illustration with a cutaway.
- `heart-atlas.png`: anterior cardiac illustration.

New assets were produced using the built-in imagegen tool. Original generated files remain in the Codex generated-images directory. CSS applies one cyan/teal palette, matching the brain, and feathers image edges into the workstation. No image-editing scripts were used.

## Final generation prompt set

Each subject below was inserted into this common prompt:

> Use case: scientific-educational. Asset type: detailed organ illustration for a professional digital twin workstation, not a diagnostic scan. Subject: [subject below]. Style: museum-quality 3D medical atlas illustration with fine luminous wireframe meshes following the organic surface, soft translucent volumetric tissue, intricate realistic anatomical detail. Backdrop: solid near black navy #050e18, no horizon or stage. Composition: one organ specimen centered, complete with generous 14 percent margin, square canvas. Lighting: restrained cyan edge lighting, soft depth and sculptural shading, professional clinical workstation aesthetic. Constraints: anatomically credible teaching illustration, no pathology, no labels, no text, no HUD, no interface, no numbers, no frames, no extra organs.

Heart:

> An isolated anatomically plausible adult human heart in anterior view, detailed cardiac ventricles, atria, major vessels at the superior pole and branching coronary vessels on the surface. Apex points toward viewer's right, no cartoon heart shape. Subtle coral and pale cyan translucent fibers.

Kidneys:

> An isolated anatomically plausible PAIR of adult human kidneys in anterior view. Two bean-shaped kidneys with medial hila facing inward, left kidney slightly higher than right, proximal renal arteries and veins entering medial hila, two ureters descending a short distance. One kidney partly translucent with subtle internal renal pyramids. Pale lavender and cyan.

Pancreas:

> An isolated anatomically plausible adult human pancreas in anterior view. Elongated lobulated tapered organ horizontal across composition, broad head at viewer left, neck then body then tapering tail at viewer right, branching pancreatic duct faintly visible within translucent glandular tissue. No surrounding intestine or liver. Muted warm ivory amber with pale cyan vascular detail.

The user subsequently requested uniform coloring matching the brain. Frontend CSS overrides the original subject-specific colors while retaining the illustration details.

## Related scans

Selecting an organ changes its scan panel. Brain MRI illustrations are explicitly labelled. No acquired patient scans are bundled. Other organs show relevant modality names and an empty state until an image is chosen locally. PNG/JPEG/WebP files remain in browser object URLs, can be removed or replaced, and are never uploaded or interpreted. DICOM support is not implemented.
