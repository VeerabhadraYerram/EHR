"""Local synthetic imaging jobs; no clinical scans or AI segmentation claimed."""

import sys, uuid, threading, json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from scripts.generate_synthetic_scan import generate_study

OUTPUT = ROOT / "data/imaging"
OUTPUT.mkdir(parents=True, exist_ok=True)
app = FastAPI(title="Synthetic imaging reconstruction demonstration")
app.mount("/api/v1/imaging/files", StaticFiles(directory=OUTPUT), name="imaging-files")
JOBS = {}
LOCK = threading.Lock()
POOL = ThreadPoolExecutor(max_workers=1)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "synthetic-imaging",
        "clinical_segmentation": False,
    }


@app.get("/api/v1/imaging/studies/{patient_id}")
def study(patient_id: str):
    if not patient_id.startswith("P") or not patient_id[1:].isdigit():
        raise HTTPException(422, "Invalid profile ID")
    file = OUTPUT / patient_id / "manifest.json"
    if not file.exists():
        raise HTTPException(404, "No synthetic study generated for this profile")
    return json.loads(file.read_text())


@app.post("/api/v1/imaging/studies/{patient_id}/reconstruct")
def reconstruct(patient_id: str):
    if (
        not patient_id.startswith("P")
        or not patient_id[1:].isdigit()
        or not 1 <= int(patient_id[1:]) <= 100
    ):
        raise HTTPException(422, "Unknown profile")
    with LOCK:
        pending = next(
            (
                j
                for j in JOBS.values()
                if j["patient_id"] == patient_id
                and j["status"] in ["queued", "running"]
            ),
            None,
        )
        if pending:
            return pending
        job = {
            "id": str(uuid.uuid4()),
            "patient_id": patient_id,
            "status": "queued",
            "stage": "Queued",
        }
        JOBS[job["id"]] = job

    def run():
        job["status"] = "running"
        try:
            result = generate_study(patient_id, lambda stage: job.update(stage=stage))
            job.update(status="complete", study=result)
        except Exception as e:
            job.update(status="failed", error=str(e), stage="Failed")

    POOL.submit(run)
    return job


@app.get("/api/v1/imaging/jobs/{job_id}")
def job(job_id: str):
    if job_id not in JOBS:
        raise HTTPException(404, "Job not found")
    from ehr_security import assigned

    if not assigned(JOBS[job_id]["patient_id"]):
        raise HTTPException(403, "Study is not assigned to this identity")
    return JOBS[job_id]


# Cross-cutting OIDC authorization and local access audit.
import sys as _sys
from pathlib import Path as _Path

_security_root = next(
    (p for p in _Path(__file__).resolve().parents if (p / "ehr_security.py").exists()),
    _Path(__file__).resolve().parent,
)
_sys.path.insert(0, str(_security_root))
from ehr_security import install_security

install_security(app, "imaging")
