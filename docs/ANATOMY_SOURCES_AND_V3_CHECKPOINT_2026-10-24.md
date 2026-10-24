# Anatomy source evaluation and v3 checkpoint — 24 October 2026

## Source findings

The requested [Anatomy 3D Atlas](https://anatomy3datlas.com/models/) is a useful visual reference. Its publisher identifies Catfish Animation Studio and reserves rights; its public pages do not provide a reusable mesh download licence. We have not extracted its viewer assets or represented its illustrations as our 3D geometry. See [publisher terms](https://anatomy3datlas.com/terms/) and [licensing contact](https://anatomy3datlas.com/contact/).

The [Z-Anatomy original collection](https://github.com/Z-Anatomy/Models-of-human-anatomy) offers a coherent, much fuller anatomy reference. Its public licence and attribution list derivative sources, including some separately restricted structures. We retain HRA kidneys and do not import Z-Anatomy's separately credited kidney model. The [Anatria mesh distribution](https://github.com/Nurkan1/Anatria-3D/tree/main/public/anatomy) provides a practical glTF conversion. Its mesh licence is separate from its application licence; only mesh data and required attribution were reused. No application code was copied.

## Local model changes

* The shared reference layers now contain 335 skeletal structures, 1,110 muscle structures, 640 cardiovascular structures and 525 nervous-system structures. Metadata filters select only each system's structures: the raw nervous export also contained muscle context meshes, which must not be shown as nerves.
* Arteries and veins retain separate geometry/material groups and use red/blue presentation colours. Muscles and tendon/fascial structures also have separate display groups. The connective/fascia overlay is optional and off by default so it does not obscure the muscle surfaces. The nervous layer now includes the spinal cord and peripheral network rather than only a small cranial object.
* The brain is replaced by the independent Allen/HRA reference with 283 source compartments per reference. Viewing defaults include a superior/oblique angle to reveal cortical folds. Materials are softer pink tissue rather than bone-like ivory.
* Pancreas, lung and liver views have selectable Z-Anatomy and sex-matched HRA references. Z alternatives are explicitly shared male references; they are not presented as the selected patient's measured organ or a female-specific organ.
* Geometry is Draco-decoded before conversion and recompressed for delivery. Reading compressed glTF accessors without decoding can silently produce zero-coordinate placeholder geometry. Tests check decoded positions, normals and topology. The browser decoder is bundled locally.
* Optional layers load when requested. Semantic groups reduce draw calls while retaining full-resolution geometry. The original scan-pipeline atlas and legacy 2D presentation remain intact.

## Body registration and BMI comparison

MakeHuman bodies are registered to the common atlas pose with piecewise bone-frame transformations. Limb cross-sections are preserved. A global RBF approach was rejected during visual QA because it compressed forearms and calves. Shared references still do not establish patient bone or muscle geometry. Combined layers are additionally clipped to the estimated body silhouette, avoiding visibly protruding reference fingers/feet; standalone layers remain inspectable without that clipping.

The BMI checkbox now draws a mint reference outline at BMI 22 over the patient's existing body. It does not replace the patient with a BMI-22 body. Sex and age are held constant for the comparison; height is a fixed reference because stature was not recorded. This remains a display estimate, not measured fat distribution or a body-composition model.

## Textured references available online

These publisher-hosted interactive embeds are optional; the local viewer remains usable without them. Each was checked for a displayed CC Attribution licence. Model appearance is an educational reference, never measured patient pathology. Patient identifiers, labs and forecasts are not inserted into embed URLs, and the iframe sends no referrer.

| Organ | Publisher reference | Credit |
|---|---|---|
| Lungs | [Realistic Human Lungs](https://sketchfab.com/3d-models/realistic-human-lungs-ce09f4099a68467880f46e61eb9a3531) | neshallads, CC BY 4.0 |
| Kidneys | [Human Kidney](https://sketchfab.com/3d-models/human-kidney-e1476ceb1e3b4412af5418eee9c5ed08) | neshallads, CC BY 4.0 |
| Pancreas | [Human Pancreas Cross section](https://sketchfab.com/3d-models/human-pancreas-cross-section-f7b30e11b5df445fbdfe0e262e777c85) | arloopa, CC BY 4.0 |
| Brain | [Human brain, Cerebrum & Brainstem](https://sketchfab.com/3d-models/human-brain-cerebrum-brainstem-0aa0e33c5c854d1bab7bac9e1c7acaec) | FrankJohansson, CC BY 4.0 |
| Liver | [Liver](https://sketchfab.com/3d-models/liver-0da595a298b14fa4bc8f98b1a0e24fed) | 9darsh2235, CC BY 4.0 |

These are live external embeds, not downloaded or self-hosted texture packs. Downloading originals through the publishers' official flow and integrating their UV/PBR maps would be a further asset-import step. No account sign-in or publisher contact was performed. The online appearance cannot respond to our local cutaway/morph controls; those controls are hidden or disabled in that mode.

## Patient data on organs

Body-view markers open the pancreas and kidney data. Organ cards separate Recorded, Predicted and Anatomy tabs. Pancreas context uses recorded glucose, HbA1c and C-peptide; kidney context uses eGFR and creatinine; heart context uses available lipids without calling them cardiac-function measurements. Missing organ-specific measurements remain unavailable. Profile lab timestamps are not fabricated; sensor-replay values include their recording timestamp. Prediction cards require the same patient and decision time and use the existing shared glucose forecast rather than generating a second inference. Reference geometry and viewing cuts remain distinct from clinical findings.

## Rebuild and licences

1. Install `scripts/requirements-anatomy.txt` into the development Python environment.
2. Run `python scripts/fetch_realistic_anatomy.py` for pinned SHA-256-verified source inputs.
3. Run `python scripts/build_realistic_anatomy.py`, then `python scripts/build_anatomy_v3.py`.
4. Run the anatomy/imaging tests and frontend checks. Start the normal application stack and inspect `/anatomy`.

Source revisions and original hashes are recorded in `public/anatomy/v3/source-lock.json`. The v3 asset directory includes upstream NOTICE and licence files and adaptation notes. Z-derived mesh files remain CC BY-SA 4.0; HRA assets retain CC BY 4.0 and MakeHuman assets retain CC0 in separate files. Generic shared layers remain explicitly generic; acquired scan reconstruction and validated organ-disease forecasts are not claimed.

Validation: ten Python anatomy/imaging tests and six TypeScript phenotype/evidence tests passed. Production build and lint passed; the renderer remains a large lazy chunk, with the existing size advisory. Browser checks include body-envelope clipping, complete nerves, red/blue vessels, muscle visibility, female BMI comparison, the local Allen brain, and the shared P043 glucose forecast (110.8 mg/dL peak) versus recorded glucose (102.6 mg/dL). Screenshots are saved under docs/evidence/.
