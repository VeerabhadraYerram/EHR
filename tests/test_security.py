import time
from types import SimpleNamespace
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI
from fastapi.testclient import TestClient
import ehr_security as security
from services.audit import store


@pytest.fixture
def secure(tmp_path, monkeypatch):
    monkeypatch.setenv("EHR_AUTH_MODE", "oidc")
    monkeypatch.setattr(store, "DB", tmp_path / "audit.sqlite3")
    app = FastAPI()

    @app.get("/api/v1/workflows/patients/{patient_id}")
    def read(patient_id: str):
        return {"actor": security.actor(), "patient_id": patient_id}

    @app.post("/api/v1/workflows/patients/{patient_id}/fhir/approve")
    def approve(patient_id: str):
        return {"ok": True}

    security.install_security(app, "test")
    return TestClient(app)


def test_missing_token_fail_closed(secure):
    assert secure.get("/api/v1/workflows/patients/P001").status_code == 401
    assert store.read()[0]["payload"]["status"] == 401


def test_assignment_role_and_actor_enforced(secure, monkeypatch):
    user = {"actor": "verified-sub", "roles": {"clinician"}, "patients": {"P001"}}
    monkeypatch.setattr(security, "verify_token", lambda token: user)
    headers = {"Authorization": "Bearer test"}
    assert (
        secure.get("/api/v1/workflows/patients/P001", headers=headers).json()["actor"]
        == "verified-sub"
    )
    assert (
        secure.get("/api/v1/workflows/patients/P002", headers=headers).status_code
        == 403
    )
    assert (
        secure.post(
            "/api/v1/workflows/patients/P001/fhir/approve", headers=headers
        ).status_code
        == 403
    )
    user["roles"] = {"reviewer"}
    assert (
        secure.post(
            "/api/v1/workflows/patients/P001/fhir/approve", headers=headers
        ).status_code
        == 200
    )
    assert store.verify()["valid"]


def test_real_signature_issuer_audience_expiry(monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    monkeypatch.setenv("OIDC_ISSUER", "https://issuer.example/realms/ehr")
    monkeypatch.setenv("OIDC_AUDIENCE", "ehr-api")
    monkeypatch.setattr(
        security,
        "key_client",
        lambda issuer: SimpleNamespace(
            get_signing_key_from_jwt=lambda token: SimpleNamespace(key=key.public_key())
        ),
    )
    claims = {
        "sub": "doctor-1",
        "iss": "https://issuer.example/realms/ehr",
        "aud": "ehr-api",
        "iat": int(time.time()),
        "exp": int(time.time()) + 60,
        "realm_access": {"roles": ["clinician"]},
        "patient_ids": ["P001"],
    }
    assert security.verify_token(jwt.encode(claims, key, algorithm="RS256"))[
        "patients"
    ] == {"P001"}
    for change in ({"exp": int(time.time()) - 1}, {"aud": "wrong"}, {"iss": "wrong"}):
        with pytest.raises(jwt.InvalidTokenError):
            security.verify_token(
                jwt.encode({**claims, **change}, key, algorithm="RS256")
            )
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    with pytest.raises(jwt.InvalidTokenError):
        security.verify_token(jwt.encode(claims, other, algorithm="RS256"))


def test_audit_detects_changes(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DB", tmp_path / "audit.sqlite3")
    store.append({"action": "read"})
    store.append({"action": "review"})
    assert store.verify()["valid"]
    with store.connect() as db:
        db.execute("UPDATE access_events SET payload='{}' WHERE id=1")
    assert not store.verify()["valid"]
