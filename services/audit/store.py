"""Local development audit sink. A hash chain detects changes; it is not WORM storage."""

import hashlib
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DB = Path(
    os.environ.get(
        "AUDIT_DB", Path(__file__).resolve().parents[2] / "data/audit/access.sqlite3"
    )
)


def connect():
    DB.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute(
        "CREATE TABLE IF NOT EXISTS access_events (id INTEGER PRIMARY KEY, timestamp TEXT, payload TEXT, previous_hash TEXT, hash TEXT)"
    )
    return db


def append(payload):
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        last = db.execute(
            "SELECT hash FROM access_events ORDER BY id DESC LIMIT 1"
        ).fetchone()
        previous = last[0] if last else "0" * 64
        timestamp = datetime.now(timezone.utc).isoformat()
        serialized = json.dumps(payload, sort_keys=True)
        digest = hashlib.sha256(
            (previous + timestamp + serialized).encode()
        ).hexdigest()
        db.execute(
            "INSERT INTO access_events(timestamp,payload,previous_hash,hash) VALUES(?,?,?,?)",
            (timestamp, serialized, previous, digest),
        )


def read(limit=200):
    with connect() as db:
        rows = db.execute(
            "SELECT * FROM access_events ORDER BY id DESC LIMIT ?", (min(limit, 1000),)
        ).fetchall()
    return [{**dict(r), "payload": json.loads(r["payload"])} for r in rows]


def verify():
    with connect() as db:
        rows = db.execute("SELECT * FROM access_events ORDER BY id").fetchall()
    previous = "0" * 64
    for r in rows:
        digest = hashlib.sha256(
            (previous + r["timestamp"] + r["payload"]).encode()
        ).hexdigest()
        if r["previous_hash"] != previous or r["hash"] != digest:
            return {"valid": False, "first_invalid_id": r["id"]}
        previous = digest
    return {
        "valid": True,
        "events": len(rows),
        "head": previous,
        "limitation": "Local tamper-evident chain, not immutable off-host storage",
    }
