from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.database import SessionLocal, get_db
from backend.models.db_models import Alert, Incident
from backend.services import get_instance_by_credentials, get_playbook_engine, get_realtime_stream_hub
from backend.services.ml_metrics import MLMetricsEngine


router = APIRouter(prefix="/soc", tags=["soc"])
metrics_engine = MLMetricsEngine(metrics_file=f"{settings.model_dir}/training_metrics.json")


class PlaybookCreatePayload(BaseModel):
    case_id: str
    name: str
    status: str = "pending"


class PlaybookUpdatePayload(BaseModel):
    case_id: str | None = None
    name: str | None = None
    status: str | None = None


def _status_counts(rows: list[Alert | Incident]) -> list[dict[str, Any]]:
    count = Counter(str(item.status).title() for item in rows)
    return [{"name": key, "value": value} for key, value in sorted(count.items())]


def _severity_counts(rows: list[Alert | Incident]) -> list[dict[str, Any]]:
    count = Counter(str(item.severity).title() for item in rows)
    return [{"name": key, "value": value} for key, value in sorted(count.items())]


def _close_reason_counts(incidents: list[Incident]) -> list[dict[str, Any]]:
    bucket = Counter()
    for item in incidents:
        desc = (item.description or "").lower()
        if "false positive" in desc:
            bucket["False Positive"] += 1
        elif "duplicate" in desc:
            bucket["Duplicate"] += 1
        elif "ignore" in desc:
            bucket["Ignore"] += 1
        else:
            bucket["True Positive"] += 1
    return [{"name": key, "value": value} for key, value in bucket.items()]


def _attack_type_distribution(alerts: list[Alert]) -> list[dict[str, Any]]:
    aliases = {
        "bruteforce": "IAM",
        "phishing": "Email",
        "webattack": "Proxy",
        "ddos": "NDR",
        "dos": "NDR",
        "botnet": "EDR",
        "portscan": "NDR",
        "infiltration": "Cloud",
    }
    counter = Counter()
    for alert in alerts:
        key = str(alert.attack_type or "").lower().replace(" ", "")
        mapped = aliases.get(key, "DLP")
        counter[mapped] += 1

    desired = ["EDR", "DLP", "Email", "IAM", "NDR", "Proxy", "Cloud"]
    return [{"name": name, "value": counter.get(name, 0)} for name in desired]


def _line_series(alerts: list[Alert]) -> list[dict[str, Any]]:
    grouped: defaultdict[str, int] = defaultdict(int)
    for alert in alerts:
        created = alert.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        key = created.strftime("%Y-%m-%d %H:00")
        grouped[key] += 1
    return [{"time": key, "count": grouped[key]} for key in sorted(grouped.keys())]


def _word_cloud_data(alerts: list[Alert]) -> list[dict[str, Any]]:
    words = Counter()
    for alert in alerts:
        attack = str(alert.attack_type or "").lower()
        if "brute" in attack:
            words["iam"] += 1
        if "portscan" in attack:
            words["lateral-movement"] += 1
        if "ddos" in attack or "dos" in attack:
            words["exfiltration"] += 1
        if "botnet" in attack or "infiltration" in attack:
            words["malware"] += 1
        if "mimikatz" in attack:
            words["mimikatz"] += 1
    for fallback in ["lateral-movement", "exfiltration", "mimikatz"]:
        words[fallback] += 1
    return [{"text": key, "value": value} for key, value in words.items()]


@router.get("/dashboard")
async def dashboard_data(
    db: AsyncSession = Depends(get_db),
    instance_id: str | None = Query(default=None),
) -> dict[str, Any]:
    alert_query = select(Alert)
    incident_query = select(Incident)
    if instance_id:
        alert_query = alert_query.where(Alert.instance_id == instance_id)
        incident_query = incident_query.where(Incident.instance_id == instance_id)

    alerts_result = await db.execute(alert_query.order_by(Alert.created_at.desc()).limit(1000))
    incidents_result = await db.execute(incident_query.order_by(Incident.created_at.desc()).limit(1000))

    alerts = list(alerts_result.scalars().all())
    incidents = list(incidents_result.scalars().all())

    critical_alerts = sum(1 for item in alerts if str(item.severity).lower() == "critical")
    high_alerts = sum(1 for item in alerts if str(item.severity).lower() == "high")

    return {
        "kpis": {
            "total_cases": len(incidents),
            "high_severity": high_alerts,
            "critical_alerts": critical_alerts,
        },
        "status_pie": _status_counts(incidents),
        "severity_pie": _severity_counts(alerts),
        "alert_types_bar": _attack_type_distribution(alerts),
        "alerts_over_time": _line_series(alerts),
        "word_cloud": _word_cloud_data(alerts),
        "close_reason_bar": _close_reason_counts(incidents),
    }


