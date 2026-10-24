"""Reproducible synthetic CT -> threshold segmentation -> marching-cubes surface.
Not a trained clinical segmenter. Source geometry: attributed BodyParts3D atlas.
"""

from pathlib import Path
import hashlib, json, zipfile, io, csv
import numpy as np
from scipy import ndimage
from skimage.measure import marching_cubes
import trimesh
import nibabel as nib
from PIL import Image
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import CTImageStorage, ExplicitVRLittleEndian, generate_uid
from scripts.build_anatomy_assets import write_glb

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data/imaging"
ATLAS = ROOT / "frontend/doctor-review-ui/public/anatomy"


def generate_study(patient_id, progress=lambda stage: None):
    with (ROOT / "data/digital_twin/clinic/patients.csv").open() as f:
        patient = next(
            (p for p in csv.DictReader(f) if p["person_id"] == patient_id), None
        )
    if not patient:
        raise ValueError("Unknown cohort profile")
    output = OUTPUT / patient_id
    output.mkdir(parents=True, exist_ok=True)
    seed = int.from_bytes(hashlib.sha256(patient_id.encode()).digest()[:4], "little")
    rng = np.random.default_rng(seed)
    spacing = 2.0
    origin = np.array([-160.0, -250.0, 900.0])
    shape = (160, 160, 150)
    progress("Generating patient-linked synthetic CT phantom")
    grid = np.indices(shape, dtype=np.float32)
    coords = origin[:, None, None, None] + grid * spacing
    body = ((coords[0] / 145) ** 2 + ((coords[1] + 90) / 145) ** 2) < 1
    ct = np.full(shape, -950, dtype=np.float32)
    ct[body] = 35
    ct += rng.normal(0, 6, shape).astype(np.float32)
    fat = (((coords[0] / 135) ** 2 + ((coords[1] + 90) / 135) ** 2) > 0.8) & body
    ct[fat] -= 110
    spine = ((coords[0] / 15) ** 2 + ((coords[1] + 55) / 16) ** 2) < 1
    ct[spine] = 700 + rng.normal(0, 20, int(spine.sum()))
    ground = np.zeros(shape, dtype=np.uint8)
    organ_names = ["kidneys", "liver", "pancreas"]
    means = [85, 120, 160]
    transform = np.diag(rng.uniform(0.97, 1.03, 3))
    center = np.array([0.0, -120.0, 1050.0])
    shift = rng.uniform(-3, 3, 3)
    for label, name in enumerate(organ_names, 1):
        mesh = trimesh.load(ATLAS / f"{name}.glb", force="mesh", process=False)
        mesh.vertices = (mesh.vertices - center) @ transform.T + center + shift
        vox = mesh.voxelized(spacing).fill()
        xyz = vox.points
        ijk = np.round((xyz - origin) / spacing).astype(int)
        valid = ((ijk >= 0) & (ijk < np.array(shape))).all(1)
        ijk = ijk[valid]
        ground[tuple(ijk.T)] = label
    for label, mean in enumerate(means, 1):
        mask = ground == label
        ct[mask] = mean + rng.normal(0, 5, int(mask.sum()))
    ct = np.round(ct).astype(np.int16)
    # Synthetic thresholds are intentionally separable; this validates mechanics,
    # not generalization to clinical CT, MRI or pathology.
    progress("Segmenting volume with explicit phantom intensity protocol")
    segmented = np.zeros(shape, dtype=np.uint8)
    measurements = []
    meshes = []
    for label, (name, mean) in enumerate(zip(organ_names, means), 1):
        candidate = (ct >= mean - 17) & (ct <= mean + 17) & body
        components, count = ndimage.label(candidate)
        sizes = np.bincount(components.ravel())
        sizes[0] = 0
        # Paired kidneys use the two largest connected components; others use one.
        keep = np.argsort(sizes)[-(2 if name == "kidneys" else 1) :]
        keep = keep[sizes[keep] > 30]
        mask = ndimage.binary_fill_holes(np.isin(components, keep))
        segmented[mask] = label
        truth = ground == label
        dice = float(2 * (mask & truth).sum() / max(1, mask.sum() + truth.sum()))
        progress("Reconstructing " + name + " surface from segmentation voxels")
        verts, faces, _, _ = marching_cubes(
            mask.astype(np.float32), 0.5, spacing=(spacing,) * 3
        )
        verts += origin
        surface = trimesh.Trimesh(vertices=verts, faces=faces, process=False)
        trimesh.smoothing.filter_taubin(surface, lamb=0.5, nu=0.5, iterations=12)
        verts, faces = surface.vertices, surface.faces
        stats = write_glb(output / f"{name}.glb", verts, faces)
        measurements.append(
            {
                "organ": name,
                "label": label,
                "volume_ml": round(float(mask.sum() * spacing**3 / 1000), 2),
                "phantom_dice": round(dice, 4),
                "voxel_count": int(mask.sum()),
            }
        )
        meshes.append(
            {
                "id": name,
                "url": f"/api/v1/imaging/files/{patient_id}/{name}.glb",
                "sha256": hashlib.sha256(
                    (output / f"{name}.glb").read_bytes()
                ).hexdigest(),
                **stats,
            }
        )
    affine = np.diag([-spacing, -spacing, spacing, 1])
    affine[:3, 3] = [-origin[0], -origin[1], origin[2]]
    nib.save(nib.Nifti1Image(ct, affine), output / "synthetic-ct.nii.gz")
    nib.save(nib.Nifti1Image(segmented, affine), output / "segmentation.nii.gz")
    nib.save(nib.Nifti1Image(ground, affine), output / "phantom-ground-truth.nii.gz")
    progress("Exporting DICOM series and auditable reconstruction evidence")
    study_uid, series_uid = generate_uid(), generate_uid()
    colors = np.array(
        [[0, 0, 0, 0], [178, 100, 91, 135], [135, 153, 96, 135], [219, 180, 97, 170]],
        dtype=np.uint8,
    )
    for k in range(shape[2]):
        window = np.clip((ct[:, :, k].T + 120) / 360, 0, 1)
        gray = (window * 255).astype(np.uint8)
        Image.fromarray(gray).resize((512, 512)).save(
            output / f"slice-{k:03}.jpg", quality=86
        )
        overlay = colors[segmented[:, :, k].T]
        Image.fromarray(overlay).resize((512, 512), Image.Resampling.NEAREST).save(
            output / f"mask-{k:03}.png"
        )
    with zipfile.ZipFile(
        output / "synthetic-ct-dicom.zip", "w", zipfile.ZIP_DEFLATED
    ) as archive:
        for k in range(shape[2]):
            meta = FileMetaDataset()
            meta.MediaStorageSOPClassUID = CTImageStorage
            meta.MediaStorageSOPInstanceUID = generate_uid()
            meta.TransferSyntaxUID = ExplicitVRLittleEndian
            ds = FileDataset(None, {}, file_meta=meta, preamble=b"\0" * 128)
            ds.SOPClassUID = CTImageStorage
            ds.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
            ds.PatientID = patient_id
            ds.PatientName = "SYNTHETIC^" + patient_id
            ds.Modality = "CT"
            ds.StudyInstanceUID = study_uid
            ds.SeriesInstanceUID = series_uid
            ds.SeriesDescription = "SYNTHETIC PHANTOM - NOT A PATIENT SCAN"
            ds.ImageType = ["DERIVED", "SECONDARY"]
            ds.InstanceNumber = k + 1
            ds.Rows = shape[1]
            ds.Columns = shape[0]
            ds.PixelSpacing = [spacing, spacing]
            ds.SliceThickness = spacing
            ds.ImagePositionPatient = [
                float(origin[0]),
                float(origin[1]),
                float(origin[2] + k * spacing),
            ]
            ds.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
            ds.SamplesPerPixel = 1
            ds.PhotometricInterpretation = "MONOCHROME2"
            ds.BitsAllocated = 16
            ds.BitsStored = 16
            ds.HighBit = 15
            ds.PixelRepresentation = 1
            ds.RescaleIntercept = 0
            ds.RescaleSlope = 1
            ds.PixelData = ct[:, :, k].T.copy().tobytes()
            stream = io.BytesIO()
            ds.save_as(stream, enforce_file_format=True)
            archive.writestr(f"CT-{k:03}.dcm", stream.getvalue())
    files = [
        "synthetic-ct.nii.gz",
        "segmentation.nii.gz",
        "phantom-ground-truth.nii.gz",
        "synthetic-ct-dicom.zip",
    ]
    manifest = {
        "patient_id": patient_id,
        "synthetic": True,
        "modality": "CT",
        "status": "complete",
        "seed": seed,
        "volume_shape": shape,
        "spacing_mm": [spacing] * 3,
        "source_geometry": "BodyParts3D reference atlas, CC BY 4.0",
        "source_image": "Generated phantom; not acquired from a person",
        "patient_specificity": "Deterministic synthetic study linked to profile ID, with seeded geometric variation; not anatomy inferred from EHR",
        "segmentation_method": "Known-phantom intensity threshold plus connected-component filtering and hole filling; not TotalSegmentator or a clinical model",
        "surface_method": "Marching cubes on segmented 2mm voxels; 12 Taubin smoothing iterations (lambda=0.5, nu=0.5) for display; GLB export. Reported volumes are measured from unsmoothed masks.",
        "coordinate_frame": "Atlas LPS millimetres; NIfTI affine maps to RAS",
        "study_uid": study_uid,
        "series_uid": series_uid,
        "measurements": measurements,
        "meshes": meshes,
        "slices": shape[2],
        "image_url": f"/api/v1/imaging/files/{patient_id}/slice-{{index}}.jpg",
        "mask_url": f"/api/v1/imaging/files/{patient_id}/mask-{{index}}.png",
        "files": [
            {
                "name": name,
                "url": f"/api/v1/imaging/files/{patient_id}/{name}",
                "sha256": hashlib.sha256((output / name).read_bytes()).hexdigest(),
            }
            for name in files
        ],
        "validation_note": "Dice measures this synthetic phantom only. It is not clinical segmentation accuracy.",
    }
    (output / "manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf8"
    )
    progress("Complete")
    return manifest


if __name__ == "__main__":
    import sys

    print(
        json.dumps(
            generate_study(
                sys.argv[1] if len(sys.argv) > 1 else "P001",
                lambda p: print(p, flush=True),
            ),
            indent=2,
        )
    )
