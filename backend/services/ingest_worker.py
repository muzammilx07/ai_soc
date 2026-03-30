from __future__ import annotations

import asyncio
import importlib
import json
from datetime import datetime, timezone
from typing import Any

from backend.config import settings
from backend.database import SessionLocal, init_db
from backend.models.db_models import Alert, Incident
from backend.services.detector import get_detector
from backend.services.ingestion import normalize_event
from backend.services.mitre_mapper import map_to_mitre
from backend.services.realtime_stream import get_realtime_stream_hub
from backend.services.streamer import get_streamer
from backend.utils import get_logger


logger = get_logger("ingest_worker")
aioredis = None


def _fallback_severity(event_type: str) -> tuple[str, float]:
    key = event_type.lower()
    if key in {"ddos", "dos", "botnet", "infiltration"}:
        return "critical", 0.92
    if key in {"webattack", "bruteforce", "portscan"}:
        return "high", 0.81
    if key in {"suspicious", "unknown"}:
        return "medium", 0.62
    return "low", 0.55


class IngestionWorker:
    def __init__(self) -> None:
        self._task: asyncio.Task[Any] | None = None
        self._running = False
        self._detector_degraded_logged = False

    async def _get_redis(self) -> Any:
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
                socket_connect_timeout=0.5,
                socket_timeout=0.5,
            )
            await asyncio.wait_for(client.ping(), timeout=0.5)
            return client
        except Exception:
            return None

    @staticmethod
    def _build_detection_payload(event: dict[str, Any]) -> dict[str, Any]:
        metadata = event.get("metadata", {})
        payload = dict(metadata) if isinstance(metadata, dict) else {}
        payload.setdefault("event_type", event.get("event_type"))
        payload.setdefault("ip", event.get("ip"))
        payload.setdefault("user", event.get("user"))
        return payload

    def _run_detection(self, normalized_event: dict[str, Any]) -> dict[str, Any]:
        detection_payload = self._build_detection_payload(normalized_event)
        attack_type = str(normalized_event.get("event_type") or "unknown")
        severity, confidence = _fallback_severity(attack_type)

        try:
            detector = get_detector()
            result = detector.predict_from_features(detection_payload)
            prediction = result.get("prediction", {})
            attack_type = str(prediction.get("attack_type") or attack_type)
            severity = str(prediction.get("severity") or severity).lower()
            confidence = float(prediction.get("confidence") or confidence)
        except Exception as exc:
            if not self._detector_degraded_logged:
                logger.warning(
                    "AI detection is unavailable for sparse events; using fallback severity scoring: {}",
                    exc,
                )
                self._detector_degraded_logged = True

        return {
            "prediction": attack_type,
            "severity": severity,
            "confidence": confidence,
        }

    @staticmethod
    def _enrich_with_mitre(detection: dict[str, Any]) -> dict[str, str]:
        return map_to_mitre(str(detection.get("prediction") or "Unknown"))

    @staticmethod
    async def _create_alert(
        normalized_event: dict[str, Any],
        detection: dict[str, Any],
        mitre: dict[str, str],
    ) -> int:
        description_payload = {
            "source": normalized_event.get("source"),
            "user": normalized_event.get("user"),
            "mitre": mitre,
            "metadata": normalized_event.get("metadata", {}),
        }

        destination_ip = None
        metadata = normalized_event.get("metadata")
        if isinstance(metadata, dict):
            destination_ip = metadata.get("destination_ip") or metadata.get("dst_ip")

        async with SessionLocal() as session:
            alert = Alert(
                instance_id=str(normalized_event.get("instance_id") or "default"),
                source_ip=str(normalized_event.get("ip") or "") or None,
                destination_ip=str(destination_ip) if destination_ip else None,
                attack_type=str(detection.get("prediction") or "unknown"),
                severity=str(detection.get("severity") or "low"),
                confidence=float(detection.get("confidence") or 0.0),
                description=json.dumps(description_payload),
                status="open",
            )
            session.add(alert)
            await session.commit()
            await session.refresh(alert)
            return int(alert.id)

    @staticmethod
    async def _create_incident(
        instance_id: str,
        alert_id: int,
        severity: str,
        attack_type: str,
        description: str,
    ) -> int:
        async with SessionLocal() as session:
            incident = Incident(
                instance_id=instance_id,
                alert_id=alert_id,
                title=f"{severity.upper()} incident: {attack_type}",
                description=description,
                severity=severity,
                status="open",
            )
            session.add(incident)
            await session.commit()
            await session.refresh(incident)
            return int(incident.id)

    @staticmethod
    async def _publish_live_update(
        normalized_event: dict[str, Any],
        alert: dict[str, Any],
        response: dict[str, Any],
    ) -> None:
        hub = get_realtime_stream_hub()
        instance_id = str(normalized_event.get("instance_id") or "default")
        message = {
            "type": "soc_update",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "instance_id": instance_id,
            "event": normalized_event,
            "alert": alert,
            "response": response,
        }
        await hub.publish(message)

    async def _process_message(self, message: str) -> None:
        try:
            envelope = json.loads(message)
            if not isinstance(envelope, dict):
                return

            instance_id = str(envelope.get("instance_id") or "default")
            source = str(envelope.get("source") or "api")
            raw_event = envelope.get("raw_event")
            if not isinstance(raw_event, dict):
                return

            normalized = normalize_event(raw_event=raw_event, source=source, instance_id=instance_id)

            detection = self._run_detection(normalized)
            mitre = self._enrich_with_mitre(detection)
            alert_id = await self._create_alert(normalized, detection, mitre)
            incident_id: int | None = None
            if str(detection.get("severity") or "").lower() in {"high", "critical"}:
                incident_id = await self._create_incident(
                    instance_id=str(normalized.get("instance_id") or "default"),
                    alert_id=alert_id,
                    severity=str(detection.get("severity") or "high"),
                    attack_type=str(detection.get("prediction") or "unknown"),
                    description=json.dumps(
                        {
                            "source": normalized.get("source"),
                            "mitre": mitre,
                            "metadata": normalized.get("metadata", {}),
                        }
                    ),
                )

            normalized["detection"] = {
                "attack_type": detection["prediction"],
                "severity": detection["severity"],
                "confidence": detection["confidence"],
                "mitre": mitre,
            }
            alert_payload = {"id": alert_id, "status": "created", "severity": detection["severity"]}
            response_payload = {
                "action": "alert_incident_created" if incident_id is not None else "alert_created",
                "status": "success",
                "detail": (
                    f"alert_id={alert_id},incident_id={incident_id}"
                    if incident_id is not None
                    else f"alert_id={alert_id}"
                ),
            }
            normalized["alert"] = alert_payload
            if incident_id is not None:
                normalized["incident"] = {
                    "id": incident_id,
                    "status": "created",
                    "severity": detection["severity"],
                }
            normalized["response"] = response_payload

            streamer = get_streamer()
            await streamer.publish_event(normalized)
            await self._publish_live_update(
                normalized_event=normalized,
                alert=alert_payload,
                response=response_payload,
            )
        except Exception:
            logger.exception("Worker failed while processing ingest event")

    async def process_envelope(self, envelope: dict[str, Any]) -> None:
        if not isinstance(envelope, dict):
            return
        await self._process_message(json.dumps(envelope))

    async def _run(self) -> None:
        logger.info("Ingestion worker started")
        while self._running:
            redis_client = await self._get_redis()
            if redis_client is None:
                await asyncio.sleep(0.5)
                continue

            try:
                item = await asyncio.wait_for(
                    redis_client.brpop(settings.ingest_queue_key, timeout=1),
                    timeout=1.5,
                )
                if not item:
                    continue
                _, payload = item
                await self._process_message(payload)
            except asyncio.TimeoutError:
                continue
            except Exception:
                logger.exception("Worker loop iteration failed")

        logger.info("Ingestion worker stopped")

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        await init_db()
        try:
            get_detector().load()
            logger.info("Detection artifacts loaded for ingestion worker")
        except Exception:
            logger.exception("Failed to preload detector; worker will use lazy load/fallback")
        self._running = True
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._task = None


_ingestion_worker_singleton: IngestionWorker | None = None


def get_ingestion_worker() -> IngestionWorker:
    global _ingestion_worker_singleton
    if _ingestion_worker_singleton is None:
        _ingestion_worker_singleton = IngestionWorker()
    return _ingestion_worker_singleton