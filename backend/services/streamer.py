from __future__ import annotations

import asyncio
import importlib
import json
import random
from collections import deque
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

aioredis = None

from backend.config import settings


class InMemoryEventQueue:
    def __init__(self, maxlen: int = 500) -> None:
        self._queue: deque[dict[str, Any]] = deque(maxlen=maxlen)

    def push(self, event: dict[str, Any]) -> None:
        self._queue.append(event)

    def recent(self, limit: int = 50) -> list[dict[str, Any]]:
        items = list(self._queue)
        return items[-limit:][::-1]


class EventStreamer:
    def __init__(self, redis_key: str = "soc:events", memory_maxlen: int = 500) -> None:
        self.redis_key = redis_key
        self.redis_total_key = f"{redis_key}:total"
        self.memory_queue = InMemoryEventQueue(maxlen=memory_maxlen)
        self._redis: Any = None
        self._generator_task: asyncio.Task[Any] | None = None
        self._published_events_total = 0

    async def _get_redis(self) -> Any:
        global aioredis
        if aioredis is None:
            try:
                aioredis = importlib.import_module("redis.asyncio")
            except ModuleNotFoundError:
                return None

        if aioredis is None:
            return None

        if self._redis is not None:
            return self._redis

        try:
            self._redis = aioredis.Redis(
                host=settings.redis_host,
                port=settings.redis_port,
                db=settings.redis_db,
                password=settings.redis_password or None,
                decode_responses=True,
                socket_connect_timeout=0.5,
                socket_timeout=0.5,
            )
            await asyncio.wait_for(self._redis.ping(), timeout=0.5)
            return self._redis
        except Exception:
            self._redis = None
            return None

    @staticmethod
    def _simulate_event() -> dict[str, Any]:
        attack_types = [
            "BENIGN",
            "DDoS",
            "DoS",
            "BruteForce",
            "WebAttack",
            "Botnet",
            "PortScan",
            "Infiltration",
        ]
        severity_map = {
            "BENIGN": "low",
            "PortScan": random.choice(["low", "medium"]),
            "BruteForce": random.choice(["medium", "high"]),
            "WebAttack": random.choice(["medium", "high"]),
            "DoS": random.choice(["high", "critical"]),
            "DDoS": random.choice(["high", "critical"]),
            "Botnet": random.choice(["high", "critical"]),
            "Infiltration": random.choice(["high", "critical"]),
        }

        attack = random.choice(attack_types)
        severity = severity_map.get(attack, "low")
        confidence = 0.98 if severity == "critical" else round(random.uniform(0.55, 0.96), 4)

        return {
            "event_id": str(uuid4()),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source_ip": f"10.0.{random.randint(0, 255)}.{random.randint(1, 254)}",
            "destination_ip": f"172.16.{random.randint(0, 255)}.{random.randint(1, 254)}",
            "attack_type": attack,
            "severity": severity,
            "confidence": confidence,
            "message": f"Simulated {attack} event",
        }

    async def publish_event(self, event: dict[str, Any]) -> dict[str, Any]:
        self.memory_queue.push(event)
        self._published_events_total += 1

        redis_client = await self._get_redis()
        if redis_client is not None:
            try:
                payload = json.dumps(event)
                await asyncio.wait_for(redis_client.lpush(self.redis_key, payload), timeout=0.5)
                await asyncio.wait_for(redis_client.ltrim(self.redis_key, 0, 499), timeout=0.5)
                await asyncio.wait_for(redis_client.incr(self.redis_total_key), timeout=0.5)
                return {"backend": "redis", "event": event}
            except Exception:
                self._redis = None

        return {"backend": "memory", "event": event}

    async def generate_event(self) -> dict[str, Any]:
        event = self._simulate_event()
        result = await self.publish_event(event)
        return result["event"]

    async def start_simulator(self, interval_seconds: float = 2.0) -> None:
        if self._generator_task and not self._generator_task.done():
            return

        async def _run() -> None:
            while True:
                try:
                    await self.generate_event()
                except Exception:
                    pass
                await asyncio.sleep(interval_seconds)

        self._generator_task = asyncio.create_task(_run())

    async def stop_simulator(self) -> None:
        if self._generator_task and not self._generator_task.done():
            self._generator_task.cancel()
            try:
                await self._generator_task
            except asyncio.CancelledError:
                pass
        self._generator_task = None

    async def get_recent_events(self, limit: int = 50) -> list[dict[str, Any]]:
        redis_client = await self._get_redis()
        if redis_client is not None:
            try:
                raw_items = await asyncio.wait_for(
                    redis_client.lrange(self.redis_key, 0, max(0, limit - 1)),
                    timeout=0.5,
                )
                events: list[dict[str, Any]] = []
                for item in raw_items:
                    try:
                        events.append(json.loads(item))
                    except json.JSONDecodeError:
                        continue
                return events
            except Exception:
                self._redis = None

        return self.memory_queue.recent(limit=limit)

    async def get_total_events(self) -> int:
        redis_client = await self._get_redis()
        if redis_client is not None:
            try:
                value = await asyncio.wait_for(redis_client.get(self.redis_total_key), timeout=0.5)
                if value is None:
                    return 0
                return int(value)
            except Exception:
                self._redis = None

        return self._published_events_total

    async def health(self) -> dict[str, str]:
        redis_client = await self._get_redis()
        if redis_client is not None:
            return {"queue_backend": "redis"}
        return {"queue_backend": "memory"}


_streamer_singleton: EventStreamer | None = None


def get_streamer() -> EventStreamer:
    global _streamer_singleton
    if _streamer_singleton is None:
        _streamer_singleton = EventStreamer()
    return _streamer_singleton