@router.get("/cases")
async def list_cases(
    db: AsyncSession = Depends(get_db),
    instance_id: str | None = Query(default=None),
    severity: str | None = None,
    case_type: str | None = Query(default=None, alias="type"),
    q: str | None = None,
    sort_by: str = "created_at",
    order: str = "desc",
) -> dict[str, Any]:
    incidents_query = select(Incident)
    alerts_query = select(Alert)
    if instance_id:
        incidents_query = incidents_query.where(Incident.instance_id == instance_id)
        alerts_query = alerts_query.where(Alert.instance_id == instance_id)

    incidents_result = await db.execute(incidents_query.order_by(Incident.created_at.desc()).limit(2000))
    alerts_result = await db.execute(alerts_query.order_by(Alert.created_at.desc()).limit(2000))

    incidents = list(incidents_result.scalars().all())
    alerts = {item.id: item for item in alerts_result.scalars().all()}

    rows: list[dict[str, Any]] = []
    for incident in incidents:
        linked_alert = alerts.get(incident.alert_id or -1)
        attack_type = str(linked_alert.attack_type if linked_alert else "Unknown")
        tags = []
        attack = attack_type.lower()
        if "portscan" in attack or "brute" in attack:
            tags.append("lateral-movement")
        if "ddos" in attack or "dos" in attack:
            tags.append("exfiltration")
        if "botnet" in attack or "infiltration" in attack:
            tags.append("malware")
        if "brute" in attack:
            tags.append("iam")
        if not tags:
            tags.append("iam")

        rows.append(
            {
                "id": f"CASE-{incident.id:04d}",
                "incident_id": incident.id,
                "title": incident.title,
                "type": case_type or attack_type,
                "status": incident.status,
                "severity": incident.severity,
                "tags": sorted(set(tags)),
                "assignee": "Tier-1 Analyst" if incident.id % 2 else "Tier-2 Analyst",
                "created_at": incident.created_at.isoformat(),
            }
        )

    if severity:
        rows = [r for r in rows if str(r["severity"]).lower() == severity.lower()]
    if case_type:
        rows = [r for r in rows if case_type.lower() in str(r["type"]).lower()]
    if q:
        query = q.lower()
        rows = [r for r in rows if query in str(r["id"]).lower() or query in str(r["title"]).lower()]

    reverse = order.lower() == "desc"
    if sort_by in {"id", "title", "severity", "status", "created_at", "assignee", "type"}:
        rows.sort(key=lambda row: str(row.get(sort_by, "")).lower(), reverse=reverse)

    return {"count": len(rows), "items": rows}


@router.get("/cases/{case_id}")
async def case_detail(
    case_id: int,
    db: AsyncSession = Depends(get_db),
    instance_id: str | None = Query(default=None),
) -> dict[str, Any]:
    incident_query = select(Incident).where(Incident.id == case_id)
    if instance_id:
        incident_query = incident_query.where(Incident.instance_id == instance_id)
    incident_result = await db.execute(incident_query)
    incident = incident_result.scalar_one_or_none()
    if incident is None:
        raise HTTPException(status_code=404, detail="Case not found")

    alert = None
    if incident.alert_id:
        alert_query = select(Alert).where(Alert.id == incident.alert_id)
        if instance_id:
            alert_query = alert_query.where(Alert.instance_id == instance_id)
        alert_result = await db.execute(alert_query)
        alert = alert_result.scalar_one_or_none()

    severity = str(incident.severity).lower()
    severity_score = 90 if severity == "critical" else 72 if severity == "high" else 48
    tags = ["iam", "lateral-movement"] if severity in {"high", "critical"} else ["iam"]
    now = datetime.now(timezone.utc)

    return {
        "id": f"CASE-{incident.id:04d}",
        "title": incident.title,
        "status": incident.status,
        "severity": incident.severity,
        "severity_score": severity_score,
        "ai_summary": "Correlated detections indicate suspicious credential use followed by lateral movement attempts.",
        "tags": tags,
        "overview": {
            "attack_type": alert.attack_type if alert else "Unknown",
            "source_ip": alert.source_ip if alert else None,
            "destination_ip": alert.destination_ip if alert else None,
            "confidence": alert.confidence if alert else None,
            "description": incident.description,
        },
        "alerts": [
            {
                "id": alert.id,
                "attack_type": alert.attack_type,
                "severity": alert.severity,
                "status": alert.status,
                "source_ip": alert.source_ip,
                "destination_ip": alert.destination_ip,
                "confidence": alert.confidence,
                "created_at": alert.created_at.isoformat(),
            }
        ]
        if alert
        else [],
        "timeline": [
            {"time": (now).isoformat(), "event": "Alert ingested"},
            {"time": (now).isoformat(), "event": "AI analysis generated"},
            {"time": (now).isoformat(), "event": "Playbook execution started"},
        ],
        "threat_report": {
            "executive_summary": "Potential account compromise with signs of lateral movement on monitored systems.",
            "attack_type": alert.attack_type if alert else "Unknown",
            "affected_systems": [alert.destination_ip] if alert and alert.destination_ip else ["srv-auth-01"],
            "findings": [
                "Unusual authentication pattern detected.",
                "Anomalous east-west traffic observed.",
                "High-confidence rule match from detector pipeline.",
            ],
            "recommendations": [
                "Reset impacted credentials immediately.",
                "Isolate affected hosts and acquire forensic images.",
                "Enable heightened monitoring for 72 hours.",
            ],
        },
    }


