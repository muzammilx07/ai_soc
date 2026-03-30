from __future__ import annotations

import asyncio
from typing import Any


class RealtimeStreamHub:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()
        self._lock = asyncio.Lock()

    async def subscribe(self) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=200)
        async with self._lock:
            self._subscribers.add(queue)
        return queue

    async def unsubscribe(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        async with self._lock:
            self._subscribers.discard(queue)

    async def publish(self, message: dict[str, Any]) -> None:
        async with self._lock:
            subscribers = list(self._subscribers)

        for queue in subscribers:
            if queue.full():
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            try:
                queue.put_nowait(message)
            except asyncio.QueueFull:
                # Skip if still full to avoid blocking worker throughput.
                continue


_realtime_hub_singleton: RealtimeStreamHub | None = None


def get_realtime_stream_hub() -> RealtimeStreamHub:
    global _realtime_hub_singleton
    if _realtime_hub_singleton is None:
        _realtime_hub_singleton = RealtimeStreamHub()
    return _realtime_hub_singleton