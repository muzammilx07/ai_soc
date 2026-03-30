from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import SessionLocal, init_db
from backend.models.db_models import Alert, BlockedIP, Incident, ResponseLog
from backend.utils import get_logger


logger = get_logger("responder")


class IncidentResponder:
    async def _create_alert(
        self,
        db: AsyncSession,
        instance_id: str,
        source_ip: str | None,
        destination_ip: str | None,
        attack_type: str,
        severity: str,
        confidence: float | None,
        description: str | None,
    ) -> Alert:
        alert = Alert(
            instance_id=instance_id,
            source_ip=source_ip,
            destination_ip=destination_ip,
            attack_type=attack_type,
            severity=severity,
            confidence=confidence,
            description=description,
            status="open",
        )
        db.add(alert)
        await db.flush()
        return alert

    async def _create_incident(
        self,
        db: AsyncSession,
        instance_id: str,
        alert_id: int,
        severity: str,
        attack_type: str,
        description: str | None,
    ) -> Incident:
        incident = Incident(
            instance_id=instance_id,
            alert_id=alert_id,
            title=f"{severity.upper()} incident: {attack_type}",
            description=description,
            severity=severity,
            status="open",
        )
        db.add(incident)
        await db.flush()
        return incident

    async def _block_ip_if_needed(
        self,
        db: AsyncSession,
        instance_id: str,
        ip_address: str | None,
        reason: str,
    ) -> tuple[BlockedIP | None, str]:
        if not ip_address:
            return None, "skipped"

        result = await db.execute(
            select(BlockedIP).where(
                BlockedIP.instance_id == instance_id,
                BlockedIP.ip_address == ip_address,
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            if not existing.active:
                existing.active = True
                existing.reason = reason
                await db.flush()
                return existing, "reactivated"
            return existing, "already_blocked"

        blocked = BlockedIP(instance_id=instance_id, ip_address=ip_address, reason=reason, active=True)
        db.add(blocked)
        await db.flush()
        return blocked, "created"

    async def _log_action(
        self,
        db: AsyncSession,
        instance_id: str,
        action: str,
        status: str,
        details: str,
        alert_id: int | None = None,
        incident_id: int | None = None,
    ) -> ResponseLog:
        entry = ResponseLog(
            instance_id=instance_id,
            alert_id=alert_id,
            incident_id=incident_id,
            action=action,
            status=status,
            details=details,
        )
        db.add(entry)
        await db.flush()
        return entry

    async def _send_alert_notification(
        self,
        db: AsyncSession,
        instance_id: str,
        alert_id: int,
        severity: str,
        attack_type: str,
    ) -> ResponseLog:
        return await self._log_action(
            db=db,
            instance_id=instance_id,
            action="send_alert",
            status="sent",
            details=f"SOC alert dispatched for {severity} {attack_type}",
            alert_id=alert_id,
        )

    async def respond(
        self,
        db: AsyncSession,
        detection_result: dict[str, Any],
        instance_id: str = "default",
        source_ip: str | None = None,
        destination_ip: str | None = None,
    ) -> dict[str, Any]:
        try:
            prediction = detection_result.get("prediction", {})
            attack_type = str(prediction.get("attack_type", "Unknown"))
            severity = str(prediction.get("severity", "low")).lower()
            confidence = prediction.get("confidence")
            confidence_float = float(confidence) if confidence is not None else None

            logger.info(
                "Response requested: attack_type={}, severity={}, source_ip={}",
                attack_type,
                severity,
                source_ip,
            )

            description = (
                f"Auto-generated from detector. attack_type={attack_type}, "
                f"severity={severity}, confidence={confidence_float}"
            )

            alert = await self._create_alert(
                db=db,
                instance_id=instance_id,
                source_ip=source_ip,
                destination_ip=destination_ip,
                attack_type=attack_type,
                severity=severity,
                confidence=confidence_float,
                description=description,
            )

            await self._log_action(
                db=db,
                instance_id=instance_id,
                action="create_alert",
                status="success",
                details=f"Alert created with id={alert.id}",
                alert_id=alert.id,
            )

            created_incident: Incident | None = None
            if severity in {"high", "critical"}:
                created_incident = await self._create_incident(
                    db=db,
                    instance_id=instance_id,
                    alert_id=alert.id,
                    severity=severity,
                    attack_type=attack_type,
                    description=description,
                )
                await self._log_action(
                    db=db,
                    instance_id=instance_id,
                    action="create_incident",
                    status="success",
                    details=f"Incident created with id={created_incident.id}",
                    alert_id=alert.id,
                    incident_id=created_incident.id,
                )

            blocked_ip_status = "not_required"
            blocked_ip: BlockedIP | None = None
            if severity == "critical":
                blocked_ip, blocked_ip_status = await self._block_ip_if_needed(
                    db=db,
                    instance_id=instance_id,
                    ip_address=source_ip,
                    reason=f"Critical threat detected: {attack_type}",
                )
                await self._log_action(
                    db=db,
                    instance_id=instance_id,
                    action="block_ip",
                    status=blocked_ip_status,
                    details=f"IP block action result: {blocked_ip_status}",
                    alert_id=alert.id,
                    incident_id=created_incident.id if created_incident else None,
                )

            notification_status = "not_required"
            if severity in {"medium", "high", "critical"}:
                await self._send_alert_notification(
                    db=db,
                    instance_id=instance_id,
                    alert_id=alert.id,
                    severity=severity,
                    attack_type=attack_type,
                )
                notification_status = "sent"

            await db.commit()
            logger.info(
                "Response actions completed: alert_id={}, incident_id={}, block_status={}, notify_status={}",
                alert.id,
                created_incident.id if created_incident else None,
                blocked_ip_status,
                notification_status,
            )

            return {
                "instance_id": instance_id,
                "alert_id": alert.id,
                "incident_id": created_incident.id if created_incident else None,
                "blocked_ip": blocked_ip.ip_address if blocked_ip else None,
                "blocked_ip_status": blocked_ip_status,
                "notification_status": notification_status,
                "severity": severity,
                "attack_type": attack_type,
            }
        except Exception:
            logger.exception("Response workflow failed")
            await db.rollback()
            raise


_responder_singleton: IncidentResponder | None = None


def get_responder() -> IncidentResponder:
    global _responder_singleton
    if _responder_singleton is None:
        _responder_singleton = IncidentResponder()
    return _responder_singleton


async def respond_with_new_session(
    detection_result: dict[str, Any],
    instance_id: str = "default",
    source_ip: str | None = None,
    destination_ip: str | None = None,
) -> dict[str, Any]:
    await init_db()
    responder = get_responder()
    async with SessionLocal() as session:
        return await responder.respond(
            db=session,
            detection_result=detection_result,
            instance_id=instance_id,
            source_ip=source_ip,
            destination_ip=destination_ip,
        )
