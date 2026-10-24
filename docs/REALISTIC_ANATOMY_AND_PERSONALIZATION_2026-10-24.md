# Anatomy realism and patient personalization — 24 October 2026

## Implemented checkpoint

The anatomical viewer now separates body appearance, reference organ anatomy and recorded clinical measurements. It does not translate blood glucose into invented organ damage. Simulation behavior is deferred as requested.

* MakeHuman CC0 female, male and neutral body meshes replace the single male surface. Five morph targets blend adult age and weight references. BMI maps to a bounded display weight, with an authored abdominal/hip adiposity envelope. This makes high-BMI profiles visibly different, but does not estimate body-fat percentage, visceral fat, waist or actual stature. All avatars use reference stature. An equal ancestry blend is used; nationality does not determine ancestry or skin tone.
* Human Reference Atlas Visible Human female/male organ compartments replace the simplified heart, lungs, pancreas, kidneys and liver. Named parts, vessels and ducts remain separate. Unknown recorded sex uses shared generic references. Brain, muscles, skeleton and nerves remain shared BodyParts3D references, explicitly disclosed.
* Lung parenchyma is rendered, rather than presenting only the airway tree as the lungs. Smooth exported normals, physical tissue materials, procedural microdetail, soft studio lighting, environment illumination and darker presentation improve depth and tissue readability.
* Orbit, zoom, camera presets, auto-rotation, layer selection, skin opacity, organ outer-tissue opacity and viewing cutaways are available. Expanded viewing uses an inline modal instead of the unreliable native fullscreen flow. A BMI-22 comparison changes only display geometry. Model-fit evidence can be exported.
* A reference heartbeat is optional, labeled and off by default. Recorded glucose does not drive an invented heart rate. Procedural color/marbling is illustrative surface detail, not measured perfusion or pathology.

## Research and asset choice

| Source | Useful properties | Limitations / decision |
|---|---|---|
| [HRA 3D reference library](https://humanatlas.io/3d-reference-library), [official source repository](https://github.com/hubmapconsortium/ccf-3d-reference-object-library) | Curated, named anatomical compartments, male/female references, CC BY 4.0 | Use for five organ families. An atlas is not an acquired patient scan. Credit and adaptation notes shipped with assets. |
| [MakeHuman license](https://www.makehumancommunity.org/about/license.html), [core source](https://github.com/makehumancommunity/makehuman) | Coherent human topology with sex, age and weight targets; core asset exception is CC0 | Use core asset data with our own exporter. Application source licensing is separate. Appearance is estimated; no inferred ancestry. |
| [Three.js physical material](https://threejs.org/docs/pages/MeshPhysicalMaterial.html), [subsurface example](https://threejs.org/examples/webgl_materials_subsurface_scattering.html) | Environment lighting, roughness, clearcoat and surface detail convey tissue more convincingly than a flat single-color material | Current shader adds an inexpensive wrapped-light approximation. It is not a measured optical tissue model or full volumetric scattering. |
| [CDC BMI interpretation](https://www.cdc.gov/bmi/faq/) | BMI is a screening measure and does not directly measure body fat | BMI controls a clearly labeled bounded habitus illustration; it cannot supply patient-specific fat distribution. |
| [MRI pancreas study](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0126825) | Demonstrates group-level pancreas volume, shape and fat differences studied with imaging in type 2 diabetes | These group findings do not determine an individual pancreas from glucose/HbA1c. No automatic pancreatic shrinkage/fat display is claimed. |

Firecrawl was attempted but its API hostname could not resolve in this environment. Official source repositories, documentation and the original study were checked through the available web fallback.

## Geometry provenance and modifications

V2 assets live in `frontend/doctor-review-ui/public/anatomy/v2/`; original atlas and synthetic imaging inputs remain separate. The manifest records output SHA-256, source filenames, sex, compartments and coordinate registration. `source-lock.json` records exact upstream paths, repository revisions and source hashes; `python scripts/fetch_realistic_anatomy.py` retrieves and verifies those inputs. `python scripts/build_realistic_anatomy.py` rebuilds the presentation files.

HRA coordinates are converted uniformly from metres/Y-up into millimetres/Z-up, then aligned by the reference organ bounding centre. This is presentation registration, not clinical image registration. Heart auxiliary vessels are cropped to local bounds for framing. Pancreas tissue is subdivided and smoothed with deterministic illustrative relief up to approximately 1 mm; lobules are display detail, not measured histology. Body arms receive a mild presentation pose adjustment; the high-weight endpoint includes the disclosed authored adiposity envelope. HRA primary references are v1.2; male pancreatic and liver ducts use v1.1 because matching v1.2 files were unavailable. Attribution must retain these adaptations.

## What a defensible patient-specific pancreas would require

1. Acquired CT/MRI, consent and de-identification, with study/series provenance. For actual pancreatic fat, use an appropriate MRI acquisition/measurement rather than deriving it from a glucose number.
2. Organ segmentation, reviewed masks and quality checks. Extract the surface from the segmentation in physical coordinates; keep the unsmoothed mask for volume measurement and record any display smoothing.
3. Registration and comparison with a prior scan in the same patient, with uncertainty. Treat segmentation artifacts separately from pathology.
4. Bind image-derived volume/fat measurements and mesh IDs to that study. Only show pathology when supported by the measured input and appropriate interpretation.

For this round, the existing explicitly synthetic CT → mask → surface pipeline demonstrates reconstruction mechanics. Its output is a synthetic study linked by seed, not proof that these atlas organs belong to the patient. A separate labeled disease illustration could be added later, but should never silently become the patient's anatomy.

## Remaining fidelity limits

This is a stronger interactive anatomical reference, not a photoreal digital human. True skin texture/normal maps, detailed authored organ textures and calibrated subsurface scattering could improve it further. Shared skeletal/muscle layers are not fully registered to every body morph. No scan-derived organ disease, individual fat distribution, or validated anatomical forecast is asserted. Those boundaries are visible in the app and export.
