"""Rebuild presentation layers from pinned, attributed Z-Anatomy mesh data.

No application code is imported from the source project. Draco geometry is
decoded before conversion; accessor-only loading would silently create zeros.
"""

from pathlib import Path
import hashlib
import json
import struct
import numpy as np
import trimesh
import DracoPy

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "frontend/doctor-review-ui/public/anatomy"
SOURCE = ROOT / "data/anatomy/source/z-anatomy"
OUT = PUBLIC / "v3"


def compress(path):
    """Ship full-resolution static geometry with locally bundled Draco decoding."""
    raw = path.read_bytes()
    length = struct.unpack("<I", raw[12:16])[0]
    doc = json.loads(raw[20 : 20 + length])
    binary = raw[28 + length :]
    views = []
    accessors = []
    blob = bytearray()

    def read(index, width):
        a = doc["accessors"][index]
        v = doc["bufferViews"][a["bufferView"]]
        dtype = {5126: "<f4", 5125: "<u4", 5123: "<u2"}[a["componentType"]]
        return (
            np.frombuffer(
                binary,
                dtype=dtype,
                count=a["count"] * width,
                offset=v.get("byteOffset", 0) + a.get("byteOffset", 0),
            )
            .reshape(-1, width)
            .copy()
        )

    for mesh in doc["meshes"]:
        for p in mesh["primitives"]:
            pos = read(p["attributes"]["POSITION"], 3)
            normal = read(p["attributes"]["NORMAL"], 3)
            faces = read(p["indices"], 1).reshape(-1, 3)
            encoded = DracoPy.encode(
                pos.astype(float),
                faces.astype(np.uint32),
                normals=normal.astype(float),
                quantization_bits=16,
                normal_quantization_bits=12,
                compression_level=7,
            )
            decoded = DracoPy.decode(encoded)
            ids = {a["attribute_type"]: a["unique_id"] for a in decoded.attributes}
            while len(blob) % 4:
                blob.append(0)
            views.append(
                {"buffer": 0, "byteOffset": len(blob), "byteLength": len(encoded)}
            )
            blob.extend(encoded)
            p["attributes"] = {}
            base = len(accessors)
            for name, kind in [("POSITION", 0), ("NORMAL", 1)]:
                p["attributes"][name] = len(accessors)
                a = {
                    "componentType": 5126,
                    "count": len(decoded.points),
                    "type": "VEC3",
                }
                if name == "POSITION":
                    a.update(
                        min=decoded.points.min(0).tolist(),
                        max=decoded.points.max(0).tolist(),
                    )
                accessors.append(a)
            p["indices"] = len(accessors)
            accessors.append(
                {"componentType": 5125, "count": decoded.faces.size, "type": "SCALAR"}
            )
            p["extensions"] = {
                "KHR_draco_mesh_compression": {
                    "bufferView": len(views) - 1,
                    "attributes": {"POSITION": ids[0], "NORMAL": ids[1]},
                }
            }
    for key in ("materials", "images", "textures", "samplers"):
        doc.pop(key, None)
    for mesh in doc["meshes"]:
        for primitive in mesh["primitives"]:
            primitive.pop("material", None)
    doc.update(
        bufferViews=views,
        accessors=accessors,
        buffers=[{"byteLength": len(blob)}],
        extensionsRequired=["KHR_draco_mesh_compression"],
        extensionsUsed=["KHR_draco_mesh_compression"],
    )
    metadata = json.dumps(doc, separators=(",", ":")).encode()
    metadata += b" " * ((-len(metadata)) % 4)
    blob += b"\0" * ((-len(blob)) % 4)
    path.write_bytes(
        struct.pack("<4sII", b"glTF", 2, 28 + len(metadata) + len(blob))
        + struct.pack("<I4s", len(metadata), b"JSON")
        + metadata
        + struct.pack("<I4s", len(blob), b"BIN\0")
        + blob
    )


