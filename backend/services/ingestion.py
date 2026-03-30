from __future__ import annotations

import asyncio
import importlib
import json
from datetime import datetime, timezone
from typing import Any

from backend.config import settings


aioredis = None


def _normalize_timestamp(value: Any) -> str:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return datetime.now(timezone.utc).isoformat()


def _pick_first(payload: dict[str, Any], keys: list[str], default: str) -> str:
    for key in keys:
        value = payload.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return default


def normalize_event(
    raw_event: dict[str, Any],
    source: str = "api",
    instance_id: str = "default",
) -> dict[str, Any]:
    timestamp = _normalize_timestamp(
        raw_event.get("timestamp") or raw_event.get("time") or raw_event.get("event_time")
    )
    event_type = _pick_first(raw_event, ["event_type", "attack_type", "type", "event"], "unknown")
    ip = _pick_first(raw_event, ["ip", "source_ip", "src_ip", "client_ip"], "unknown")
    user = _pick_first(raw_event, ["user", "username", "account", "principal"], "unknown")

    metadata = dict(raw_event)
    for key in [
        "timestamp",
        "time",
        "event_time",
        "source",
        "instance_id",
        "event_type",
        "attack_type",
        "type",
        "event",
        "ip",
        "source_ip",
        "src_ip",
        "client_ip",
        "user",
        "username",
        "account",
        "principal",
    ]:
        metadata.pop(key, None)

    return {
        "timestamp": timestamp,
        "instance_id": str(instance_id or raw_event.get("instance_id") or "default"),
        "source": str(source or raw_event.get("source") or "api"),
        "event_type": event_type,
        "ip": ip,
        "user": user,
        "metadata": metadata,
    }


async def ingest_event(
    raw_event: dict[str, Any],
    source: str = "api",
    instance_id: str = "default",
) -> dict[str, Any]:
    return await enqueue_event(raw_event=raw_event, source=source, instance_id=instance_id)


async def ingest_events(
    raw_events: list[dict[str, Any]],
    source: str = "api",
    instance_id: str = "default",
) -> list[dict[str, Any]]:
    enqueued: list[dict[str, Any]] = []
    for raw_event in raw_events:
        enqueued.append(await enqueue_event(raw_event=raw_event, source=source, instance_id=instance_id))
    return enqueued


async def _get_redis() -> Any:
    global aioredis
    if aioredis is None:
        try:
            aioredis = importlib.import_module("redis.asyncio")
        except ModuleNotFoundError:
            return None

    if aioredis is None:
        return None

    try:
        client = aioredis.Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            db=settings.redis_db,
            password=settings.redis_password or None,
            decode_responses=True,
            socket_connect_timeout=0.2,
            socket_timeout=0.2,
        )
        await asyncio.wait_for(client.ping(), timeout=0.2)
        return client
    except Exception:
        return None


async def enqueue_event(
    raw_event: dict[str, Any],
    source: str = "api",
    instance_id: str = "default",
) -> dict[str, Any]:
    redis_client = await _get_redis()
    payload = {
        "instance_id": instance_id,
        "source": source,
        "raw_event": raw_event,
    }

    if redis_client is None:
        from backend.services.ingest_worker import get_ingestion_worker

        await get_ingestion_worker().process_envelope(payload)
        return {
            "status": "processed",
            "queue_backend": "memory",
            "instance_id": instance_id,
            "source": source,
        }

    message = json.dumps(payload)
    await asyncio.wait_for(redis_client.lpush(settings.ingest_queue_key, message), timeout=0.2)

    return {
        "status": "queued",
        "queue_backend": "redis",
        "instance_id": instance_id,
        "source": source,
    }


async def enqueue_events(
    raw_events: list[dict[str, Any]],
    source: str = "api",
    instance_id: str = "default",
) -> int:
    if not raw_events:
        return 0

    redis_client = await _get_redis()
    if redis_client is None:
        from backend.services.ingest_worker import get_ingestion_worker

        worker = get_ingestion_worker()
        for item in raw_events:
            envelope = {"instance_id": instance_id, "source": source, "raw_event": item}
            await worker.process_envelope(envelope)
        return len(raw_events)

    messages = [
        json.dumps({"instance_id": instance_id, "source": source, "raw_event": item})
        for item in raw_events
    ]
    await asyncio.wait_for(redis_client.lpush(settings.ingest_queue_key, *messages), timeout=0.2)
    return len(messages)