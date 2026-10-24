"""Keycloak/OIDC cross-cutting controls with an explicit synthetic-only demo mode."""

import asyncio
import contextvars
import json
import os
import re
import uuid
from functools import lru_cache
import jwt
from starlette.responses import JSONResponse
from services.audit import store

identity = contextvars.ContextVar("ehr_identity", default=None)


def mode():
    return os.environ.get("EHR_AUTH_MODE", "demo")


@lru_cache(maxsize=4)
def key_client(issuer):
    return jwt.PyJWKClient(
        os.environ.get("OIDC_JWKS_URL")
        or issuer.rstrip("/") + "/protocol/openid-connect/certs",
        timeout=5,
    )


def verify_token(token):
    issuer = os.environ.get("OIDC_ISSUER", "")
    audience = os.environ.get("OIDC_AUDIENCE", "")
    if not issuer or not audience:
        raise ValueError("OIDC issuer and audience must be configured")
    key = key_client(issuer).get_signing_key_from_jwt(token).key
    claims = jwt.decode(
        token,
        key,
        algorithms=["RS256"],
        issuer=issuer,
        audience=audience,
        options={"require": ["exp", "iat", "iss", "aud", "sub"]},
    )
    roles = set(claims.get("realm_access", {}).get("roles", []))
    patients = claims.get("patient_ids", [])
    if not isinstance(patients, list):
        patients = []
    return {
        "actor": claims["sub"],
        "roles": roles,
        "patients": set(str(p) for p in patients),
    }


def assigned(patient_id):
    user = identity.get()
    return mode() == "demo" or bool(
        user
        and (
            "administrator" in user["roles"]
            or "*" in user["patients"]
            or str(patient_id) in user["patients"]
        )
    )


def actor(default="demo-reader"):
    user = identity.get()
    return user["actor"] if user else default


def install_security(app, service):
    @app.middleware("http")
    async def access(request, call_next):
        if request.url.path == "/health":
            response = await call_next(request)
            response.headers["X-EHR-Auth-Mode"] = mode()
            return response
        correlation = str(uuid.uuid4())
        user = None
        response = None
        token_context = None
        path = request.url.path
        try:
            if mode() == "oidc":
                try:
                    authorization = request.headers.get("authorization", "")
                    if not authorization.startswith("Bearer "):
                        raise ValueError("Missing bearer token")
                    user = await asyncio.to_thread(verify_token, authorization[7:])
                except Exception:
                    response = JSONResponse(
                        {"detail": "A valid, unexpired OIDC access token is required"},
                        401,
                        headers={"WWW-Authenticate": "Bearer"},
                    )
                if response is None:
                    roles = user["roles"]
                    read = request.method in ("GET", "HEAD", "OPTIONS")
                    allowed = bool(roles & {"clinician", "reviewer", "administrator"})
                    if "researcher" in roles and path.endswith("/metrics") and read:
                        allowed = True
                    if not read and (
                        "/fhir/approve" in path
                        or "/delivery" in path
                        or "/finalize" in path
                    ):
                        allowed = bool(roles & {"reviewer", "administrator"})
                    if "/audit" in path:
                        allowed = bool(roles & {"reviewer", "administrator"})
                    # Scoped record paths, including static imaging files.
                    patient_ids = set(re.findall(r"(?<![A-Za-z0-9])P\d{3}(?!\d)", path))
                    if not read and "application/json" in request.headers.get(
                        "content-type", ""
                    ):
                        try:
                            payload = await request.json()
                            for key in ("patient_id", "person_id", "patient_ref"):
                                if isinstance(payload, dict) and payload.get(key):
                                    patient_ids.add(str(payload[key]))
                            if isinstance(payload, dict) and payload.get("finalize"):
                                allowed = allowed and bool(
                                    roles & {"reviewer", "administrator"}
                                )
                        except (ValueError, TypeError):
                            pass
                    if (
                        path in ("/api/v1/twin/predict", "/api/v1/twin/simulate")
                        and not patient_ids
                        and "*" not in user["patients"]
                        and "administrator" not in roles
                    ):
                        allowed = False
                    if any(
                        p not in user["patients"]
                        and "*" not in user["patients"]
                        and "administrator" not in roles
                        for p in patient_ids
                    ):
                        allowed = False
                    # Legacy UUID queues lack per-record assignment enforcement.
                    if (
                        any(
                            part in path
                            for part in (
                                "/identity/",
                                "/fusion/",
                                "/ingest/",
                                "/documents",
                                "/seed/",
                            )
                        )
                        and "*" not in user["patients"]
                        and "administrator" not in roles
                    ):
                        allowed = False
                    if (
                        path.startswith("/api/v1/patients")
                        and "*" not in user["patients"]
                        and "administrator" not in roles
                    ):
                        allowed = False
                    if (
                        "/cohort/" in path
                        and "*" not in user["patients"]
                        and "administrator" not in roles
                    ):
                        allowed = False
                    if not allowed:
                        response = JSONResponse(
                            {"detail": "Role or assigned-patient access denied"}, 403
                        )
            elif mode() != "demo":
                response = JSONResponse(
                    {"detail": "Invalid server authentication mode"}, 503
                )
            token_context = identity.set(user)
            if response is None:
                response = await call_next(request)
        except Exception:
            await asyncio.to_thread(
                store.append,
                {
                    "service": service,
                    "actor": user["actor"] if user else "anonymous",
                    "action": request.method,
                    "resource": path,
                    "status": 500,
                    "request_id": correlation,
                },
            )
            raise
        finally:
            if token_context is not None:
                identity.reset(token_context)
        await asyncio.to_thread(
            store.append,
            {
                "service": service,
                "actor": (
                    user["actor"]
                    if user
                    else "synthetic-demo" if mode() == "demo" else "anonymous"
                ),
                "roles": sorted(user["roles"]) if user else [],
                "action": request.method,
                "resource": path,
                "status": response.status_code,
                "request_id": correlation,
                "mode": mode(),
            },
        )
        response.headers["X-Request-ID"] = correlation
        response.headers["X-EHR-Auth-Mode"] = mode()
        return response
