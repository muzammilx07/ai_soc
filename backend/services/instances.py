from __future__ import annotations

import secrets
import string

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.db_models import SOCInstance

ALLOWED_INGESTION_MODES = {"upload", "api", "simulation", "hybrid", "disabled", "realtime"}


def _slugify(value: str) -> str:
    cleaned = "".join(ch.lower() if ch.isalnum() else "-" for ch in value.strip())
    compact = "-".join(segment for segment in cleaned.split("-") if segment)
    return compact[:48] or "instance"


def _build_api_key() -> str:
    alphabet = string.ascii_letters + string.digits
    suffix = "".join(secrets.choice(alphabet) for _ in range(24))
    return f"soc_{suffix}"


async def get_instance_by_credentials(
    db: AsyncSession,
    instance_id: str,
    api_key: str,
) -> SOCInstance | None:
    result = await db.execute(
        select(SOCInstance).where(
            SOCInstance.instance_id == instance_id,
            SOCInstance.api_key == api_key,
            SOCInstance.active.is_(True),
        )
    )
    return result.scalar_one_or_none()


async def list_active_instances(db: AsyncSession) -> list[SOCInstance]:
    result = await db.execute(
        select(SOCInstance)
        .where(SOCInstance.active.is_(True))
        .order_by(SOCInstance.instance_id.asc())
    )
    return list(result.scalars().all())


async def create_instance(db: AsyncSession, name: str, ingestion_mode: str) -> SOCInstance:
    mode = ingestion_mode.strip().lower() or "hybrid"
    if mode not in ALLOWED_INGESTION_MODES:
        mode = "hybrid"

    base_id = _slugify(name)
    candidate = base_id
    counter = 1

    while True:
        existing = await db.execute(select(SOCInstance).where(SOCInstance.instance_id == candidate))
        if existing.scalar_one_or_none() is None:
            break
        counter += 1
        candidate = f"{base_id}-{counter}"

    instance = SOCInstance(
        instance_id=candidate,
        name=name.strip(),
        api_key=_build_api_key(),
        ingestion_mode=mode,
        active=True,
    )
    db.add(instance)
    await db.commit()
    await db.refresh(instance)
    return instance


async def delete_instance(db: AsyncSession, instance_id: str) -> bool:
    result = await db.execute(
        select(SOCInstance).where(
            SOCInstance.instance_id == instance_id,
            SOCInstance.active.is_(True),
        )
    )
    instance = result.scalar_one_or_none()
    if instance is None:
        return False

    instance.active = False
    await db.commit()
    return True