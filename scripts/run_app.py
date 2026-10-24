"""Run the local EHR demo with explicit service ownership and HTTP readiness."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
import urllib.request

ROOT_DIR = Path(__file__).resolve().parents[1]
NPM_BIN = shutil.which("npm.cmd") or shutil.which("npm") or "npm"


def service(name, directory, module, port):
    return {"name": name, "cwd": ROOT_DIR / directory, "port": port,
            "url": f"http://127.0.0.1:{port}/health",
            "cmd": [sys.executable, "-m", "uvicorn", module, "--host", "127.0.0.1", "--port", str(port)]}


SERVICES = [
    service("Ingestion", "services/ingestion", "main:app", 8000),
    service("Identity resolution", "services/identity-resolution", "main:app", 8002),
    service("Clinical fusion", "services/clinical-processing/fusion", "main:app", 8003),
    service("Digital twin", "services/digital-twin", "main:app", 8004),
    service("Local clinical workflows", ".", "services.workflows.main:app", 8005),
    service("Synthetic imaging", ".", "services.imaging.main:app", 8006),
    service("Genomics", ".", "services.genomics.main:app", 8007),
    service("Access audit", ".", "services.audit.main:app", 8008),
    {"name": "Doctor review frontend", "cwd": ROOT_DIR / "frontend/doctor-review-ui", "port": 5188,
     "url": "http://127.0.0.1:5188/", "cmd": [NPM_BIN, "run", "dev", "--", "--host", "127.0.0.1", "--port", "5188", "--strictPort"]},
]


def probe(item):
    try:
        with urllib.request.urlopen(item["url"], timeout=2) as response:
            body = response.read()
            if response.status != 200:
                return False, f"HTTP {response.status}"
            if item["port"] == 5188:
                return b"<html" in body.lower(), "frontend HTML received"
            status = json.loads(body).get("status")
            expected_auth = os.environ.get("EHR_AUTH_MODE", "demo")
            actual_auth = response.headers.get("X-EHR-Auth-Mode", "demo")
            if actual_auth != expected_auth:
                return False, f"Authentication mode mismatch: expected {expected_auth}, running {actual_auth}; restart this service"
            return status in {"ok", "healthy"}, f"health status={status}"
    except Exception as exc:
        return False, str(exc)


def listening(port):
    with socket.socket() as connection:
        connection.settimeout(0.25)
        return connection.connect_ex(("127.0.0.1", port)) == 0


def compose_command():
    if shutil.which("docker"):
        result = subprocess.run(["docker", "compose", "version"], capture_output=True)
        if result.returncode == 0:
            return ["docker", "compose"]
    if shutil.which("docker-compose"):
        return ["docker-compose"]
    raise RuntimeError("Docker Compose unavailable; manage dependencies separately and use --skip-infra.")


def stop_owned(processes):
    for name, process in processes:
        if process.poll() is None:
            print(f"Stopping {name} (started by this runner)...")
            process.terminate()
    for _, process in processes:
        try:
            process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-infra", action="store_true", help="Use separately managed PostgreSQL/MinIO")
    parser.add_argument("--twin-mode", choices=["local", "docker"], default="local")
    parser.add_argument("--check", action="store_true", help="Read-only HTTP check of existing services")
    parser.add_argument("--timeout", type=float, default=90, help="Service startup deadline in seconds")
    args = parser.parse_args(argv)
    if args.check:
        checks = [(item, *probe(item)) for item in SERVICES]
        for item, ready, detail in checks:
            print(f"{'READY' if ready else 'UNAVAILABLE'} {item['name']}: {item['url']} ({detail})")
        print("HTTP readiness does not prove external integrations or clinical validation.")
        return 0 if all(ready for _, ready, _ in checks) else 1

    processes = []
    try:
        if not args.skip_infra:
            targets = ["ehr-postgres", "ehr-minio", "minio-init"]
            if args.twin_mode == "docker":
                if listening(8004):
                    raise RuntimeError("Port 8004 occupied; stop its owner before selecting Docker twin mode.")
                targets.append("digital-twin")
            options = ["up", "-d"] + (["--build"] if args.twin_mode == "docker" else [])
            subprocess.run(compose_command() + options + targets, cwd=ROOT_DIR, check=True)
        for item in SERVICES:
            if args.twin_mode == "docker" and item["port"] == 8004:
                print("Digital twin is managed by Docker (or separately with --skip-infra).")
                continue
            ready, _ = probe(item)
            if ready:
                print(f"Reusing ready {item['name']} on port {item['port']}.")
                continue
            if listening(item["port"]):
                raise RuntimeError(f"Port {item['port']} occupied but {item['name']} unhealthy; inspect its owner.")
            print(f"Starting {item['name']} on port {item['port']}...")
            env = os.environ.copy()
            env["PYTHONUNBUFFERED"] = "1"
            processes.append((item["name"], subprocess.Popen(item["cmd"], cwd=item["cwd"], env=env)))
        pending = list(SERVICES)
        deadline = time.monotonic() + max(1, args.timeout)
        while pending and time.monotonic() < deadline:
            for name, process in processes:
                if process.poll() is not None:
                    raise RuntimeError(f"{name} exited during startup (code {process.returncode}).")
            for item in pending[:]:
                ready, detail = probe(item)
                if ready:
                    print(f"READY {item['name']}: {item['url']} ({detail})")
                    pending.remove(item)
            if pending:
                time.sleep(0.5)
        if pending:
            raise RuntimeError("Readiness timed out: " + ", ".join(item["name"] for item in pending))
        print("\nAll configured HTTP checks passed. UI: http://localhost:5188")
        print("Workflows: http://localhost:8005/docs | Twin: http://localhost:8004/docs")
        print("Availability checks do not establish external integration or clinical acceptance.")
        print("Ctrl+C stops processes started here; Docker and reused services remain running.")
        while True:
            for name, process in processes:
                if process.poll() is not None:
                    raise RuntimeError(f"{name} exited (code {process.returncode}).")
            time.sleep(1)
    except KeyboardInterrupt:
        return 0
    except (OSError, RuntimeError, subprocess.SubprocessError) as exc:
        print(f"Startup failed: {exc}", file=sys.stderr)
        return 1
    finally:
        stop_owned(processes)


if __name__ == "__main__":
    raise SystemExit(main())