def decode(path):
    raw = path.read_bytes()
    length = struct.unpack("<I", raw[12:16])[0]
    doc = json.loads(raw[20 : 20 + length])
    binary = raw[28 + length :]
    original_views = doc["bufferViews"]
    views = []
    accessors = []
    blob = bytearray()

    def add(a, kind, component):
        while len(blob) % 4:
            blob.append(0)
        views.append({"buffer": 0, "byteOffset": len(blob), "byteLength": a.nbytes})
        blob.extend(a.tobytes())
        accessors.append(
            {
                "bufferView": len(views) - 1,
                "componentType": component,
                "count": len(a),
                "type": kind,
                "min": a.min(0).reshape(-1).tolist(),
                "max": a.max(0).reshape(-1).tolist(),
            }
        )
        return len(accessors) - 1

    for mesh in doc["meshes"]:
        for p in mesh["primitives"]:
            ext = p.pop("extensions")["KHR_draco_mesh_compression"]
            v = original_views[ext["bufferView"]]
            start = v.get("byteOffset", 0)
            d = DracoPy.decode(binary[start : start + v["byteLength"]])
            attrs = {a["unique_id"]: a["data"] for a in d.attributes}
            p["attributes"] = {
                name: add(
                    np.asarray(attrs[index], dtype="<f4"),
                    "VEC3" if name in ("POSITION", "NORMAL") else "VEC2",
                    5126,
                )
                for name, index in ext["attributes"].items()
            }
            p["indices"] = add(
                np.asarray(d.faces, dtype="<u4").reshape(-1), "SCALAR", 5125
            )
    doc.pop("extensionsRequired", None)
    doc.pop("extensionsUsed", None)
    doc.update(
        bufferViews=views, accessors=accessors, buffers=[{"byteLength": len(blob)}]
    )
    metadata = json.dumps(doc, separators=(",", ":")).encode()
    metadata += b" " * ((-len(metadata)) % 4)
    blob += b"\0" * ((-len(blob)) % 4)
    converted = (
        struct.pack("<4sII", b"glTF", 2, 28 + len(metadata) + len(blob))
        + struct.pack("<I4s", len(metadata), b"JSON")
        + metadata
        + struct.pack("<I4s", len(blob), b"BIN\0")
        + blob
    )
    import io

    return trimesh.load(io.BytesIO(converted), file_type="glb", force="scene")


def world_meshes(scene):
    for node in scene.graph.nodes_geometry:
        transform, key = scene.graph[node]
        m = scene.geometry[key].copy()
        m.apply_transform(transform)
        yield node, m


def export(key, groups, source, count):
    scene = trimesh.Scene()
    for name, meshes in groups.items():
        mesh = trimesh.util.concatenate(meshes)
        mesh.remove_unreferenced_vertices()
        _ = mesh.vertex_normals
        scene.add_geometry(mesh, node_name=name, geom_name=name)
    path = OUT / f"{key}.glb"
    temporary = ROOT / f"data/anatomy/build/{key}.glb"
    temporary.parent.mkdir(exist_ok=True)
    temporary.write_bytes(scene.export(file_type="glb", include_normals=True))
    compress(temporary)
    staged = path.with_suffix(".tmp")
    staged.write_bytes(temporary.read_bytes())
    staged.replace(path)
    return {
        "url": f"/anatomy/v3/{path.name}",
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "source": source,
        "structures": count,
        "parts": list(groups),
        "bounds_mm": {"min": scene.bounds[0].tolist(), "max": scene.bounds[1].tolist()},
        "triangles": sum(len(m.faces) for m in scene.geometry.values()),
    }


