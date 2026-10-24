"""Full-resolution references must remain real, decoded, attributed geometry."""

import hashlib, json, struct
from pathlib import Path
import DracoPy
import numpy as np

ASSETS = (
    Path(__file__).resolve().parents[1] / "frontend/doctor-review-ui/public/anatomy"
)


def test_atlas_integrity_and_complete_systems():
    manifest = json.loads((ASSETS / "v3/manifest.json").read_text())
    shared = {a["id"]: a for a in manifest["shared_meshes"]}
    assert shared["nervous"]["structures"] == 525
    assert shared["muscles"]["structures"] == 1110
    assert shared["vascular"]["structures"] == 640
    assert shared["skeleton"]["structures"] == 335
    assert {"arteries", "veins"} == set(shared["vascular"]["parts"])
    assert (
        shared["nervous"]["bounds_mm"]["max"][2]
        - shared["nervous"]["bounds_mm"]["min"][2]
        > 1500
    )
    assets = (
        list(shared.values())
        + list(manifest["bodies"].values())
        + list(manifest["alternatives"].values())
    )
    for variants in manifest["organs"].values():
        assets.extend(variants.values())
    for asset in assets:
        path = ASSETS.parent / asset["url"].lstrip("/")
        assert path.exists()
        assert hashlib.sha256(path.read_bytes()).hexdigest() == asset["sha256"], asset[
            "url"
        ]


def test_draco_positions_are_not_empty_accessor_placeholders():
    for name in ("nervous", "vascular", "brain-female", "brain-male"):
        raw = (ASSETS / f"v3/{name}.glb").read_bytes()
        n = struct.unpack("<I", raw[12:16])[0]
        doc = json.loads(raw[20 : 20 + n])
        binary = raw[28 + n :]
        assert not any(k in doc for k in ("images", "textures", "materials"))
        assert "KHR_draco_mesh_compression" in doc["extensionsRequired"]
        for mesh in doc["meshes"]:
            for primitive in mesh["primitives"]:
                ext = primitive["extensions"]["KHR_draco_mesh_compression"]
                view = doc["bufferViews"][ext["bufferView"]]
                start = view.get("byteOffset", 0)
                decoded = DracoPy.decode(binary[start : start + view["byteLength"]])
                assert np.isfinite(decoded.points).all()
                assert np.ptp(decoded.points, axis=0).max() > 20
                assert len(decoded.faces) > 100
                assert decoded.faces.max() < len(decoded.points)
                normals = next(
                    a["data"]
                    for a in decoded.attributes
                    if a["unique_id"] == ext["attributes"]["NORMAL"]
                )
                assert np.mean(np.linalg.norm(normals, axis=1) > 0.9) > 0.95


def test_reference_joint_registration_preserves_limb_lengths():
    manifest = json.loads((ASSETS / "v3/manifest.json").read_text())
    for body in manifest["bodies"].values():
        joints = body["landmarks"]
        for side, sign in [("l", 1), ("r", -1)]:
            for name, target in [
                ("hand", [283, -116, 779]),
                ("knee", [72, -70, 356]),
                ("ankle", [53, -64, 1]),
            ]:
                assert (
                    np.linalg.norm(
                        np.array(joints[f"joint-{side}-{name}"])
                        - np.array(target) * [sign, 1, 1]
                    )
                    < 2
                )
