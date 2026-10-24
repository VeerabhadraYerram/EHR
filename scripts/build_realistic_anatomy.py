"""Build a versioned presentation atlas without overwriting scan pipeline assets.

MakeHuman CC0 body morphs; HRA CC BY 4.0 sex-specific organ compartments.
No patient pathology or organ fat is inferred by this asset conversion.
"""

from pathlib import Path
import hashlib
import json
import struct
import numpy as np
import trimesh

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/anatomy/source"
PUBLIC = ROOT / "frontend/doctor-review-ui/public/anatomy"
OUT = PUBLIC / "v2"


def normals(v, f):
    n = np.zeros_like(v)
    fn = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
    for j in range(3):
        np.add.at(n, f[:, j], fn)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)


def body_asset(sex):
    rows = (SOURCE / "makehuman/base.obj").read_text().splitlines()
    vertices = []
    faces = []
    group = ""
    joints = {}
    joint_indices = {}
    for row in rows:
        parts = row.split()
        if not parts:
            continue
        if parts[0] == "v":
            vertices.append([float(x) for x in parts[1:4]])
        elif parts[0] == "g":
            group = parts[1]
        elif parts[0] == "f":
            idx = [int(x.split("/")[0]) - 1 for x in parts[1:]]
            if group == "body":
                for i in range(1, len(idx) - 1):
                    faces.append([idx[0], idx[i], idx[i + 1]])
            elif group.startswith("joint-"):
                joint_indices.setdefault(group, set()).update(idx)
    base = np.asarray(vertices, dtype=np.float64)
    faces = np.asarray(faces, dtype=np.uint32)
    used, inverse = np.unique(faces, return_inverse=True)
    faces = inverse.reshape(-1, 3)

    def delta(name):
        result = np.zeros_like(base)
        for row in (SOURCE / "makehuman" / name).read_text().splitlines():
            if not row or row.startswith("#"):
                continue
            i, *xyz = row.split()
            result[int(i)] = [float(v) for v in xyz]
        return result

    def shape(age, weight):
        sexes = [sex] if sex != "neutral" else ["female", "male"]
        result = base.copy()
        for s in sexes:
            for ancestry in ("african", "asian", "caucasian"):
                result += delta(f"{ancestry}-{s}-{age}.target") / (3 * len(sexes))
            result += delta(
                f"universal-{s}-{age}-averagemuscle-{weight}weight.target"
            ) / len(sexes)
        # Native MH decimetres / Y-up -> atlas millimetres / Z-up.
        # Keep stature fixed: no height was measured in this cohort.
        v = result[used]
        height = v[:, 1].max() - v[:, 1].min()
        scale = 1719 / height
        transformed = np.column_stack(
            [
                result[:, 0] * scale,
                -result[:, 2] * scale - 90,
                (result[:, 1] - v[:, 1].min()) * scale - 78,
            ]
        )
        # Gently lower A-pose arms toward the shared atlas stance. This is a
        # presentation registration, not a personalized skeletal reconstruction.
        for side, key in ((1, "joint-l-shoulder"), (-1, "joint-r-shoulder")):
            if key not in joint_indices:
                continue
            shoulder = transformed[list(joint_indices[key])].mean(0)
            side = np.sign(shoulder[0])
            x = transformed[:, 0] * side
            arm_threshold = (
                abs(shoulder[0])
                - 25
                + np.maximum(0, shoulder[2] - transformed[:, 2]) * 0.22
            )
            w = np.clip((x - arm_threshold) / 65, 0, 1) * np.clip(
                (shoulder[2] + 50 - transformed[:, 2]) / 100, 0, 1
            )
            angle = -side * np.deg2rad(12) * w
            dx = transformed[:, 0] - shoulder[0]
            dz = transformed[:, 2] - shoulder[2]
            transformed[:, 0] = shoulder[0] + np.cos(angle) * dx - np.sin(angle) * dz
            transformed[:, 2] = shoulder[2] + np.sin(angle) * dx + np.cos(angle) * dz
        if weight == "max":
            # A bounded display adiposity envelope makes the high-BMI endpoint
            # visibly distinct. This is an authored appearance prior, not VAT,
            # body-fat percentage or a measured patient waist circumference.
            torso = np.exp(-(((transformed[:, 2] - 1010) / 210) ** 4)) * np.clip(
                (260 - np.abs(transformed[:, 0])) / 90, 0, 1
            )
            transformed[:, 0] *= 1 + 0.18 * torso
            transformed[:, 1] -= np.maximum(0, -90 - transformed[:, 1]) * 0.65 * torso
            hips = np.exp(-(((transformed[:, 2] - 790) / 140) ** 2)) * np.clip(
                (290 - np.abs(transformed[:, 0])) / 80, 0, 1
            )
            transformed[:, 0] *= 1 + 0.07 * hips
        # Piecewise bone-frame registration preserves limb cross-sections.
        # A global RBF cage was rejected: it compressed calves and forearms.
        original = transformed.copy()
        targets = {
            "shoulder": [174, -75, 1323],
            "elbow": [225, -71, 1014],
            "hand": [283, -116, 779],
            "upper-leg": [83, -95, 799],
            "knee": [72, -70, 356],
            "ankle": [53, -64, 1],
        }

        def segment_map(points, a, b, c, d):
            u = (b - a) / np.linalg.norm(b - a)
            v = (d - c) / np.linalg.norm(d - c)
            cross = np.cross(u, v)
            dot = float(np.dot(u, v))
            k = np.array(
                [
                    [0, -cross[2], cross[1]],
                    [cross[2], 0, -cross[0]],
                    [-cross[1], cross[0], 0],
                ]
            )
            rotation = np.eye(3) + k + k @ k / max(1e-8, 1 + dot)
            relative = points - a
            along = relative @ u
            mapped = (
                relative @ rotation.T
                + np.outer(
                    along * (np.linalg.norm(d - c) / np.linalg.norm(b - a) - 1), v
                )
                + c
            )
            nearest = a + np.outer(np.clip(along, 0, np.linalg.norm(b - a)), u)
            return mapped, np.linalg.norm(points - nearest, axis=1)

        for side, sign in (("l", 1), ("r", -1)):
            joint = {
                key: original[list(joint_indices[f"joint-{side}-{key}"])].mean(0)
                for key in targets
            }
            dest = {
                key: np.asarray(value) * [sign, 1, 1] for key, value in targets.items()
            }
            for chain, kind in [
                (["shoulder", "elbow", "hand"], "arm"),
                (["upper-leg", "knee", "ankle"], "leg"),
            ]:
                mapped = []
                weights = []
                for a, b in zip(chain, chain[1:]):
                    q, distance = segment_map(
                        original, joint[a], joint[b], dest[a], dest[b]
                    )
                    mapped.append(q)
                    weights.append(1 / (distance + 15) ** 4)
                weights = np.asarray(weights)
                weights /= weights.sum(0)
                result = np.sum(np.asarray(mapped) * weights[:, :, None], axis=0)
                if kind == "arm":
                    shoulder = joint["shoulder"]
                    threshold = (
                        abs(shoulder[0])
                        - 35
                        + np.maximum(0, shoulder[2] - original[:, 2]) * 0.22
                    )
                    blend = np.clip(
                        (abs(original[:, 0]) - threshold) / 65, 0, 1
                    ) * np.clip((shoulder[2] + 65 - original[:, 2]) / 110, 0, 1)
                else:
                    blend = np.clip(
                        (joint["upper-leg"][2] + 30 - original[:, 2]) / 150, 0, 1
                    )
                    blend *= (
                        np.abs(original[:, 0])
                        < max(abs(joint[key][0]) for key in chain) + 100
                    )
                blend *= original[:, 0] * sign > 0
                transformed += blend[:, None] * (result - original)
        joints[f"{age}_{weight}"] = {
            name: transformed[list(indices)].mean(0).tolist()
            for name, indices in joint_indices.items()
        }
        return transformed[used].astype("<f4")

    shapes = {
        f"{age}_{weight}": shape(age, weight)
        for age in ("young", "old")
        for weight in ("average", "min", "max")
    }
    v = shapes["young_average"]
    n = normals(v, faces).astype("<f4")
    arrays = []
    views = []
    accessors = []
    blob = bytearray()

    def add(a, kind, component=5126, bounds=False):
        while len(blob) % 4:
            blob.append(0)
        offset = len(blob)
        blob.extend(a.tobytes())
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": a.nbytes})
        access = {
            "bufferView": len(views) - 1,
            "componentType": component,
            "count": len(a),
            "type": kind,
        }
        if bounds:
            access.update(min=a.min(0).tolist(), max=a.max(0).tolist())
        accessors.append(access)
        return len(accessors) - 1

    positions = add(v, "VEC3", bounds=True)
    normal = add(n, "VEC3")
    indices = add(faces.reshape(-1).astype("<u4"), "SCALAR", 5125)
    names = ["young_min", "young_max", "old_average", "old_min", "old_max"]
    targets = []
    for name in names:
        target = shapes[name]
        targets.append(
            {
                "POSITION": add((target - v).astype("<f4"), "VEC3", bounds=True),
                "NORMAL": add((normals(target, faces) - n).astype("<f4"), "VEC3"),
            }
        )
    doc = {
        "asset": {
            "version": "2.0",
            "generator": "EHR MakeHuman CC0 phenotype export v1",
        },
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": f"{sex}_phenotype_body"}],
        "meshes": [
            {
                "name": "habitus_body",
                "weights": [0] * 5,
                "extras": {"targetNames": names},
                "primitives": [
                    {
                        "attributes": {"POSITION": positions, "NORMAL": normal},
                        "indices": indices,
                        "targets": targets,
                    }
                ],
            }
        ],
        "buffers": [{"byteLength": len(blob)}],
        "bufferViews": views,
        "accessors": accessors,
    }
    encoded = json.dumps(doc, separators=(",", ":")).encode()
    encoded += b" " * ((-len(encoded)) % 4)
    blob += b"\0" * ((-len(blob)) % 4)
    path = OUT / f"body-{sex}.glb"
    path.write_bytes(
        struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(encoded) + 8 + len(blob))
        + struct.pack("<I4s", len(encoded), b"JSON")
        + encoded
        + struct.pack("<I4s", len(blob), b"BIN\0")
        + blob
    )
    return {
        "url": f"/anatomy/v2/{path.name}",
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "vertices": len(v),
        "triangles": len(faces),
        "bounds_mm": {"min": v.min(0).tolist(), "max": v.max(0).tolist()},
        "targets": names,
        "landmarks": joints["young_average"],
        "source": "MakeHuman core body and macro targets, neutral equal ancestry blend; CC0",
        "registration": "Piecewise bone-frame display alignment to shared reference landmarks; not measured patient skeletal anatomy",
        "morphology": "Estimated appearance from recorded sex, age and BMI, with a bounded authored adiposity envelope; fixed reference stature; not a scan or body-fat measurement",
    }