def main():
    OUT.mkdir(exist_ok=True)
    manifest = json.loads((PUBLIC / "v2/manifest.json").read_text())
    labels = json.loads((SOURCE / "manifest.json").read_text())
    metadata = {x["node"]: x for x in labels["organs"]}
    sources = {}
    for system, key in [
        ("skeletal", "skeleton"),
        ("muscular", "muscles"),
        ("cardiovascular", "vascular"),
        ("nervous", "nervous"),
        ("digestive", "digestive"),
        ("respiratory", "respiratory"),
    ]:
        scene = decode(SOURCE / f"{system}_male.glb")
        meshes = [
            (name, mesh)
            for name, mesh in world_meshes(scene)
            if metadata.get(name, {}).get("system") == system
        ]
        # One uniform atlas transform. These are shared reference structures.
        for _, m in meshes:
            v = m.vertices.copy()
            m.vertices = np.column_stack(
                [v[:, 0] * 1000, -v[:, 2] * 1000 - 100, v[:, 1] * 1000 - 78]
            )
        sources[key] = meshes
        if key in ("digestive", "respiratory"):
            continue
        groups = {}
        for name, m in meshes:
            if key == "vascular":
                group = (
                    "veins"
                    if any(
                        t in name.lower() for t in ("vein", "vena", "venous", "sinus")
                    )
                    else "arteries"
                )
            elif key == "muscles":
                group = (
                    "tendons_and_fascia"
                    if any(
                        t in name.lower()
                        for t in ("tendon", "aponeuro", "fascia", "bursa")
                    )
                    else "muscle_fibres"
                )
            elif key == "nervous":
                group = (
                    "central_nervous_system"
                    if "Central nervous system"
                    in metadata.get(name, {}).get("path", [])
                    else "peripheral_nerves"
                )
            else:
                group = "cartilage" if "cartilage" in name.lower() else "bone"
            groups.setdefault(group, []).append(m)
        asset = export(
            key,
            groups,
            "Z-Anatomy / BodyParts3D; Anatria mesh conversion; CC BY-SA 4.0; shared reference anatomy",
            len(meshes),
        )
        old = next(a for a in manifest["shared_meshes"] if a["id"] == key)
        old.update(asset)
        print(key, len(meshes), flush=True)
    # MRI-derived Allen references offer an independent replacement for BP brain.
    for sex, letter in [("female", "F"), ("male", "M")]:
        src = ROOT / f"data/anatomy/source/hra/Allen_{letter}_Brain.glb"
        scene = trimesh.load(src, force="scene")
        groups = {}
        all_meshes = list(world_meshes(scene))
        for name, m in all_meshes:
            v = m.vertices.copy()
            m.vertices = np.column_stack(
                [v[:, 0] * 1000, -v[:, 2] * 1000, v[:, 1] * 1000]
            )
        bounds = np.array([m.bounds for _, m in all_meshes])
        center = (bounds[:, 0].min(0) + bounds[:, 1].max(0)) / 2
        ref = next(a for a in manifest["shared_meshes"] if a["id"] == "brain")[
            "bounds_mm"
        ]
        target = (np.array(ref["min"]) + np.array(ref["max"])) / 2
        for name, m in all_meshes:
            m.vertices += target - center
            group = (
                "cortex"
                if any(
                    t in name.lower()
                    for t in (
                        "cortex",
                        "gyrus",
                        "gyri",
                        "lobule",
                        "cuneus",
                        "precuneus",
                    )
                )
                else (
                    "cerebellum"
                    if "cerebell" in name.lower()
                    else "subcortical_and_brainstem"
                )
            )
            groups.setdefault(group, []).append(m)
        manifest["organs"].setdefault("brain", {})[sex] = export(
            f"brain-{sex}",
            groups,
            "Allen Human Brain Atlas via HRA v1.2; CC BY 4.0; reference anatomy",
            len(all_meshes),
        )
    # Alternative sources are explicit selectable references, never inferred disease.
    manifest["alternatives"] = {}
    for key, sourcekey, token in [
        ("pancreas", "digestive", "pancreas"),
        ("liver", "digestive", "liver"),
        ("lungs", "respiratory", "lobe"),
    ]:
        selected = [(n, m) for n, m in sources[sourcekey] if token in n.lower()]
        if not selected:
            continue
        ref = manifest["organs"][key]["male"]["bounds_mm"]
        target = (np.array(ref["min"]) + np.array(ref["max"])) / 2
        bounds = np.array([m.bounds for _, m in selected])
        center = (bounds[:, 0].min(0) + bounds[:, 1].max(0)) / 2
        groups = {}
        for name, m in selected:
            m.vertices += target - center
            groups[name] = [m]
        manifest["alternatives"][key] = export(
            f"{key}-zreference",
            groups,
            "Z-Anatomy / BodyParts3D; Anatria mesh conversion; CC BY-SA 4.0; shared male reference",
            len(selected),
        )
    manifest["version"] = 3
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf8")
    for name in ("NOTICE", "LICENSE"):
        (OUT / f"Z-ANATOMY-{name}.txt").write_bytes((SOURCE / name).read_bytes())
    (OUT / "ATTRIBUTION.md").write_text(
        "# Anatomy presentation v3\n\nShared skeleton, muscle, nervous and vascular assets and selectable organ alternatives: BodyParts3D / DBCLS â†’ Z-Anatomy â†’ Anatria3D mesh conversion. CC BY-SA 4.0. See Z-ANATOMY-NOTICE.txt and Z-ANATOMY-LICENSE.txt. Adaptations: Draco decoding, physical-coordinate conversion, semantic material grouping, selected organ extraction and display registration. These derivative mesh files remain CC BY-SA 4.0. Application code is separately authored.\n\nAllen brain via HRA v1.2: CC BY 4.0, https://github.com/hubmapconsortium/ccf-3d-reference-object-library . Adaptations: coordinate conversion, grouping and reference-centre registration.\n\nV2 MakeHuman bodies and HRA organs retain their original attribution: ../v2/ATTRIBUTION.md. These remain separate assets and licences. Shared layers are generic references, not sex-specific patient scans.\n",
        encoding="utf8",
    )


if __name__ == "__main__":
    main()
