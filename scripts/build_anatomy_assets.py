"""Build attributed GLB atlas layers from the official BodyParts3D OBJ archive.
Run after downloading the three source files under data/anatomy/source.
Geometry coordinates are preserved in millimetres; frontend performs one shared transform.
"""

from pathlib import Path
import csv, hashlib, json, struct, zipfile
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/anatomy/source"
OUT = ROOT / "frontend/doctor-review-ui/public/anatomy"


def write_glb(path, vertices, faces):
    vertices = np.asarray(vertices, dtype="<f4")
    faces = np.asarray(faces, dtype="<u4").reshape(-1, 3)
    if len(faces) > 250000:
        # Bounded vertex clustering for browser rendering; original sources remain intact.
        pitch = 2.0 if np.ptp(vertices, axis=0).max() > 1000 else 0.7
        keys = np.round(vertices / pitch).astype(np.int32)
        _, inverse = np.unique(keys, axis=0, return_inverse=True)
        count = np.bincount(inverse)
        vertices = np.column_stack(
            [
                np.bincount(inverse, weights=vertices[:, axis]) / count
                for axis in range(3)
            ]
        ).astype("<f4")
        faces = inverse[faces].astype("<u4")
    fn0 = np.cross(
        vertices[faces[:, 1]] - vertices[faces[:, 0]],
        vertices[faces[:, 2]] - vertices[faces[:, 0]],
    )
    faces = faces[np.linalg.norm(fn0, axis=1) > 1e-8]
    used, inverse = np.unique(faces.reshape(-1), return_inverse=True)
    vertices = vertices[used]
    faces = inverse.reshape(-1, 3).astype("<u4")
    normals = np.zeros_like(vertices)
    fn = np.cross(
        vertices[faces[:, 1]] - vertices[faces[:, 0]],
        vertices[faces[:, 2]] - vertices[faces[:, 0]],
    )
    for i in range(3):
        np.add.at(normals, faces[:, i], fn)
    norms = np.linalg.norm(normals, axis=1)
    normals /= np.maximum(norms[:, None], 1e-12)
    normals[norms < 1e-12] = [0, 0, 1]
    chunks = [vertices.tobytes(), normals.astype("<f4").tobytes(), faces.tobytes()]
    offsets = [0, len(chunks[0]), len(chunks[0]) + len(chunks[1])]
    binary = b"".join(chunks)
    binary += b"\0" * ((-len(binary)) % 4)
    doc = {
        "asset": {
            "version": "2.0",
            "generator": "EHR attributed BodyParts3D conversion",
        },
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
        "meshes": [
            {"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1}, "indices": 2}]}
        ],
        "buffers": [{"byteLength": len(binary)}],
        "bufferViews": [
            {
                "buffer": 0,
                "byteOffset": offsets[i],
                "byteLength": len(c),
                "target": 34963 if i == 2 else 34962,
            }
            for i, c in enumerate(chunks)
        ],
        "accessors": [
            {
                "bufferView": 0,
                "componentType": 5126,
                "count": len(vertices),
                "type": "VEC3",
                "min": vertices.min(0).tolist(),
                "max": vertices.max(0).tolist(),
            },
            {
                "bufferView": 1,
                "componentType": 5126,
                "count": len(vertices),
                "type": "VEC3",
            },
            {
                "bufferView": 2,
                "componentType": 5125,
                "count": faces.size,
                "type": "SCALAR",
            },
        ],
    }
    metadata = json.dumps(doc, separators=(",", ":")).encode()
    metadata += b" " * ((-len(metadata)) % 4)
    path.write_bytes(
        struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(metadata) + 8 + len(binary))
        + struct.pack("<I4s", len(metadata), b"JSON")
        + metadata
        + struct.pack("<I4s", len(binary), b"BIN\0")
        + binary
    )
    return {
        "vertices": len(vertices),
        "triangles": len(faces),
        "bounds_mm": {"min": vertices.min(0).tolist(), "max": vertices.max(0).tolist()},
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    concepts = {}
    with (SOURCE / "partof_element_parts.txt").open(encoding="utf8") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            concepts.setdefault(row["concept id"], set()).add(row["element file id"])

    def ids(*names):
        return set().union(*(concepts.get(name, set()) for name in names))

    isa_concepts = {}
    with (SOURCE / "isa_element_parts.txt").open(encoding="utf8") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            isa_concepts.setdefault(row["concept id"], set()).add(
                row["element file id"]
            )
    specs = [
        ("skin", "Body surface", "surface", ids("FMA7163"), "#c9a489"),
        (
            "skeleton",
            "Skeleton",
            "skeleton",
            isa_concepts.get("FMA5018", set()),
            "#e8ddc3",
        ),
        (
            "muscles",
            "Muscles & connective tissue",
            "muscles",
            isa_concepts.get("FMA5022", set()),
            "#a65450",
        ),
        (
            "vascular",
            "Cardiovascular network",
            "vascular",
            ids("FMA7161") - ids("FMA7088"),
            "#a84e55",
        ),
        (
            "nervous",
            "Peripheral nervous system",
            "nervous",
            isa_concepts.get("FMA5913", set()) | isa_concepts.get("FMA65132", set()),
            "#d4b76c",
        ),
        ("heart", "Heart", "organs", ids("FMA7088"), "#b85c61"),
        ("brain", "Brain", "organs", ids("FMA50801"), "#c6ad94"),
        ("pancreas", "Pancreas", "organs", ids("FMA7198"), "#dcb27a"),
        ("kidneys", "Kidneys", "organs", ids("FMA7204", "FMA7205"), "#a36663"),
        ("liver", "Liver", "organs", ids("FMA7197"), "#925451"),
        ("lungs", "Lungs", "organs", ids("FMA7309", "FMA7310"), "#bfafa3"),
    ]
    manifest = {
        "version": 1,
        "coordinate_system": "BodyParts3D original millimetres; Z superior",
        "source": "BodyParts3D, Database Center for Life Science (DBCLS)",
        "source_url": "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html",
        "license": "CC BY 4.0",
        "license_url": "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html",
        "geometry_kind": "reference atlas, not patient scans",
        "conversion": "GLB with smooth normals; meshes over 250k faces use 2mm whole-body or 0.7mm organ vertex clustering",
        "archive_sha256": hashlib.sha256(
            (SOURCE / "partof_BP3D_4.0_obj_99.zip").read_bytes()
        ).hexdigest(),
        "muscle_archive_sha256": hashlib.sha256(
            (SOURCE / "muscles-selected.zip").read_bytes()
        ).hexdigest(),
        "meshes": [],
    }
    with zipfile.ZipFile(
        SOURCE / "partof_BP3D_4.0_obj_99.zip"
    ) as part_zip, zipfile.ZipFile(SOURCE / "muscles-selected.zip") as isa_zip:
        z = part_zip
        lookup = {Path(n).stem: n for n in z.namelist() if n.endswith(".obj")}
        for key, label, layer, elements, color in specs:
            z = isa_zip if key in ["muscles", "skeleton", "nervous"] else part_zip
            lookup = {Path(n).stem: n for n in z.namelist() if n.endswith(".obj")}
            vertices = []
            faces = []
            used = []
            for element in sorted(elements):
                if element not in lookup:
                    continue
                offset = len(vertices)
                for raw in z.read(lookup[element]).decode().splitlines():
                    parts = raw.split()
                    if not parts:
                        continue
                    if parts[0] == "v":
                        vertices.append([float(v) for v in parts[1:4]])
                    elif parts[0] == "f":
                        indices = [int(p.split("/")[0]) - 1 + offset for p in parts[1:]]
                        for i in range(1, len(indices) - 1):
                            faces.append([indices[0], indices[i], indices[i + 1]])
                used.append(element)
            if not faces:
                raise ValueError(f"No geometry for {key}")
            path = OUT / f"{key}.glb"
            stats = write_glb(path, vertices, faces)
            manifest["meshes"].append(
                {
                    "id": key,
                    "label": label,
                    "layer": layer,
                    "url": f"/anatomy/{key}.glb",
                    "color": color,
                    "elements": used,
                    "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                    **stats,
                }
            )
            print(
                key,
                stats["triangles"],
                round(path.stat().st_size / 1e6, 2),
                "MB",
                flush=True,
            )
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf8")
    (OUT / "ATTRIBUTION.md").write_text(
        "# BodyParts3D atlas assets\n\nBodyParts3D, Database Center for Life Science (DBCLS). Licensed under CC BY 4.0.\nhttps://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html\n\nConverted from the official PART-OF and ISA OBJ archives into GLB, grouped by organ/system, and vertex normals recalculated. Original coordinate frame retained; high-density surfaces simplified by documented vertex clustering. Patient clinical states do not turn these reference meshes into scan-derived anatomy.\n",
        encoding="utf8",
    )


if __name__ == "__main__":
    main()
