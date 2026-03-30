import json
import sqlite3
import time
from pathlib import Path

import requests

BASE = "http://127.0.0.1:8000"
DB = Path(r"c:\Users\Muzammil\Desktop\ai_soc\data\ai_soc.db")


def req(method, path, **kwargs):
    t0 = time.perf_counter()
    resp = requests.request(method, BASE + path, timeout=10, **kwargs)
    dt_ms = (time.perf_counter() - t0) * 1000
    return resp, dt_ms


def main() -> None:
    out = {}

    con = sqlite3.connect(DB)
    cur = con.cursor()
    cur.execute(
        "INSERT OR IGNORE INTO soc_instances (instance_id, api_key, ingestion_mode, active) VALUES (?,?,?,?)",
        ("instance-b", "tenant-b-key", "realtime", 1),
    )
    con.commit()
    con.close()

    r, dt = req("GET", "/health")
    out["health"] = {
        "status": r.status_code,
        "latency_ms": round(dt, 2),
        "body": r.json() if r.ok else r.text,
    }

    r, dt = req("GET", "/instances")
    out["instances"] = {
        "status": r.status_code,
        "latency_ms": round(dt, 2),
        "count": len(r.json()) if r.ok else None,
    }

    headers_default = {"x-instance-id": "default", "x-api-key": "dev-default-key"}
    payload = {
        "source": "api_test",
        "events": [
            {
                "timestamp": "2026-03-28T23:40:00Z",
                "event_type": "BruteForce",
                "ip": "10.200.1.10",
                "user": "alice",
                "failed_attempts": 12,
            }
        ],
    }
    r, dt = req("POST", "/ingest", json=payload, headers=headers_default)
    out["ingest_single"] = {
        "status": r.status_code,
        "latency_ms": round(dt, 2),
        "body": r.json() if "application/json" in r.headers.get("content-type", "") else r.text,
    }

    r, dt = req("POST", "/ingest", json=payload)
    out["ingest_missing_creds"] = {"status": r.status_code, "latency_ms": round(dt, 2)}

    r, dt = req(
        "POST",
        "/ingest",
        json=payload,
        headers={"x-instance-id": "default", "x-api-key": "bad"},
    )
    out["ingest_wrong_creds"] = {"status": r.status_code, "latency_ms": round(dt, 2)}

    r, dt = req("POST", "/ingest", json={"foo": "bar"}, headers=headers_default)
    out["ingest_malformed"] = {"status": r.status_code, "latency_ms": round(dt, 2)}

    r, dt = req("POST", "/ingest", json={"events": [{"x": 1}]}, headers=headers_default)
    out["ingest_missing_fields"] = {"status": r.status_code, "latency_ms": round(dt, 2)}

    burst = {
        "source": "burst_test",
        "events": [
            {
                "event_type": "PortScan" if i % 2 == 0 else "BruteForce",
                "ip": f"10.50.0.{i % 254 + 1}",
                "user": f"u{i}",
                "seq": i,
            }
            for i in range(50)
        ],
    }
    r, dt = req("POST", "/ingest", json=burst, headers=headers_default)
    out["ingest_burst_50"] = {
        "status": r.status_code,
        "latency_ms": round(dt, 2),
        "body": r.json() if "application/json" in r.headers.get("content-type", "") else r.text,
    }

    dup = {
        "timestamp": "2026-03-28T23:41:00Z",
        "event_type": "BruteForce",
        "ip": "10.60.60.60",
        "user": "dupe",
        "event_id": "dupe-001",
    }
    r, dt = req("POST", "/ingest", json={"source": "dup_test", "events": [dup, dup]}, headers=headers_default)
    out["ingest_duplicates"] = {"status": r.status_code, "latency_ms": round(dt, 2)}

    for _ in range(20):
        time.sleep(0.2)

    ra, _ = req("GET", "/alerts", params={"instance_id": "default"})
    alerts = ra.json() if ra.ok else []
    latest = alerts[0] if alerts else None
    mitre_present = False
    if latest and latest.get("description"):
        try:
            desc = json.loads(latest["description"])
            mitre_present = isinstance(desc.get("mitre"), dict) and "technique_id" in desc.get("mitre", {})
        except Exception:
            mitre_present = False

    out["latest_alert"] = {
        "exists": bool(latest),
        "attack_type": latest.get("attack_type") if latest else None,
        "severity": latest.get("severity") if latest else None,
        "mitre_present": mitre_present,
    }

    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