def organ_asset(key, sex, reference):
    letter = "F" if sex == "female" else "M"
    files = {
        "heart": ["Heart", "Blood_Vasculature_Heart"],
        "kidneys": ["Kidney_L", "Kidney_R", "Blood_Vasculature_Kidney"],
        "liver": ["Liver", "Blood_Vasculature_Liver", "Ducts_of_Liver"],
        "lungs": ["Lung"],
        "pancreas": ["Pancreas", "Ducts_of_Pancreas"],
    }[key]
    source = []
    primary = []
    for name in files:
        filename = f"VH_{letter}_{name}.glb"
        scene = trimesh.load(SOURCE / "hra" / filename, force="scene")
        for node in scene.graph.nodes_geometry:
            matrix, geometry = scene.graph[node]
            mesh = scene.geometry[geometry].copy()
            mesh.apply_transform(matrix)
            # HRA Y-up metres -> shared atlas Z-up millimetres.
            xyz = mesh.vertices.copy()
            mesh.vertices = np.column_stack(
                [xyz[:, 0] * 1000, -xyz[:, 2] * 1000, xyz[:, 1] * 1000]
            )
            source.append((str(node), mesh))
            if "Blood_Vasculature" not in name and "Ducts" not in name:
                primary.append(mesh.bounds)
    bounds = np.array(primary)
    center = (bounds[:, 0].min(0) + bounds[:, 1].max(0)) / 2
    target = (
        np.array(reference["bounds_mm"]["min"])
        + np.array(reference["bounds_mm"]["max"])
    ) / 2
    output = trimesh.Scene()
    for name, mesh in source:
        # The heart vasculature object includes the descending aorta. Keep the
        # local vessels only so an isolated heart is not framed as a full aorta.
        auxiliary = any(
            token in name.lower()
            for token in ("arter", "vein", "aorta", "cava", "duct")
        )
        if key in ("heart", "pancreas") and auxiliary:
            lo = bounds[:, 0].min(0) - (np.array([35, 35, 35]) if key=="heart" else 12)
            hi = bounds[:, 1].max(0) + (np.array([35, 35, 65]) if key=="heart" else 12)
            keep = ((mesh.triangles_center >= lo) & (mesh.triangles_center <= hi)).all(
                1
            )
            mesh.update_faces(keep)
            mesh.remove_unreferenced_vertices()
            if len(mesh.faces) == 0:
                continue
        mesh.vertices += target - center
        if key == "pancreas" and not "duct" in name.lower():
            # Illustrative lobular relief, never pathology or a measured feature.
            from scipy.spatial import cKDTree

            mesh = mesh.subdivide().subdivide()
            trimesh.smoothing.filter_taubin(mesh, lamb=0.5, nu=0.5, iterations=4)
            rng = np.random.default_rng(2431)
            low = target + np.array([-140, -100, -90])
            high = target + np.array([140, 100, 90])
            grid = np.stack(
                np.meshgrid(
                    *[np.arange(a, b, 5.5) for a, b in zip(low, high)], indexing="ij"
                ),
                axis=-1,
            ).reshape(-1, 3)
            grid += rng.uniform(-1.8, 1.8, grid.shape)
            distance = cKDTree(grid).query(mesh.vertices)[0]
            relief = 1.15 * np.exp(-((distance / 2.8) ** 2)) - 0.18
            mesh.vertices += mesh.vertex_normals * relief[:, None]
        # Export real smooth normals; otherwise GLTFLoader falls back to facets.
        _ = mesh.vertex_normals
        # Keep every named compartment, instead of taking the last mesh only.
        output.add_geometry(mesh, node_name=name, geom_name=name)
    path = OUT / f"{key}-{sex}.glb"
    path.write_bytes(output.export(file_type="glb", include_normals=True))
    return {
        "url": f"/anatomy/v2/{path.name}",
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "parts": [name for name, _ in source],
        "triangles": sum(len(m.faces) for m in output.geometry.values()),
        "bounds_mm": {
            "min": output.bounds[0].tolist(),
            "max": output.bounds[1].tolist(),
        },
        "source": f"Human Reference Atlas / HuBMAP Visible Human {sex.title()} v1.2 (male liver/pancreatic auxiliary ducts v1.1); CC BY 4.0",
        "source_files": [f"VH_{letter}_{name}.glb" for name in files],
        "display_detail": "Smooth normals; pancreas subdivided with deterministic illustrative sub-millimetre lobular relief; local heart vessels cropped for framing",
        "registration": "Uniform metres-to-mm conversion and reference bounding-centre alignment; not patient imaging registration",
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    atlas = json.loads((PUBLIC / "manifest.json").read_text())
    result = {
        "version": 2,
        "source_notes": "Reference anatomy with phenotype-conditioned body appearance. No pathology shape inferred from blood tests.",
        "bodies": {},
        "organs": {},
        "shared_meshes": atlas["meshes"],
        "sources": {
            "body": "https://github.com/makehumancommunity/makehuman",
            "body_license": "https://www.makehumancommunity.org/about/license.html",
            "organs": "https://github.com/hubmapconsortium/ccf-3d-reference-object-library",
            "organ_license": "https://creativecommons.org/licenses/by/4.0/",
        },
    }
    for sex in ("male", "female", "neutral"):
        result["bodies"][sex] = body_asset(sex)
        print("body", sex, flush=True)
    for key in ("heart", "pancreas", "kidneys", "liver", "lungs"):
        reference = next(m for m in atlas["meshes"] if m["id"] == key)
        result["organs"][key] = {}
        for sex in ("male", "female"):
            result["organs"][key][sex] = organ_asset(key, sex, reference)
            print(key, sex, flush=True)
    (OUT / "manifest.json").write_text(json.dumps(result, indent=2), encoding="utf8")
    (OUT / "ATTRIBUTION.md").write_text(
        "# Anatomy presentation v2\n\nBody: MakeHuman core base and macro targets, CC0; equal ancestry blend, reference stature, piecewise bone-frame presentation pose alignment and authored high-weight abdominal/hip adiposity envelope (not measured body composition), male/female/neutral and age/weight morph export. https://www.makehumancommunity.org/about/license.html\n\nOrgans: Human Reference Atlas / HuBMAP CCF 3D Reference Object Library, Visible Human male/female v1.2, with male pancreatic and liver ducts from v1.1. CC BY 4.0. Contributors include Kristen Browne and the HRA organ illustration team. https://github.com/hubmapconsortium/ccf-3d-reference-object-library . Adaptations: coordinates converted to millimetres, reference-centre registration, combined named compartments/vessels, smooth normals, local heart vessel cropping, illustrative pancreas subdivision/smoothing and deterministic relief of up to approximately 1 mm, and procedural presentation materials. Reference anatomy is not patient imaging.\n\nShared skeleton, muscles, nerves and brain: BodyParts3D / DBCLS, CC BY 4.0; ../ATTRIBUTION.md. These remain shared reference structures, not sex-specific patient measurements.\n",
        encoding="utf8",
    )


if __name__ == "__main__":
    main()
