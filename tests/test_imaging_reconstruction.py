"""Verify the generated demonstration, including voxel/mesh coordinate agreement."""

import hashlib
import io
import json
import zipfile
from pathlib import Path
import nibabel as nib
import numpy as np
import pydicom
import pytest
import trimesh

STUDY = Path(__file__).resolve().parents[1] / "data/imaging/P001"


@pytest.fixture(scope="module")
def manifest():
    if not (STUDY / "manifest.json").exists():
        from scripts.generate_synthetic_scan import generate_study

        generate_study("P001")
    return json.loads((STUDY / "manifest.json").read_text())


def test_volume_measurements_and_geometry(manifest):
    assert manifest["synthetic"] is True
    ct = nib.load(STUDY / "synthetic-ct.nii.gz")
    seg = nib.load(STUDY / "segmentation.nii.gz")
    assert ct.shape == seg.shape == (160, 160, 150)
    assert tuple(ct.header.get_zooms()) == (2, 2, 2)
    labels = np.asanyarray(seg.dataobj)
    for item in manifest["measurements"]:
        assert item["volume_ml"] == round(
            float((labels == item["label"]).sum()) * 0.008, 2
        )
        assert 0.95 < item["phantom_dice"] <= 1
    for item in manifest["meshes"]:
        path = STUDY / (item["id"] + ".glb")
        assert hashlib.sha256(path.read_bytes()).hexdigest() == item["sha256"]
        mesh = trimesh.load(path, force="mesh")
        assert mesh.bounds[0, 2] > 900 and mesh.bounds[1, 2] < 1200
        assert len(mesh.faces) > 100


def test_dicom_pixels_match_nifti(manifest):
    archive = next(STUDY.glob("*.zip"))
    with zipfile.ZipFile(archive) as z:
        names = sorted(z.namelist())
        assert len(names) == 150
        ds = pydicom.dcmread(io.BytesIO(z.read(names[0])))
        assert ds.PatientID == "P001"
        assert tuple(float(v) for v in ds.PixelSpacing) == (2, 2)
        assert float(ds.SliceThickness) == 2
        assert np.array_equal(
            ds.pixel_array,
            np.asanyarray(nib.load(STUDY / "synthetic-ct.nii.gz").dataobj)[:, :, 0].T,
        )