@router.get("/ml/metrics")
async def ml_metrics(
    db: AsyncSession = Depends(get_db),
    instance_id: str | None = Query(default=None),
) -> dict[str, Any]:
    alerts_query = select(Alert)
    if instance_id:
        alerts_query = alerts_query.where(Alert.instance_id == instance_id)

    alerts_result = await db.execute(alerts_query.order_by(Alert.created_at.desc()).limit(1000))
    alerts = list(alerts_result.scalars().all())
    distribution = Counter(str(item.attack_type) for item in alerts)
    return metrics_engine.summary(prediction_distribution=dict(distribution))


@router.get("/threat-report/{case_id}")
async def threat_report(case_id: int, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    detail = await case_detail(case_id=case_id, db=db)
    return detail["threat_report"]


@router.get("/playbooks")
async def playbooks() -> dict[str, Any]:
    engine = get_playbook_engine()
    tasks = engine.list_tasks()
    return {"count": len(tasks), "items": tasks}


@router.post("/playbooks")
async def create_playbook(payload: PlaybookCreatePayload) -> dict[str, Any]:
    engine = get_playbook_engine()
    try:
        task = engine.create_task(case_id=payload.case_id, name=payload.name, status=payload.status)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return task


@router.post("/playbooks/{task_id}/transition")
async def transition_playbook(task_id: str, payload: dict[str, str]) -> dict[str, Any]:
    engine = get_playbook_engine()
    next_state = payload.get("next_state", "")
    try:
        task = engine.transition(task_id=task_id, next_state=next_state)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return task


@router.patch("/playbooks/{task_id}")
async def update_playbook(task_id: str, payload: PlaybookUpdatePayload) -> dict[str, Any]:
    engine = get_playbook_engine()
    try:
        task = engine.update_task(
            task_id=task_id,
            name=payload.name,
            case_id=payload.case_id,
            status=payload.status,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return task


@router.delete("/playbooks/{task_id}")
async def delete_playbook(task_id: str) -> dict[str, Any]:
    engine = get_playbook_engine()
    try:
        result = engine.delete_task(task_id=task_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return result


@router.websocket("/ws/live")
async def live_soc_socket(websocket: WebSocket) -> None:
    instance_id = websocket.query_params.get("instance_id")
    api_key = websocket.query_params.get("api_key")
    if not instance_id or not api_key:
        await websocket.close(code=4401, reason="Missing instance credentials")
        return

    async with SessionLocal() as session:
        instance = await get_instance_by_credentials(
            db=session,
            instance_id=str(instance_id),
            api_key=str(api_key),
        )
    if instance is None:
        await websocket.close(code=4403, reason="Invalid instance credentials")
        return

    await websocket.accept()
    hub = get_realtime_stream_hub()
    subscriber = await hub.subscribe()
    try:
        await websocket.send_json(
            {
                "type": "connection",
                "status": "connected",
                "channels": ["event", "alert", "response"],
                "path": "/soc/ws/live",
                "instance_id": str(instance.instance_id),
            }
        )
        while True:
            message = await subscriber.get()
            message_instance_id = str(message.get("instance_id") or "default")
            if message_instance_id != str(instance.instance_id):
                continue
            await websocket.send_json(message)
    except WebSocketDisconnect:
        return
    finally:
        await hub.unsubscribe(subscriber)
