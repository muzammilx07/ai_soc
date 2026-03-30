from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import APIRouter, Depends, Query

from backend.database import get_db
from backend.models.db_models import Incident
from backend.models.schemas import IncidentRead

router = APIRouter(prefix="/incidents", tags=["incidents"])


@router.get("", response_model=list[IncidentRead])
async def list_incidents(
    db: AsyncSession = Depends(get_db),
    instance_id: str | None = Query(default=None),
) -> list[Incident]:
    query = select(Incident)
    if instance_id:
        query = query.where(Incident.instance_id == instance_id)
    result = await db.execute(query.order_by(Incident.created_at.desc()))
    return list(result.scalars().all())
