import hashlib, json, struct
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "frontend/doctor-review-ui/public/anatomy"


def test_atlas_manifest_licensed_and_complete():
    data = json.loads((ASSETS / "manifest.json").read_text())
    assert data["license"] == "CC BY 4.0"
    assert "biosciencedbc.jp" in data["license_url"]
    assert {m["id"] for m in data["meshes"]} == {
        "skin",
        "skeleton",
        "muscles",
        "vascular",
        "nervous",
        "heart",
        "brain",
        "pancreas",
        "kidneys",
        "liver",
        "lungs",
    }
    for mesh in data["meshes"]:
        assert mesh["triangles"] > 0 and mesh["vertices"] > 0
        assert (
            hashlib.sha256((ASSETS / Path(mesh["url"]).name).read_bytes()).hexdigest()
            == mesh["sha256"]
        )


def test_glb_geometry_bounds_normals_and_topology():
    data = json.loads((ASSETS / "manifest.json").read_text())
    for mesh in data["meshes"]:
        raw = (ASSETS / Path(mesh["url"]).name).read_bytes()
        magic, version, total = struct.unpack("<4sII", raw[:12])
        assert magic == b"glTF" and version == 2 and total == len(raw)
        length, kind = struct.unpack("<I4s", raw[12:20])
        assert kind == b"JSON"
        gltf = json.loads(raw[20 : 20 + length])
        offset = 20 + length
        blen, bkind = struct.unpack("<I4s", raw[offset : offset + 8])
        assert bkind == b"BIN\0"
        binary = raw[offset + 8 : offset + 8 + blen]
        positions = np.frombuffer(
            binary,
            dtype="<f4",
            count=gltf["accessors"][0]["count"] * 3,
            offset=gltf["bufferViews"][0]["byteOffset"],
        ).reshape(-1, 3)
        normals = np.frombuffer(
            binary,
            dtype="<f4",
            count=gltf["accessors"][1]["count"] * 3,
            offset=gltf["bufferViews"][1]["byteOffset"],
        ).reshape(-1, 3)
        indices = np.frombuffer(
            binary,
            dtype="<u4",
            count=gltf["accessors"][2]["count"],
            offset=gltf["bufferViews"][2]["byteOffset"],
        )
        assert np.isfinite(positions).all() and indices.max() < len(positions)
        assert np.allclose(np.linalg.norm(normals, axis=1), 1, atol=1e-4)
        assert np.allclose(positions.min(0), mesh["bounds_mm"]["min"])
        assert np.allclose(positions.max(0), mesh["bounds_mm"]["max"])


def test_body_layers_share_millimetre_coordinates_and_full_height():
    meshes = {
        m["id"]: m for m in json.loads((ASSETS / "manifest.json").read_text())["meshes"]
    }
    for key in ["skin", "muscles", "skeleton"]:
        bounds = meshes[key]["bounds_mm"]
        assert bounds["max"][2] - bounds["min"][2] > 1400
    for key in ["heart", "brain", "pancreas", "kidneys"]:
        bounds = meshes[key]["bounds_mm"]
        assert 800 < bounds["min"][2] < 1700
