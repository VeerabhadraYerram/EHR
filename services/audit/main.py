from fastapi import FastAPI
from services.audit.store import read, verify

app = FastAPI(title="Local access audit service")


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "audit"}


@app.get("/api/v1/audit/events")
def events():
    return read()


@app.get("/api/v1/audit/verify")
def integrity():
    return verify()


# Cross-cutting OIDC authorization and local access audit.
import sys as _sys
from pathlib import Path as _Path

_security_root = next(
    (p for p in _Path(__file__).resolve().parents if (p / "ehr_security.py").exists()),
    _Path(__file__).resolve().parent,
)
_sys.path.insert(0, str(_security_root))
from ehr_security import install_security

install_security(app, "audit")
