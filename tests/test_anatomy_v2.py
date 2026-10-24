"""Presentation regressions: real compartments, smooth normals and distinct body morphs."""

import hashlib
import json
import struct
from pathlib import Path
import numpy as np

ASSETS = (
    Path(__file__).resolve().parents[1] / "frontend/doctor-review-ui/public/anatomy/v2"
)


def glb(asset):
    raw = (ASSETS / Path(asset["url"]).name).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == asset["sha256"]
    magic, version, total = struct.unpack("<4sII", raw[:12])
    assert (magic, version, total) == (b"glTF", 2, len(raw))
    length = struct.unpack("<I", raw[12:16])[0]
    return json.loads(raw[20 : 20 + length]), raw[28 + length :]


def values(doc, binary, index):
    acc = doc["accessors"][index]
    view = doc["bufferViews"][acc["bufferView"]]
    width = {"VEC3": 3, "SCALAR": 1}[acc["type"]]
    return np.frombuffer(
        binary,
        dtype="<f4",
        count=acc["count"] * width,
        offset=view.get("byteOffset", 0) + acc.get("byteOffset", 0),
    ).reshape(-1, width)


def test_sex_specific_bodies_and_adiposity_morphs():
    manifest = json.loads((ASSETS / "manifest.json").read_text())
    assert set(manifest["bodies"]) == {"female", "male", "neutral"}
    hashes = set()
    for asset in manifest["bodies"].values():
        doc, binary = glb(asset)
        hashes.add(asset["sha256"])
        primitive = doc["meshes"][0]["primitives"][0]
        base = values(doc, binary, primitive["attributes"]["POSITION"])
        assert len(primitive["targets"]) == 5
        assert np.isfinite(base).all()
        heavy = base + values(doc, binary, primitive["targets"][1]["POSITION"])
        torso = (base[:, 2] > 900) & (base[:, 2] < 1150) & (np.abs(base[:, 0]) < 180)
        assert np.ptp(heavy[torso, 0]) > np.ptp(base[torso, 0]) * 1.1
        assert heavy[torso, 1].min() < base[torso, 1].min() - 15
        # Fixed reference stature; increasing BMI must not stretch the head/feet.
        assert np.isclose(np.ptp(heavy[:, 2]), np.ptp(base[:, 2]), atol=2)
    assert len(hashes) == 3


def test_all_organs_have_both_sexes_multiple_compartments_and_smooth_normals():
    manifest = json.loads((ASSETS / "manifest.json").read_text())
    for organ, variants in manifest["organs"].items():
        assert set(variants) == {"female", "male"}
        assert variants["female"]["sha256"] != variants["male"]["sha256"]
        for asset in variants.values():
            doc, binary = glb(asset)
            assert len(doc["meshes"]) > 1, organ
            for mesh in doc["meshes"]:
                for primitive in mesh["primitives"]:
                    attrs = primitive["attributes"]
                    assert "NORMAL" in attrs
                    normal = values(doc, binary, attrs["NORMAL"])
                    assert np.isfinite(normal).all()
                    assert np.mean(np.linalg.norm(normal, axis=1) > 0.9) > 0.98
            parts = " ".join(asset["parts"]).lower()
            if organ == "lungs":
                assert "bronchopulmonary" in parts
            if organ == "pancreas":
                assert "duct" in parts
            if organ == "kidneys":
                assert "medulla" in parts or "pyramid" in parts
